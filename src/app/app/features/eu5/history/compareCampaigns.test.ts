import { beforeEach, expect, it, vi } from "vitest";
import type { ImportOptions } from "@/features/campaign/analysis/importScheduler";
import type { Eu5Snapshot, Eu5SnapshotDescriptor } from "./analysisTypes";
import type { Snapshot, SnapshotMetadata } from "./types";
import { useHistory } from "./store";
const mocks = vi.hoisted(() => ({ importBatch: vi.fn() }));
vi.mock("@/features/campaign/analysis/importScheduler", () => ({ importBatch: mocks.importBatch }));
vi.mock("./analysisClient", () => ({ eu5Analysis: { claim: () => {} } }));
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
  mocks.importBatch.mockReset();
  useHistory.setState({
    snapshots: [],
    sources: {},
    progress: null,
    cancel: null,
    analysisEnabledCampaigns: [],
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
const descriptor = (campaignId: string, id: string): Eu5SnapshotDescriptor => ({
  id,
  campaignId,
  contentHash: id,
  date: "1500-01-01",
  dateSort: 15000101,
  game: "eu5",
  gameVersion: "1.4.0",
  artifacts: [],
  layoutKey: "layout",
  world: { countryCount: 0, locationCount: 0, totalPopulation: 0 },
});

it("filters previously analyzed files and preserves the active campaign", async () => {
  const file = new File(["known"], "known.eu5", { lastModified: 1 });
  useHistory
    .getState()
    .add(
      [descriptor("current", "known")],
      { original: { snapshotId: "known", version: { size: file.size, lastModified: 1 } } },
      { known: file.name },
    );
  mocks.importBatch.mockImplementation(
    async (
      files: File[],
      _adapter,
      _sink,
      options: ImportOptions<Eu5SnapshotDescriptor, Eu5Snapshot>,
    ) => {
      expect(files.map((f) => f.name)).toEqual(["new.eu5"]);
      const other = descriptor("other", "new");
      options.onFileComplete({ status: "accepted", descriptor: other, file: files[0] });
      return { failures: [], memoryFull: null };
    },
  );
  const result = await importComparison([file, new File(["new"], "new.eu5")], "current");
  expect(result).toEqual({ campaigns: ["other"], skipped: 1, errors: 0 });
  expect(useHistory.getState().snapshots.map((s) => s.id)).toEqual(["known", "new"]);
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual(["other"]);
  expect(useHistory.getState().progress).toBeNull();
});
it("does not start a second import while another analysis is running", async () => {
  useHistory.setState({ progress: { completed: 0, total: 1, startedAt: 0 } });
  await expect(importComparison([], "current")).rejects.toThrow("Wait for the current analysis");
  expect(mocks.importBatch).not.toHaveBeenCalled();
});
