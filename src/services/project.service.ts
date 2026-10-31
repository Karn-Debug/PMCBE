import { db } from "../config/database.js";
import { projectSchema } from "../validators/project.schema.js";
import type { Actor } from "../types/context.js";
import { audit } from "./audit.service.js";
import { HttpError } from "../utils/http-error.js";
import type { Prisma } from "../generated/prisma/client.js";
const include = { coordinators: { orderBy: { position: "asc" as const } } };
type ProjectWithCoordinators = Prisma.ProjectGetPayload<{
  include: typeof include;
}>;
export function projectDto(project: ProjectWithCoordinators) {
  return {
    ...project,
    coordinators: project.coordinators.map(({ name, mobile }) => ({
      name,
      mobile,
    })),
  };
}
export async function listProjects(organizationId: string) {
  return (
    await db.project.findMany({
      where: { organizationId, archived: false },
      include,
      orderBy: { createdAt: "asc" },
    })
  ).map(projectDto);
}
export async function createProject(actor: Actor, body: unknown) {
  const { coordinators, ...input } = projectSchema.parse(body);
  return db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        ...input,
        organizationId: actor.organizationId,
        coordinators: {
          create: coordinators.map((c, position) => ({ ...c, position })),
        },
      },
      include,
    });
    await audit(tx, actor, "created", "projects", project.id, project.name);
    return projectDto(project);
  });
}
export async function updateProject(
  actor: Actor,
  id: string,
  expected: number,
  body: unknown,
) {
  const { coordinators, ...input } = projectSchema.parse(body);
  return db.$transaction(async (tx) => {
    const changed = await tx.project.updateMany({
      where: {
        id,
        organizationId: actor.organizationId,
        version: expected,
        archived: false,
      },
      data: { ...input, version: { increment: 1 } },
    });
    if (!changed.count)
      throw new HttpError(409, "Project changed. Refresh before saving.");
    await tx.projectCoordinator.deleteMany({
      where: { projectId: id, position: { gte: coordinators.length } },
    });
    for (const [position, entry] of coordinators.entries())
      await tx.projectCoordinator.upsert({
        where: { projectId_position: { projectId: id, position } },
        create: { ...entry, projectId: id, position },
        update: entry,
      });
    await audit(tx, actor, "updated", "projects", id, input.name);
    return projectDto(
      await tx.project.findUniqueOrThrow({ where: { id }, include }),
    );
  });
}
