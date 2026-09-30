import { parseChallengeCatalog } from "./challenge-config";
import type { SqlChallenge } from "./types";

export const MAX_CATALOG_BYTES = 5 * 1024 * 1024;

export function exportCatalog(catalog: SqlChallenge[]): string {
  return JSON.stringify({
    format: "sql-practice-catalog", version: 2,
    exportedAt: new Date().toISOString(),
    challenges: parseChallengeCatalog(catalog),
  }, null, 2);
}

/** Import the whole catalog, never a standalone challenge object. */
export function importCatalog(source: string): SqlChallenge[] {
  if (new TextEncoder().encode(source).byteLength > MAX_CATALOG_BYTES) throw new Error("题库文件不能超过 5 MB。");
  let value: unknown;
  try { value = JSON.parse(source.replace(/^\uFEFF/, "")); }
  catch { throw new Error("无法读取 JSON，请选择导出的题库文件。"); }
  // Accept legacy complete-catalog arrays as well as the versioned export format.
  if (Array.isArray(value)) return parseChallengeCatalog(value);
  if (!value || typeof value !== "object") throw new Error("请选择完整题库文件，不支持单题导入。");
  const bundle = value as Record<string, unknown>;
  if (bundle.format !== "sql-practice-catalog") throw new Error("请选择完整题库文件，不支持单题导入。");
  if (bundle.version !== 1 && bundle.version !== 2) throw new Error("不支持此题库文件版本。");
  return parseChallengeCatalog(bundle.challenges);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Keep learning state only where the imported challenge is unchanged. */
export function unchangedChallengeIds(current: SqlChallenge[], incoming: SqlChallenge[]) {
  // Automatically derived table descriptions do not change a question or its answers.
  const content = (c: SqlChallenge) => canonical({ ...c, dataSource: { setupSql: c.dataSource.setupSql } });
  const originals = new Map(current.map((c) => [c.id, content(c)]));
  return new Set(incoming.filter((c) => originals.get(c.id) === content(c)).map((c) => c.id));
}
