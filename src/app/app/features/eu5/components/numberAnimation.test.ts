import { expect, it } from "vitest";
import { digitSequence, numberAnimationDuration } from "./numberAnimation";
it("counts forward and backward through intermediate digits", () => {
  expect(digitSequence("2", "7", 1)).toEqual(["2", "3", "4", "5", "6", "7"]);
  expect(digitSequence("9", "4", -1)).toEqual(["9", "8", "7", "6", "5", "4"]);
});
it("wraps in the whole value's direction through zero and nine", () => {
  expect(digitSequence("9", "2", 1)).toEqual(["9", "0", "1", "2"]);
  expect(digitSequence("0", "8", -1)).toEqual(["0", "9", "8"]);
  expect(digitSequence("4", "4", 1)).toEqual(["4"]);
});
it("shortens transitions as saved-date playback speeds up", () => {
  for (const speed of [0.25, 1, 2, 4, 8])
    expect(numberAnimationDuration(speed)).toBeLessThan(500 / speed);
  expect(numberAnimationDuration(8)).toBeLessThan(numberAnimationDuration(4));
  expect(numberAnimationDuration(4)).toBeLessThan(numberAnimationDuration(1));
  expect(numberAnimationDuration(0)).toBe(numberAnimationDuration(1));
  expect(numberAnimationDuration(NaN)).toBe(numberAnimationDuration(1));
});
