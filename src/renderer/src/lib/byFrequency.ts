// The distinct values, most frequent first; equally frequent ones in order of first appearance.
export function byFrequency(values: Iterable<string>): string[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!)
}
