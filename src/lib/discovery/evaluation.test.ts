import { expect, it } from "vitest";
import { evaluationReport } from "./evaluation";
it("reports missed useful work and accepted noise independently per lane", () => {
  const report = evaluationReport([
    { id: "a", lane: "contracts", expected: true, predicted: true },
    { id: "b", lane: "contracts", expected: true, predicted: false },
    { id: "c", lane: "contracts", expected: false, predicted: true },
    { id: "d", lane: "projects", expected: false, predicted: false },
  ]);
  expect(report.lanes.contracts).toMatchObject({ precision: .5, recall: .5, tp: 1, fp: 1, fn: 1 });
  expect(report.lanes.projects.precision).toBeNull();
  expect(report.lanes.projects.recall).toBeNull();
});
