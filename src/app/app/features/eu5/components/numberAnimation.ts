/** Digits count in the direction of the whole value, wrapping at 0/9. */
export function digitSequence(from: string, to: string, trend: number): string[] {
  if (!/^\d$/.test(from) || !/^\d$/.test(to)) return [from, to];
  const result = [from],
    direction = trend < 0 ? -1 : 1;
  let digit = Number(from);
  while (digit !== Number(to)) {
    digit = (digit + direction + 10) % 10;
    result.push(String(digit));
  }
  return result;
}
/** Complete before the next saved observation instead of queuing long transitions. */
export function numberAnimationDuration(speed = 1) {
  const safe = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return Math.max(35, Math.min(300, (500 / safe) * 0.65));
}
