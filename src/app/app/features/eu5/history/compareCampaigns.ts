import { fileVersion, sameFileVersion } from "@/features/campaign/types";
import { importTimeline } from "./importSnapshots";
import { useHistory } from "./store";
import type { Snapshot } from "./types";

export type ComparisonAxis = "date" | "elapsed";
export function comparisonPoints(
  dates: Snapshot[],
  values: (number | null)[],
  axis: ComparisonAxis,
): [number, number | null][] {
  const start = Date.parse(`${dates[0]?.date}T00:00:00Z`);
  return dates.map((date, index) => {
    const time = Date.parse(`${date.date}T00:00:00Z`);
    return [axis === "date" ? time : (time - start) / (365.2425 * 86400000), values[index] ?? null];
  });
}

/** Import comparison observations without changing the open save or navigation registry. */
export async function importComparison(files: File[], currentCampaign: string) {
  const state = useHistory.getState();
  if (state.progress) throw Error("Wait for the current analysis to finish.");
  if (files.length > 1000) throw Error("Select at most 1000 saves at a time.");
  const known = new Map(state.snapshots.map((snapshot) => [snapshot.hash, snapshot]));
  const seen = new Set(known.keys());
  const sources = Object.values(state.sources);
  const candidates = files.filter(
    (file) =>
      !sources.some(
        (source) =>
          known.get(source.hash)?.fileName === file.name && sameFileVersion(source.version, file),
      ),
  );
  const controller = new AbortController();
  const startedAt = performance.now();
  const campaigns = new Set<string>();
  let skipped = files.length - candidates.length;
  useHistory.setState({
    progress: { completed: 0, total: candidates.length, startedAt },
    cancel: () => controller.abort(),
    issues: [],
  });
  try {
    const result = await importTimeline(candidates, {
      signal: controller.signal,
      acceptObservation: (observation) => {
        if (observation.campaignId === currentCampaign || seen.has(observation.hash)) {
          skipped++;
          return false;
        }
        seen.add(observation.hash);
        return true;
      },
      onSnapshots: (snapshots, imported) => {
        useHistory
          .getState()
          .add(
            snapshots,
            Object.fromEntries(
              imported.map(({ snapshot, file }) => [
                `comparison:${snapshot.hash}`,
                { hash: snapshot.hash, version: fileVersion(file) },
              ]),
            ),
          );
        for (const snapshot of snapshots) {
          campaigns.add(snapshot.campaignId);
          useHistory.setState((state) => ({
            analysisEnabledCampaigns: [
              ...new Set([...state.analysisEnabledCampaigns, snapshot.campaignId]),
            ],
          }));
        }
      },
      onProgress: (completed, total, fileName, phase) =>
        useHistory.setState({
          progress: { completed, total, fileName, phase, startedAt },
        }),
    });
    useHistory.setState({
      issues: result.errors.map((error) => `${error.fileName}: ${error.error}`),
    });
    return { campaigns: [...campaigns], skipped, errors: result.errors.length };
  } finally {
    useHistory.setState({ progress: null, cancel: null });
  }
}
