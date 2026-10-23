export { cn } from "cn"

// Merges polled pages that may overlap: a later duplicate replaces the earlier row in place.
export function uniqueBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  return [...new Map(items.map(item => [key(item), item] as const)).values()];
}
