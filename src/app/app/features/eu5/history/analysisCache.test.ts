import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  compiledCacheKey,
  readCompiledAnalysis,
  writeCompiledAnalysis,
  compiledCacheStatus,
} from "./analysisCache";
import type { SaveAnalysis } from "./analysisTypes";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
it("keys identical file contents identically even after renaming with the same source version", async () => {
  const a = new File(["same save"], "first.eu5", { lastModified: 1 }),
    b = new File(["same save"], "renamed.eu5", { lastModified: 1 });
  expect(await compiledCacheKey(a, "assets-v1")).toBe(await compiledCacheKey(b, "assets-v1"));
});
it("invalidates compiled data when source bytes or the compiler/asset revision changes", async () => {
  const a = new File(["aaaa"], "same.eu5", { lastModified: 1 }),
    b = new File(["aaba"], "same.eu5", { lastModified: 1 });
  expect(await compiledCacheKey(a, "v1")).not.toBe(await compiledCacheKey(b, "v1"));
  expect(await compiledCacheKey(a, "v1")).not.toBe(await compiledCacheKey(a, "v2"));
});
it("checks at most 192 KiB instead of rereading the full save", async () => {
  const a = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.eu5");
  const read = vi.spyOn(a, "arrayBuffer"),
    slice = vi.spyOn(a, "slice"),
    progress = vi.fn();
  await compiledCacheKey(a, "v1", progress);
  expect(read).not.toHaveBeenCalled();
  expect(slice).toHaveBeenCalledTimes(3);
  expect(progress).toHaveBeenLastCalledWith(100);
  expect(slice.mock.calls.every(([start, end]) => Number(end) - Number(start) <= 64 * 1024)).toBe(
    true,
  );
});
it("invalidates a replaced save with changed file version or guarded contents", async () => {
  const bytes = new Uint8Array(9 * 1024 * 1024);
  const a = new File([bytes], "same.eu5", { lastModified: 1 });
  bytes[Math.floor(bytes.length / 2)] = 1;
  const b = new File([bytes], "same.eu5", { lastModified: 1 });
  expect(await compiledCacheKey(a, "v1")).not.toBe(await compiledCacheKey(b, "v1"));
});
it("degrades cleanly when persistent storage is unavailable", async () => {
  vi.stubGlobal("indexedDB", undefined);
  expect(await readCompiledAnalysis("missing")).toBeUndefined();
  expect(await writeCompiledAnalysis("entry", {} as SaveAnalysis)).toBe(false);
  expect(await compiledCacheStatus()).toEqual({ available: false, count: 0, bytes: 0 });
});

it("invalidates the source-version index when the file modification time changes", async () => {
  const a = new File(["same"], "save.eu5", { lastModified: 1 }),
    b = new File(["same"], "save.eu5", { lastModified: 2 });
  expect(await compiledCacheKey(a, "v1")).not.toBe(await compiledCacheKey(b, "v1"));
});
