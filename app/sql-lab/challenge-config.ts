import { validateReadOnlyQuery } from "./judge-core";
import type { SqlChallenge } from "./types";

export const CATALOG_STORAGE_KEY = "sql-practice:v1:catalog";

function requireConfig(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`题目配置：${message}`);
}

function object(value: unknown): Record<string, unknown> {
  requireConfig(value && typeof value === "object" && !Array.isArray(value), "必须是对象");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, allowEmpty = false): asserts value is string {
  requireConfig(typeof value === "string" && (allowEmpty || value.trim()), `${field} 必须是${allowEmpty ? "" : "非空"}字符串`);
}

function strings(value: unknown, field: string, min = 0): asserts value is string[] {
  requireConfig(Array.isArray(value) && value.length >= min, `${field} 必须是数组，至少 ${min} 项`);
  value.forEach((item) => text(item, field));
}

function unique(values: unknown[], field: string) {
  requireConfig(new Set(values).size === values.length, `${field} 不能重复`);
}

/** Convert v1 schema + per-test inserts into independent complete scripts. */
function migrateChallenge(value: unknown): Record<string, unknown> {
  const c = structuredClone(object(value));
  requireConfig(c.configVersion === 1 || c.configVersion === 2, "不支持的 configVersion");
  if (c.configVersion === 2) return c;
  const source = object(c.dataSource);
  text(source.schemaSql, "dataSource.schemaSql");
  const schemaSql = source.schemaSql;
  requireConfig(Array.isArray(c.tests) && c.tests.length > 0, "旧版 tests 不能为空");
  const tests = c.tests.map((value) => {
    const test = object(value);
    text(test.id, "test.id");
    text(test.name, "test.name");
    text(test.boundaryHint, "test.boundaryHint", true);
    text(test.fixtureSql, "test.fixtureSql", true);
    requireConfig(test.visibility === "public" || test.visibility === "hidden", "test.visibility 无效");
    return test;
  });
  unique(tests.map((t) => t.id), "测试 ID");
  const firstPublic = tests.findIndex((test) => test.visibility === "public");
  requireConfig(firstPublic >= 0, "旧版至少需要一个公开样例");
  c.configVersion = 2;
  c.dataSource = {
    setupSql: `${schemaSql}\n\n${tests[firstPublic].fixtureSql}`,
    tables: source.tables ?? [],
  };
  c.tests = tests.filter((_, index) => index !== firstPublic).map((test) => {
    const next: Record<string, unknown> = { ...test, setupSql: `${schemaSql}\n\n${test.fixtureSql}` };
    delete next.fixtureSql;
    return next;
  });
  return c;
}

/** Validate untrusted JSON at file, storage and future API boundaries. */
export function parseChallenge(value: unknown): SqlChallenge {
  const c = migrateChallenge(value);
  for (const field of ["id", "title", "summary", "task", "starterSql", "referenceSql", "analysis", "dialectNote"]) text(c[field], field);
  requireConfig(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.id as string), "id 使用小写字母、数字和短横线");
  requireConfig(Number.isInteger(c.number) && Number(c.number) > 0, "number 必须是正整数");
  text(c.chapter, "chapter");
  c.chapter = c.chapter.trim();
  requireConfig(["easy", "medium", "hard"].includes(c.difficulty as string), "difficulty 无效");
  requireConfig(typeof c.orderSensitive === "boolean", "orderSensitive 必须是布尔值");
  strings(c.tags, "tags");
  strings(c.output, "output", 1);
  strings(c.hints, "hints", 2);
  requireConfig(c.hints.length === 2, "hints 必须恰好两项");
  strings(c.pitfalls, "pitfalls");
  validateReadOnlyQuery(c.referenceSql as string);

  const source = object(c.dataSource);
  text(source.setupSql, "dataSource.setupSql");
  source.tables ??= [];
  requireConfig(Array.isArray(source.tables), "dataSource.tables 必须是数组");
  const tableNames = source.tables.map((item) => {
    const table = object(item);
    text(table.name, "table.name");
    text(table.title, "table.title");
    requireConfig(Array.isArray(table.columns) && table.columns.length > 0, "table.columns 不能为空");
    const columns = table.columns.map((item) => {
      const column = object(item);
      text(column.name, "column.name");
      text(column.type, "column.type");
      text(column.note, "column.note", true);
      return column.name;
    });
    unique(columns, "表字段名称");
    return table.name;
  });
  unique(tableNames, "表名称");

  c.tests ??= [];
  requireConfig(Array.isArray(c.tests), "tests 必须是数组");
  const testIds = c.tests.map((item) => {
    const t = object(item);
    text(t.id, "test.id");
    text(t.name, "test.name");
    text(t.setupSql, "test.setupSql");
    requireConfig(t.id !== "default", "default 是默认测试的保留 ID");
    text(t.boundaryHint, "test.boundaryHint", true);
    requireConfig(t.visibility === "public" || t.visibility === "hidden", "test.visibility 无效");
    return t.id;
  });
  unique(testIds, "测试 ID");
  requireConfig(Array.isArray(c.qualityChecks), "qualityChecks 必须是数组");
  const checkIds = c.qualityChecks.map((item) => {
    const check = object(item);
    for (const field of ["id", "label", "success", "suggestion"]) text(check[field], `qualityChecks.${field}`);
    for (const field of ["allOf", "anyOf", "noneOf"]) {
      if (check[field] === undefined) continue;
      strings(check[field], `qualityChecks.${field}`);
      for (const pattern of check[field]) new RegExp(pattern, "i");
    }
    return check.id;
  });
  unique(checkIds, "质量规则 ID");
  return structuredClone(c) as unknown as SqlChallenge;
}

export function parseChallengeCatalog(value: unknown): SqlChallenge[] {
  requireConfig(Array.isArray(value), "题库必须是数组");
  const catalog = value.map(parseChallenge);
  unique(catalog.map((c) => c.id), "题目 ID");
  unique(catalog.map((c) => c.number), "题号");
  return catalog.sort((a, b) => a.number - b.number);
}

export function saveChallenge(catalog: SqlChallenge[], value: unknown, previousId?: string) {
  const next = parseChallenge(value);
  if (previousId !== undefined) {
    requireConfig(catalog.some((c) => c.id === previousId), "要修改的题目不存在");
    requireConfig(next.id === previousId, "修改题目时 ID 不可更改");
  } else {
    requireConfig(!catalog.some((c) => c.id === next.id), "题目 ID 已存在");
  }
  return parseChallengeCatalog([...catalog.filter((c) => c.id !== previousId), next]);
}

export function deleteChallenge(catalog: SqlChallenge[], id: string) {
  requireConfig(catalog.some((c) => c.id === id), "要删除的题目不存在");
  return catalog.filter((c) => c.id !== id).map((c) => structuredClone(c));
}

export function createChallengeTemplate(number: number): SqlChallenge {
  return parseChallenge({
    configVersion: 2, id: `challenge-${number}`, number, title: "新题目",
    chapter: "日期与过滤", difficulty: "easy", tags: [],
    summary: "查询示例数据", task: "查询所有示例的 id，按 id 升序。",
    output: ["id"], starterSql: "SELECT id FROM sample ORDER BY id;",
    referenceSql: "SELECT id FROM sample ORDER BY id;", orderSensitive: true,
    hints: ["读取 sample 表。", "按 id 升序。"], analysis: "使用 SELECT 和 ORDER BY。",
    pitfalls: [], dialectNote: "使用 SQLite / MySQL 通用语法。",
    dataSource: {
      setupSql: "DROP TABLE IF EXISTS sample;\nCREATE TABLE sample (id INTEGER PRIMARY KEY);\nINSERT INTO sample VALUES (1), (2);",
      tables: [{ name: "sample", title: "示例表", columns: [{ name: "id", type: "INTEGER", note: "主键" }] }],
    },
    tests: [],
    qualityChecks: [],
  });
}
