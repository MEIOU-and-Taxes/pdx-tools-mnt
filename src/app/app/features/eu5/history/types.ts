import type { SaveSnapshot } from "@/wasm/wasm_eu5";
export type Snapshot = SaveSnapshot & {
  hash: string;
  fileName: string;
  marketLabels: Record<string, string>;
};
export type SnapshotMetadata = Pick<
  Snapshot,
  "hash" | "date" | "dateSort" | "version" | "campaignId"
>;
