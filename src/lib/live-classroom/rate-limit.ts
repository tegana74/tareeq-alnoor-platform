const tracker = new Map<string, number[]>();

export function checkRateLimit(userId: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = tracker.get(userId) || [];
  const validTimestamps = timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= limit) {
    return false;
  }

  validTimestamps.push(now);
  tracker.set(userId, validTimestamps);
  return true;
}
