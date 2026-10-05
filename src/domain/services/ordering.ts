/**
 * Priority ordering used everywhere a list is shown or printed:
 * vendors on a bill, categories within a vendor, products within a category,
 * routes, and customers within a route. Ties fall back to the name so the
 * order is always deterministic.
 */
export function compareByPriority<T>(getName: (item: T) => string, getPriority: (item: T) => number) {
  return (a: T, b: T): number =>
    getPriority(a) - getPriority(b) || getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' });
}

export function sortByPriority<T extends { priority: number }>(items: readonly T[], getName: (item: T) => string): T[] {
  return [...items].sort(compareByPriority(getName, (item) => item.priority));
}

/** Case- and whitespace-insensitive comparison key for duplicate checks. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
