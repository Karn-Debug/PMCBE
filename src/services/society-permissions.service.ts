import { z } from "zod";
import { HttpError } from "../utils/http-error.js";

const searchField = z.string().trim().max(300).optional();
const searchFilters = z
  .object({
    ctsNo: searchField,
    projectNo: searchField,
    applicantName: searchField,
    architect: searchField,
    divisionVillage: searchField,
    roadName: searchField,
    ward: searchField,
    plotNo: searchField,
    sacNo: searchField,
  })
  .strict()
  .refine(
    (input) => Object.values(input).some(Boolean),
    "Enter a CTS number or another search field.",
  );

const projectMatch = z.object({
  projectNo: z.string().trim().nullish(),
  ctsNo: z.string().nullish(),
  ward: z.string().nullish(),
  zone: z.string().nullish(),
  divisionVillage: z.string().nullish(),
  applicantName: z.string().nullish(),
  architect: z.string().nullish(),
  roadName: z.string().nullish(),
  plotNo: z.string().nullish(),
  status: z.string().nullish(),
});
const matchesResponse = z.object({
  result: z.object({
    records: z.array(projectMatch),
    totalRecords: z.number(),
  }),
});

async function readService(url: URL, service: string, init: RequestInit = {}) {
  const signal = AbortSignal.timeout(55000);
  try {
    const response = await fetch(url, { ...init, signal, redirect: "error" });
    if (response.status === 404)
      throw new HttpError(404, service + " has no record for this proposal.");
    if (!response.ok)
      throw new HttpError(502, service + " could not complete this request.");
    const payload = await response.json();
    if (!payload || payload.success === false)
      throw new HttpError(502, service + " returned an unsuccessful response.");
    return payload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (signal.aborted)
      throw new HttpError(504, service + " timed out. Try again.");
    throw new HttpError(502, service + " is unavailable. Try again.");
  }
}

export async function searchCitizenProjects(input: unknown) {
  const filters = searchFilters.parse(input);
  const payload = await readService(
    new URL("https://citizen-search.vercel.app/api/citizen-search"),
    "Citizen Search",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...filters,
        details: false,
        maxDetailRecords: 3,
        fileMode: "onDemand",
      }),
    },
  );
  const parsed = matchesResponse.safeParse(payload);
  if (!parsed.success)
    throw new HttpError(502, "Citizen Search returned an unreadable result.");
  return {
    ...parsed.data.result,
    records: parsed.data.result.records.filter((row) => row.projectNo?.trim()),
  };
}

export async function getProposalData(
  resource: "search-projects" | "permissions",
  proposal: string | null,
) {
  if (!proposal)
    throw new HttpError(409, "Select a proposal for this society first.");
  const key = process.env.BATMAN_SECURITY_KEY?.trim();
  if (!key)
    throw new HttpError(
      503,
      "The project permissions service is not configured.",
    );
  const url = new URL("/project/" + resource, "https://api.dev.batman.co.in");
  url.searchParams.set("security_key", key);
  url.searchParams.set("proposal_no", proposal);
  const payload = await readService(url, "Project permissions service", {
    headers: { Accept: "application/json" },
  });
  const data = payload.data;
  if (!data || (resource === "permissions" && !Array.isArray(data.groups)))
    throw new HttpError(
      502,
      "The project permissions service returned an unreadable record.",
    );
  return data;
}
