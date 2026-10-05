/**
 * A tiny document store persisted to localStorage, used by demo mode only.
 * Holds sample business data — never credentials or tokens.
 */
export type Document = { _id: string } & Record<string, unknown>;
export type Collections = Record<string, Document[]>;

const STORAGE_KEY = 'milkly.demo.v1';

export class LocalDatabase {
  private data: Collections;

  constructor(private readonly seed: () => Collections) {
    this.data = this.load() ?? this.seed();
    this.persist();
  }

  collection<T extends { _id: string }>(name: string): T[] {
    this.data[name] ??= [];
    return this.data[name] as unknown as T[];
  }

  persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or unavailable — demo keeps working in memory */
    }
  }

  reset(): void {
    this.data = this.seed();
    this.persist();
  }

  static clearStored(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignored */
    }
  }

  private load(): Collections | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Collections) : null;
    } catch {
      return null;
    }
  }
}
