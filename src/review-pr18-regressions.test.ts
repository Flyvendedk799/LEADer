import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireOwnerId: vi.fn(), db: { discoveryCandidate: { count: vi.fn(), findMany: vi.fn() }, task: { count: vi.fn() } } }));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/auth")>(), requireOwnerId: mocks.requireOwnerId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
import { GET } from "./app/api/nav/counts/route";
import { taskWorkspaceWhere } from "./lib/tasks/scope";
import { DEFAULT_DISCOVERY_LANES, filterVisibleLaneCandidates } from "./lib/crm/lanes";
beforeEach(() => { vi.resetAllMocks(); mocks.requireOwnerId.mockResolvedValue("owner-1"); mocks.db.task.count.mockResolvedValue(0); mocks.db.discoveryCandidate.count.mockResolvedValue(0); mocks.db.discoveryCandidate.findMany.mockResolvedValue([]); });
it.each(["DK", "GLOBAL"] as const)("uses the same %s workspace scope as the task page for both task counters", async workspace => {
  const response = await GET(new Request(`http://localhost/api/nav/counts?workspace=${workspace}`));
  expect(response.status).toBe(200);
  expect(mocks.db.task.count).toHaveBeenCalledTimes(2);
  for (const [query] of mocks.db.task.count.mock.calls) {
    expect(query.where).toMatchObject({ ownerId: "owner-1", status: "OPEN", ...taskWorkspaceWhere(workspace) });
  }
});
it("does not advertise a recruiting-only candidate that the inbox hides", async () => {
  const candidate = { id: "hidden", ownerId: "owner-1", workspace: "DK", status: "NEW", title: "Developer jobs", description: "Full-time developer jobs.", url: "https://thehub.io/jobs/location/denmark/copenhagen", lane: DEFAULT_DISCOVERY_LANES.find(l => l.slug === "direct-startup-mvp")! };
  const visible = filterVisibleLaneCandidates([candidate]);
  expect(visible).toHaveLength(0);
  mocks.db.discoveryCandidate.count.mockResolvedValue(1);
  mocks.db.discoveryCandidate.findMany.mockResolvedValue([candidate]);
  const response = await GET(new Request("http://localhost/api/nav/counts?workspace=DK"));
  expect((await response.json()).unreviewedLeads).toBe(visible.length);
});
