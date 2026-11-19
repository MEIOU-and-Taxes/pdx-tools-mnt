import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import type { WorldSummary } from "@/wasm/wasm_eu5";
import type { FileVersion } from "@/features/campaign/types";
import { create } from "zustand";
import { compareDescriptors } from "@/features/campaign/analysis/descriptor";
import type { SourceAssociation } from "@/features/campaign/analysis/descriptor";
import type { ImportProgressState } from "./importTiming";
import type { Eu5SnapshotDescriptor } from "./analysisTypes";

export type HistoryDescriptor = Eu5SnapshotDescriptor & {
  hash: string;
  version: string;
  fileName: string;
  world: WorldSummary;
};

export type SourceObservation = SourceAssociation;

type HistoryState = {
  viewedProfiles: ActiveProfileIdentity[];
  setViewedProfiles: (profiles: ActiveProfileIdentity[]) => void;
  remapRevision: number;
  remapViewedProfiles: (profiles: ActiveProfileIdentity[]) => void;
  section: "map" | "debt";
  showSection: (section: "map" | "debt") => void;
  panelOpen: boolean;
  showPanel: (open: boolean) => void;
  analysisUseCache: boolean;
  setAnalysisUseCache: (useCache: boolean) => void;
  analysisWorkers: number;
  setAnalysisWorkers: (workers: number) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  snapshots: HistoryDescriptor[];
  sources: Record<string, SourceAssociation>;
  analyzingEntryIds: readonly string[];
  failedSources: Record<string, { version: FileVersion | null; error: string }>;
  analysisEnabledCampaigns: readonly string[];
  enableAnalysis: (campaignId: string) => void;
  /** The campaigns that do not start imports until the player resumes them. */
  analysisPausedCampaigns: string[];
  pauseAnalysis: (campaignId: string) => void;
  progress: ImportProgressState | null;
  issues: string[];
  cancel: (() => void) | null;
  add: (
    snapshots: Eu5SnapshotDescriptor[],
    sources?: Record<string, SourceAssociation>,
    fileNames?: Record<string, string>,
  ) => void;
  /** Remove the snapshots and the source associations to them. */
  removeSnapshots: (campaignId?: string) => void;
};

export function isAnalysisPaused(
  state: Pick<HistoryState, "analysisPausedCampaigns">,
  playthroughId: string | null | undefined,
) {
  return !!playthroughId && state.analysisPausedCampaigns.includes(playthroughId);
}

/** Historical data only. Campaign navigation owns files and the active save. */
export const useHistory = create<HistoryState>()((set) => ({
  viewedProfiles: [],
  setViewedProfiles: (viewedProfiles) => set({ viewedProfiles }),
  remapRevision: 0,
  remapViewedProfiles: (viewedProfiles) =>
    set((state) => ({ viewedProfiles, remapRevision: state.remapRevision + 1 })),
  section: "map",
  showSection: (section) => set({ section, panelOpen: true }),
  panelOpen: false,
  showPanel: (panelOpen) => set({ panelOpen }),
  analysisUseCache: true,
  setAnalysisUseCache: (analysisUseCache) => set({ analysisUseCache }),
  analysisWorkers: 0,
  setAnalysisWorkers: (analysisWorkers) => set({ analysisWorkers }),
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  snapshots: [],
  sources: {},
  analyzingEntryIds: [],
  failedSources: {},
  analysisEnabledCampaigns: [],
  enableAnalysis: (campaignId) =>
    set((state) => ({
      analysisEnabledCampaigns: [...new Set([...state.analysisEnabledCampaigns, campaignId])],
      analysisPausedCampaigns: state.analysisPausedCampaigns.filter((id) => id !== campaignId),
    })),
  analysisPausedCampaigns: [],
  pauseAnalysis: (campaignId) =>
    set((state) =>
      state.analysisPausedCampaigns.includes(campaignId)
        ? state
        : { analysisPausedCampaigns: [...state.analysisPausedCampaigns, campaignId] },
    ),
  progress: null,
  issues: [],
  cancel: null,
  add: (snapshots, sources = {}, fileNames = {}) =>
    set((state) => {
      const byId = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
      for (const snapshot of snapshots) {
        byId.set(snapshot.id, {
          ...snapshot,
          hash: snapshot.id,
          version: snapshot.gameVersion,
          fileName: fileNames[snapshot.id] ?? byId.get(snapshot.id)?.fileName ?? "",
        });
      }
      const failedSources = { ...state.failedSources };
      for (const id of Object.keys(sources)) delete failedSources[id];
      return {
        failedSources,
        snapshots: [...byId.values()].sort(compareDescriptors),
        sources: { ...state.sources, ...sources },
      };
    }),
  removeSnapshots: (campaignId) =>
    set((state) => {
      if (campaignId === undefined) return { snapshots: [], sources: {} };
      const snapshots = state.snapshots.filter((snapshot) => snapshot.campaignId !== campaignId);
      const ids = new Set(snapshots.map((snapshot) => snapshot.id));
      const sources = Object.fromEntries(
        Object.entries(state.sources).filter(([, source]) => ids.has(source.snapshotId)),
      );
      return { snapshots, sources };
    }),
}));
