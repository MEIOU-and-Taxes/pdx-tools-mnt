import type { SaveAnalysis } from "./analysisTypes";
import { analyticalBuffers } from "./transferBuffers";
import { validateSnapshot } from "./packedSnapshot";

// Change when the packed format changes. Production identities also include the
// content-hashed WASM, token and game-bundle URLs supplied by the parser worker.
export const ANALYSIS_CACHE_SCHEMA = "eu5-compiled-debt-v1";
const DATABASE = "eu5-compiled-analysis";
type CacheMetadata = { key: string; bytes: number; used: number };
let database: Promise<IDBDatabase> | undefined;
function openCache() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(Error("Disk cache unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    const timer = setTimeout(() => reject(Error("Disk cache blocked")), 5000);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("entries");
      request.result.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      clearTimeout(timer);
      reject(Error("Disk cache blocked by another tab"));
    };
  }).catch((error) => {
    database = undefined;
    throw error;
  }));
}
function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function finished(transaction: IDBTransaction) {
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        transaction.abort();
      } catch {}
      reject(Error("Disk cache timed out"));
    }, 15000);
    transaction.oncomplete = () => {
      clearTimeout(timer);
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      clearTimeout(timer);
      reject(transaction.error ?? Error("Disk cache transaction failed"));
    };
  });
  void promise.catch(() => {});
  return promise;
}
const hex = (data: ArrayBuffer) =>
  Array.from(new Uint8Array(data), (v) => v.toString(16).padStart(2, "0")).join("");
/** Fast source-version index, consistent with the viewer's FileVersion contract.
 * Size/mtime changes invalidate it; three 64 KiB guards also catch replacement
 * content without rereading hundreds of megabytes. The compiled entry retains
 * the parser's full content hash. Deliberately preserved metadata and changes
 * outside these guards require Clear cache / a reimport.
 */
export async function compiledCacheKey(
  file: Blob,
  revision: string,
  report?: (percent: number) => void,
) {
  const guard = 64 * 1024;
  const starts = [
    ...new Set([
      0,
      Math.max(0, Math.floor((file.size - guard) / 2)),
      Math.max(0, file.size - guard),
    ]),
  ];
  const parts = await Promise.all(
    starts.map((start) => file.slice(start, start + guard).arrayBuffer()),
  );
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  const sourceDigest = hex(await crypto.subtle.digest("SHA-256", bytes));
  const modified = "lastModified" in file ? file.lastModified : 0;
  report?.(100);
  return `${ANALYSIS_CACHE_SCHEMA}:${hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${revision}:${file.size}:${modified}:${sourceDigest}`)))}`;
}

export async function readCompiledAnalysis(key: string): Promise<SaveAnalysis | undefined> {
  try {
    const db = await openCache();
    const tx = db.transaction(["entries", "metadata"], "readwrite");
    const done = finished(tx);
    const result = (await requestValue(tx.objectStore("entries").get(key))) as
      | SaveAnalysis
      | undefined;
    const metadataRequest = tx.objectStore("metadata").get(key);
    metadataRequest.onsuccess = () => {
      if (metadataRequest.result)
        tx.objectStore("metadata").put({ ...metadataRequest.result, used: Date.now() });
    };
    await done;
    if (!result) return;
    validateSnapshot(result.snapshot);
    if (
      !(result.countryIds instanceof Uint32Array) ||
      result.projection.layoutKey !== result.observation.layoutKey
    )
      return;
    return result;
  } catch {
    return;
  }
}
export function compiledAnalysisBytes(analysis: SaveAnalysis) {
  return (
    analyticalBuffers(analysis).reduce((sum, b) => sum + b.byteLength, 0) +
    JSON.stringify([
      analysis.observation,
      analysis.countryNames,
      analysis.snapshot.debt,
      analysis.snapshot.strings,
      analysis.overviews.strings,
    ]).length *
      2
  );
}
async function cacheBudget() {
  try {
    const estimate = await navigator.storage?.estimate();
    return Math.min(2 * 1024 ** 3, (estimate?.quota ?? 8 * 1024 ** 3) * 0.25);
  } catch {
    return 2 * 1024 ** 3;
  }
}
/** Structured cloning preserves typed arrays; a transaction commits before buffers transfer away. */
export async function writeCompiledAnalysis(key: string, analysis: SaveAnalysis) {
  try {
    const db = await openCache(),
      budget = await cacheBudget(),
      bytes = compiledAnalysisBytes(analysis);
    if (bytes > budget) return false;
    const tx = db.transaction(["entries", "metadata"], "readwrite"),
      done = finished(tx);
    const metadata = tx.objectStore("metadata"),
      entries = tx.objectStore("entries");
    const request = metadata.getAll();
    request.onsuccess = () => {
      const records = (request.result as CacheMetadata[])
        .filter((r) => r.key !== key)
        .sort((a, b) => a.used - b.used);
      let used = records.reduce((n, r) => n + r.bytes, 0);
      while (records.length && used + bytes > budget) {
        const old = records.shift()!;
        entries.delete(old.key);
        metadata.delete(old.key);
        used -= old.bytes;
      }
      entries.put(analysis, key);
      metadata.put({ key, bytes, used: Date.now() });
    };
    await done;
    return true;
  } catch {
    return false;
  }
}
export async function compiledCacheStatus() {
  try {
    const db = await openCache(),
      tx = db.transaction("metadata", "readonly"),
      done = finished(tx);
    const rows = (await requestValue(tx.objectStore("metadata").getAll())) as CacheMetadata[];
    await done;
    return { available: true, count: rows.length, bytes: rows.reduce((n, r) => n + r.bytes, 0) };
  } catch {
    return { available: false, count: 0, bytes: 0 };
  }
}
export async function clearCompiledCache() {
  const db = await openCache(),
    tx = db.transaction(["entries", "metadata"], "readwrite"),
    done = finished(tx);
  tx.objectStore("entries").clear();
  tx.objectStore("metadata").clear();
  await done;
}
