import { fileVersion, sameFileVersion } from "@/features/campaign/types";
import { analysisAdmission } from "@/features/campaign/analysis/admission";
import { importBatch } from "@/features/campaign/analysis/importScheduler";
import { eu5Analysis } from "./analysisClient";
import { parserForImport } from "./parserAdapter";
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
  const lease = analysisAdmission().acquireImport();
  eu5Analysis.claim(currentCampaign);
  const controller = new AbortController();
  const startedAt = performance.now();
  const campaigns = new Set<string>();
  const known = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const sources = Object.values(state.sources);
  const candidates = files.filter(
    (file) =>
      !sources.some(
        (source) =>
          known.get(source.snapshotId)?.fileName === file.name &&
          sameFileVersion(source.version, file),
      ),
  );
  const seen = new Set(known.keys());
  const excluded = new Set<File>();
  const failures: string[] = [];
  useHistory.setState({
    progress: { completed: 0, total: candidates.length, startedAt },
    cancel: () => controller.abort(),
    issues: [],
  });
  try {
    const result = await importBatch(
      candidates,
      parserForImport(state.analysisUseCache),
      eu5Analysis,
      {
        signal: controller.signal,
        lease,
        concurrency: state.analysisWorkers || undefined,
        refuseOutput: ({ descriptor }, file) => {
          if (descriptor.campaignId !== currentCampaign && !seen.has(descriptor.id)) return null;
          excluded.add(file);
          return "Already analyzed, or from the open campaign.";
        },
        onFileComplete: (completion) => {
          if (completion.status === "failed" && !excluded.has(completion.file)) {
            failures.push(`${completion.file.name}: ${completion.error}`);
          }
          if (!("descriptor" in completion)) return;
          const { descriptor } = completion;
          if (completion.status === "duplicate") excluded.add(completion.file);
          seen.add(descriptor.id);
          campaigns.add(descriptor.campaignId);
          const history = useHistory.getState();
          history.add(
            [descriptor],
            {
              [`comparison:${descriptor.id}`]: {
                snapshotId: descriptor.id,
                version: fileVersion(completion.file),
              },
            },
            { [descriptor.id]: completion.file.name },
          );
          history.enableAnalysis(descriptor.campaignId);
        },
        onProgress: ({ completed, total, fileName }) =>
          useHistory.setState({ progress: { completed, total, fileName, startedAt } }),
      },
    );
    useHistory.setState({
      issues: [...failures, ...(result.memoryFull ? [result.memoryFull] : [])],
    });
    return {
      campaigns: [...campaigns],
      skipped: files.length - candidates.length + excluded.size,
      errors: failures.length,
    };
  } finally {
    lease.release();
    useHistory.setState({ progress: null, cancel: null });
  }
}
