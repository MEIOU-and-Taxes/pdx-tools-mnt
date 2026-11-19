import type { OverviewData, Eu5Query } from "@/wasm/wasm_eu5";
import { exportSnapshots } from "./exportSnapshots";
import type { HistoryQuery, AnalysisEntity } from "./analysisTypes";
import type { Snapshot } from "./types";
import { createFrameAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { Eu5AnalysisStore } from "@/wasm/wasm_eu5";
import { useHistory } from "./store";

/** The EU5 analysis session of this tab. */
export const eu5Analysis = createFrameAnalysisWorker<Eu5AnalysisStore>({
  session: "eu5",
  retainCampaigns: true,
  start: () => new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" }),
  // The campaign stays paused, so it does not import again until the player resumes it.
  onFailure: (error, campaignId) => {
    const history = useHistory.getState();
    history.cancel?.();
    history.removeSnapshots();
    if (campaignId) history.pauseAnalysis(campaignId);
    useHistory.setState({ issues: [error.message] });
  },
  // Another game took the session. Its imports stop by themselves.
  onRelease: () => useHistory.getState().removeSnapshots(),
});

export const connectAnalysisFrames = eu5Analysis.connectFrames;

let sequence = 0;
async function read<Q extends Eu5Query>(campaignId: string, query: Q, id?: string) {
  const reply = await eu5Analysis.query({
    campaignId,
    query,
    identity: campaignId,
    sequence: ++sequence,
    ...(id === undefined ? {} : { selection: { kind: "ids" as const, ids: [id] } }),
  });
  if (reply.outcome.status !== "ok") throw new DOMException("Analysis changed", "AbortError");
  return reply.outcome.value;
}

function fileName(id: string) {
  return useHistory.getState().snapshots.find((snapshot) => snapshot.id === id)?.fileName ?? "";
}

async function history(query: HistoryQuery, full: boolean): Promise<Snapshot[]> {
  const rows = await read(query.campaignId, {
    kind: "history",
    country: query.country?.startsWith("id:") ? Number(query.country.slice(3)) : undefined,
    good: query.good,
    centers: query.centers ?? [],
    full,
  });
  return rows.map(({ id, snapshot }) => ({
    ...snapshot,
    countries: snapshot.countries.map((country) => ({
      ...country,
      religions: new Map(Object.entries(country.religions)),
      materials: new Map(Object.entries(country.materials)),
      buildings: new Map(Object.entries(country.buildings)),
    })),
    hash: id,
    fileName: fileName(id),
    marketLabels: Object.fromEntries(
      snapshot.markets.map(({ center, centerName }) => [
        center,
        centerName?.replaceAll("_", " ") || `Location ${center}`,
      ]),
    ),
  }));
}

const queries = {
  queryHistory: (query: HistoryQuery) => history(query, false),
  marketCenters: (campaignId: string, country: string) =>
    read(campaignId, { kind: "marketCenters", country: Number(country.replace(/^id:/, "")) }),
  exportObservations: async (campaignId: string) =>
    exportSnapshots(await history({ campaignId }, true)),
  resolveEntity: async (hash: string, entity: AnalysisEntity) => {
    const snapshot = useHistory.getState().snapshots.find((row) => row.id === hash);
    if (!snapshot) throw Error("This observation is no longer available.");
    if (entity.kind === "country") {
      const id = await read(
        snapshot.campaignId,
        { kind: "countryAtIndex", index: entity.id },
        hash,
      );
      if (!id) throw Error("Country is not present in this observation.");
      return { ...entity, id };
    }
    if (entity.kind === "location") {
      const id = await read(
        snapshot.campaignId,
        { kind: "locationAtIndex", index: entity.id },
        hash,
      );
      if (id === undefined) throw Error("Location is not present in this observation.");
      return { ...entity, id };
    }
    return entity;
  },
};

export function campaignAnalysis() {
  return queries;
}

export async function queryAnalysisOverview<K extends keyof OverviewData>(hash: string, key: K) {
  const snapshot = useHistory.getState().snapshots.find((row) => row.id === hash);
  if (!snapshot) throw Error("This observation is no longer available.");
  const data = await read(snapshot.campaignId, { kind: "overview", key }, hash);
  if (data === undefined || data === null) throw Error("This observation has no overview.");
  return { hash, data: JSON.parse(data) as OverviewData[K] };
}
