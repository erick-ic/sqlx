import { parseChallengeCatalog } from "./challenge-config";
import { stripSqlComments } from "./judge-core";
import type { SqlChallenge } from "./types";

// A release marker prevents later user deletions from being undone on reload.
export const FEISHU_UPDATE_STORAGE_KEY = "sql-practice:v1:catalog-update:feishu-2026-09-30";
export const CHAPTER_UPDATE_STORAGE_KEY = "sql-practice:v1:catalog-update:feishu-chapters-2026-09-30";

export function addMissingQualityChecks(catalog: SqlChallenge[], defaults: SqlChallenge[]) {
  const checks = new Map(defaults.map((item) => [item.id, item.qualityChecks]));
  let changed = 0;
  const updated = catalog.map((item) => {
    const qualityChecks = checks.get(item.id);
    if (item.qualityChecks.length || !qualityChecks?.length) return item;
    changed += 1;
    return { ...item, qualityChecks };
  });
  return { catalog: parseChallengeCatalog(updated), changed };
}

export function updateGenericStarterSql(catalog: SqlChallenge[], defaults: SqlChallenge[]) {
  const starters = new Map(defaults.filter((item) => item.id.startsWith("feishu-")).map((item) => [item.id, item.starterSql]));
  let changed = 0;
  const updated = catalog.map((item) => {
    const starterSql = starters.get(item.id);
    // Only replace the previous generated template, preserving custom starters.
    if (!starterSql || !/^-- 请按题目要求补全查询\s+SELECT \*\s+FROM (user_profile|question_practice_detail|user_submit|daily_profits);\s*$/.test(item.starterSql)) return item;
    changed += 1;
    return { ...item, starterSql };
  });
  return { catalog: parseChallengeCatalog(updated), changed };
}

export function removeStarterComments(catalog: SqlChallenge[]) {
  let changed = 0;
  const updated = catalog.map((item) => {
    const starterSql = stripSqlComments(item.starterSql).trim();
    if (starterSql === item.starterSql || !starterSql) return item;
    changed += 1;
    return { ...item, starterSql };
  });
  return { catalog: parseChallengeCatalog(updated), changed };
}

export function updateFeishuChapters(catalog: SqlChallenge[], defaults: SqlChallenge[]) {
  const chapters = new Map(defaults.filter((item) => item.id.startsWith("feishu-")).map((item) => [item.id, item.chapter]));
  let changed = 0;
  const updated = catalog.map((item) => {
    const chapter = chapters.get(item.id);
    // Preserve user-assigned chapters and never reintroduce deleted questions.
    if (!chapter || item.chapter !== "飞书实战用例") return item;
    changed += 1;
    return { ...item, chapter };
  });
  return { catalog: parseChallengeCatalog(updated), changed };
}

export function appendMissingChallenges(catalog: SqlChallenge[], additions: SqlChallenge[]) {
  const ids = new Set(catalog.map((challenge) => challenge.id));
  const numbers = new Set(catalog.map((challenge) => challenge.number));
  let nextNumber = Math.max(0, ...numbers);
  const missing = additions.filter((challenge) => !ids.has(challenge.id)).map((challenge) => {
    let number = challenge.number;
    if (numbers.has(number)) {
      do { nextNumber += 1; } while (numbers.has(nextNumber));
      number = nextNumber;
    }
    numbers.add(number);
    nextNumber = Math.max(nextNumber, number);
    return { ...challenge, number };
  });
  return { catalog: parseChallengeCatalog([...catalog, ...missing]), added: missing.length };
}
