export type {
  AnalysisDescriptor as Eu5SnapshotDescriptor,
  AnalysisSnapshot as Eu5Snapshot,
  AnalysisSnapshotData as Eu5SnapshotData,
} from "@/wasm/wasm_eu5";

export type AnalysisEntity = { kind: "country" | "market" | "location"; id: number };
export type HistoryQuery = {
  campaignId: string;
  country?: string;
  good?: string;
  centers?: number[];
};
export type { HistoryDescriptor as AnalysisDescriptor } from "./store";
