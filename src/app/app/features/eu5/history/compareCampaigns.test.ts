import { beforeEach, expect, it, vi } from "vitest";
import type { ImportOptions } from "./importSnapshots";
import type { Snapshot, SnapshotMetadata } from "./types";
import { useHistory } from "./store";
const mocks = vi.hoisted(() => ({ importTimeline: vi.fn() }));
vi.mock("./importSnapshots", () => ({ importTimeline: mocks.importTimeline }));
import { comparisonPoints, importComparison } from "./compareCampaigns";

const snapshot = (campaignId: string, hash: string, date = "1500-01-01") =>
  ({
    campaignId,
    hash,
    date,
    dateSort: Number(date.replaceAll("-", "")),
    fileName: `${hash}.eu5`,
    version: "1.4.0",
    marketLabels: {},
    population: 0,
    development: 0,
  }) as SnapshotMetadata;
beforeEach(() => {
  mocks.importTimeline.mockReset();
  useHistory.setState({
    snapshots: [],
    sources: {},
    progress: null,
    cancel: null,
    analysisEnabledCampaigns: [],
    analysisPaused: true,
    issues: [],
  });
});
it("keeps real calendar dates separate and aligns elapsed time to each campaign's own first save", () => {
  const a = [snapshot("a", "a1", "1500-01-01"), snapshot("a", "a2", "1510-01-01")] as Snapshot[];
  const b = [snapshot("b", "b1", "1650-01-01"), snapshot("b", "b2", "1670-01-01")] as Snapshot[];
  expect(comparisonPoints(a, [10, null], "date")).toEqual([
    [Date.parse("1500-01-01T00:00:00Z"), 10],
    [Date.parse("1510-01-01T00:00:00Z"), null],
  ]);
  expect(comparisonPoints(a, [10, null], "elapsed")[0]).toEqual([0, 10]);
  expect(comparisonPoints(b, [20, 30], "elapsed")[0]).toEqual([0, 20]);
  expect(comparisonPoints(b, [20, 30], "elapsed")[1][0]).toBeCloseTo(20, 1);
  expect(comparisonPoints([], [], "elapsed")).toEqual([]);
});
it("filters known files before parsing and excludes current-campaign and duplicate hashes before publication", async () => {
  const file = new File(["known"], "known.eu5", { lastModified: 1 });
  useHistory.setState({
    snapshots: [snapshot("current", "known")],
    sources: {
      original: { hash: "known", version: { size: file.size, lastModified: 1 } },
    },
  });
  mocks.importTimeline.mockImplementation(async (files: File[], options: ImportOptions) => {
    expect(files.map((f) => f.name)).toEqual(["new.eu5"]);
    expect(options.acceptObservation!(snapshot("current", "different") as never)).toBe(false);
    expect(options.acceptObservation!(snapshot("other", "known") as never)).toBe(false);
    const other = snapshot("other", "new");
    expect(options.acceptObservation!(other as never)).toBe(true);
    expect(options.acceptObservation!(other as never)).toBe(false);
    options.onSnapshots([other], [{ snapshot: other, file: files[0] }]);
    return { errors: [], completed: 1 };
  });
  const result = await importComparison([file, new File(["new"], "new.eu5")], "current");
  expect(result).toEqual({ campaigns: ["other"], skipped: 4, errors: 0 });
  expect(useHistory.getState().snapshots.map((s) => s.hash)).toEqual(["known", "new"]);
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual(["other"]);
  expect(useHistory.getState().analysisPaused).toBe(true);
  expect(useHistory.getState().progress).toBeNull();
  expect(useHistory.getState().cancel).toBeNull();
});
it("preserves completed observations when cancelled and clears the busy state", async () => {
  mocks.importTimeline.mockImplementation(async (files: File[], options: ImportOptions) => {
    const other = snapshot("other", "new");
    options.onSnapshots([other], [{ snapshot: other, file: files[0] }]);
    useHistory.getState().cancel!();
    expect(options.signal.aborted).toBe(true);
    throw new DOMException("Cancelled", "AbortError");
  });
  await expect(importComparison([new File(["new"], "new.eu5")], "current")).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(useHistory.getState().snapshots).toHaveLength(1);
  expect(useHistory.getState().progress).toBeNull();
});
it("does not start a second import while another analysis is running", async () => {
  useHistory.setState({ progress: { completed: 0, total: 1, startedAt: 0 } });
  await expect(importComparison([], "current")).rejects.toThrow("Wait for the current analysis");
  expect(mocks.importTimeline).not.toHaveBeenCalled();
});
