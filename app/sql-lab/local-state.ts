export interface ProgressEntry {
  passed: boolean;
  optimized: boolean;
  passedAt: string;
}
export type ProgressState = Record<string, ProgressEntry>;
export type DraftState = Record<string, string>;
export type Filter = "all" | "todo" | "passed";

function readObject(raw: string | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

export function parseDrafts(raw: string | null): DraftState {
  return Object.fromEntries(Object.entries(readObject(raw)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function parseProgress(raw: string | null): ProgressState {
  return Object.fromEntries(Object.entries(readObject(raw)).filter((entry): entry is [string, ProgressEntry] => {
    const value = entry[1];
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return typeof item.passed === "boolean" && typeof item.optimized === "boolean" && typeof item.passedAt === "string";
  }));
}

export function parsePreferences(raw: string | null): { selectedId?: string; filter: Filter } {
  const value = readObject(raw);
  return {
    selectedId: typeof value.selectedId === "string" ? value.selectedId : undefined,
    filter: value.filter === "todo" || value.filter === "passed" ? value.filter : "all",
  };
}
