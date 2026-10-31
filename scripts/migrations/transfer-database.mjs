import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

// Copies an existing normalized database to a migrated, empty destination.
// No deletes, updates, reseeding, or conflict-overwrites are performed.
const apply = process.argv.includes('--apply');
const targetUrl = process.env.DATABASE_URL;
const sourceUrl = process.env.SOURCE_DATABASE_URL || (process.env.LOCAL_DB_PASSWORD
  ? `postgresql://pmc:${encodeURIComponent(process.env.LOCAL_DB_PASSWORD)}@127.0.0.1:55432/pmc`
  : undefined);
if (!sourceUrl || !targetUrl) throw new Error('Set SOURCE_DATABASE_URL and DATABASE_URL (or LOCAL_DB_PASSWORD for the original local database).');
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const tableName = name => 'public.' + quote(name);
const hash = rows => createHash('sha256').update(rows.slice().sort().join('\n')).digest('hex');
const connect = url => new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, enableChannelBinding: true });
const source = connect(sourceUrl), target = connect(targetUrl);
const stamp = new Date().toISOString().replaceAll(':', '-');
const backupDir = path.resolve('.local/backups', 'database-transfer-' + stamp);
let sourceTransaction = false, targetTransaction = false;

async function tables(client) {
  return (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
}
async function rows(client, name) {
  // Keep raw JSON text: parsing into JavaScript numbers would round decimals.
  return (await client.query(`SELECT to_jsonb(t)::text AS payload FROM ${tableName(name)} t`)).rows.map(row => row.payload);
}
async function history(client) {
  const result = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name');
  if (result.rows.some(row => !row.finished_at || row.rolled_back_at)) throw new Error('Migration history contains an incomplete or rolled-back migration.');
  return result.rows.map(({ migration_name, checksum }) => ({ migration_name, checksum }));
}
async function schema(client) {
  const columns = (await client.query(`SELECT table_name, column_name, ordinal_position, data_type, udt_name, is_nullable,
    column_default, character_maximum_length, numeric_precision, numeric_scale, datetime_precision
    FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations'
    ORDER BY table_name, ordinal_position`)).rows;
  const constraints = (await client.query(`SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND con.contype IN ('p','f','u','c') ORDER BY c.relname, con.conname`)).rows;
  const indexes = (await client.query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
  return { columns, constraints, indexes };
}
try {
  await source.connect(); await target.connect();
  for (const client of [source, target]) await client.query("SET TIME ZONE 'UTC'");
  const identitySql = 'SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port';
  const sourceIdentity = (await source.query(identitySql)).rows[0];
  const targetIdentity = (await target.query(identitySql)).rows[0];
  if (JSON.stringify(sourceIdentity) === JSON.stringify(targetIdentity)) throw new Error('Source and destination must be different databases.');
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); sourceTransaction = true;
  const sourceTables = await tables(source), targetTables = await tables(target);
  if (JSON.stringify(sourceTables) !== JSON.stringify(targetTables)) throw new Error('Table lists differ. Deploy the same Prisma migrations to the destination before transferring.');
  const migrations = await history(source);
  if (JSON.stringify(migrations) !== JSON.stringify(await history(target))) throw new Error('Source and destination migration checksums differ.');
  if (JSON.stringify(await schema(source)) !== JSON.stringify(await schema(target))) throw new Error('Source and destination columns, constraints, or indexes differ.');
  const contents = {}, manifest = [];
  for (const name of sourceTables) {
    contents[name] = await rows(source, name);
    manifest.push({ table: name, rows: contents[name].length, sha256: hash(contents[name]) });
  }
  const dependencies = (await source.query(`SELECT child.relname AS child, parent.relname AS parent FROM pg_constraint fk
    JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_class parent ON parent.oid=fk.confrelid
    JOIN pg_namespace n ON n.oid=child.relnamespace WHERE fk.contype='f' AND n.nspname='public'`)).rows;
  const order = [], pending = new Set(sourceTables);
  while (pending.size) {
    const ready = [...pending].filter(name => !dependencies.some(d => d.child === name && pending.has(d.parent)));
    if (!ready.length) throw new Error('Cyclic relationships require a reviewed transfer plan.');
    for (const name of ready) { order.push(name); pending.delete(name); }
  }
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(path.join(backupDir, 'source.json'), JSON.stringify({ format: 1, capturedAt: stamp, migrations,
    migrationRows: await rows(source, '_prisma_migrations'), schema: await schema(source), order, tables: contents }), { flag: 'wx', mode: 0o600 });
  console.log(`Private source snapshot saved. ${sourceTables.length} application tables; ${manifest.reduce((total, row) => total + row.rows, 0)} rows.`);
  await target.query('BEGIN'); targetTransaction = true;
  await target.query("SET LOCAL lock_timeout = '10s'");
  await target.query('LOCK TABLE ' + sourceTables.map(tableName).join(', ') + ' IN EXCLUSIVE MODE');
  const existing = {};
  for (const name of sourceTables) existing[name] = await rows(target, name);
  const alreadyMatches = manifest.every(item => hash(existing[item.table]) === item.sha256);
  const targetHasData = Object.values(existing).some(value => value.length > 0);
  if (targetHasData && !alreadyMatches) {
    await fs.writeFile(path.join(backupDir, 'destination-before.json'), JSON.stringify({ tables: existing }), { flag: 'wx', mode: 0o600 });
    throw new Error('Destination contains different data. Snapshot saved; nothing overwritten.');
  }
  if (apply && !alreadyMatches) {
    for (const name of order) {
      if (!contents[name].length) continue;
      // PostgreSQL reconstructs bytea, timestamps, enums and decimals directly.
      await target.query(`INSERT INTO ${tableName(name)} SELECT * FROM jsonb_populate_recordset(NULL::${tableName(name)}, $1::jsonb)`, ['[' + contents[name].join(',') + ']']);
    }
  }
  if (apply || alreadyMatches) {
    for (const item of manifest) {
      const actual = await rows(target, item.table);
      if (actual.length !== item.rows || hash(actual) !== item.sha256) throw new Error('Full-row verification failed for ' + item.table);
    }
  }
  await target.query(apply ? 'COMMIT' : 'ROLLBACK'); targetTransaction = false;
  await source.query('COMMIT'); sourceTransaction = false;
  const report = { status: alreadyMatches ? 'already-matches' : apply ? 'transferred-and-verified' : 'ready-to-transfer',
    completedAt: new Date().toISOString(), source: { host: new URL(sourceUrl).hostname, database: new URL(sourceUrl).pathname.slice(1) },
    destination: { host: new URL(targetUrl).hostname, database: new URL(targetUrl).pathname.slice(1) },
    applicationTables: manifest.length, totalRows: manifest.reduce((total, row) => total + row.rows, 0),
    businessRecords: manifest.find(row => row.table === 'Entity')?.rows, backupDirectory: backupDir, tables: manifest };
  await fs.writeFile(path.join(backupDir, 'verification.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  await fs.writeFile('.local/last-database-transfer.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, applicationTables: report.applicationTables, totalRows: report.totalRows, businessRecords: report.businessRecords, backupDirectory: backupDir }));
} catch (error) {
  if (targetTransaction) await target.query('ROLLBACK').catch(() => {});
  if (sourceTransaction) await source.query('ROLLBACK').catch(() => {});
  console.error('Transfer stopped:', String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[connection URL hidden]'));
  process.exitCode = 1;
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
