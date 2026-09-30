import type { Database } from "sql.js";
import type { DataSourceInspection, SqlResultSet, SqlScalar, TableDefinition } from "./types";

export function normalizeSqlValue(value: unknown): SqlScalar {
  if (value === null || typeof value === "number" || typeof value === "string") return value;
  if (value instanceof Uint8Array) return `[BLOB · ${value.byteLength} bytes]`;
  return String(value);
}

/** Read actual tables and bounded sample rows after the complete SQL script executes. */
export function inspectDatabase(database: Database, previous: TableDefinition[] = [], sampleLimit = 10): DataSourceInspection {
  const names = database.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name")[0]?.values.map((row) => String(row[0])) ?? [];
  if (!names.length) throw new Error("数据源 SQL 执行后没有可用的数据表，请检查 CREATE TABLE 语句。");
  const tables: TableDefinition[] = [];
  const samples: DataSourceInspection["samples"] = [];
  for (const name of names) {
    const old = previous.find((table) => table.name === name);
    const schema = database.prepare("SELECT name, type, [notnull], pk FROM pragma_table_xinfo(?) ORDER BY cid");
    const columns: TableDefinition["columns"] = [];
    try {
      schema.bind([name]);
      while (schema.step()) {
        const [field, type, notNull, primaryKey] = schema.get();
        const columnName = String(field);
        const note = old?.columns.find((column) => column.name === columnName)?.note;
        columns.push({ name: columnName, type: String(type || "未指定"), note: note || [primaryKey ? "主键" : "", notNull ? "非空" : ""].filter(Boolean).join(" · ") });
      }
    } finally { schema.free(); }
    tables.push({ name, title: old?.title || name, columns });
    // Quote identifiers, including unusual imported table names.
    const identifier = `"${name.replace(/"/g, '""')}"`;
    const statement = database.prepare(`SELECT * FROM ${identifier} LIMIT ${sampleLimit + 1}`);
    try {
      const result: SqlResultSet = { columns: statement.getColumnNames(), rows: [] };
      while (statement.step()) result.rows.push(statement.get().map(normalizeSqlValue));
      const truncated = result.rows.length > sampleLimit;
      result.rows = result.rows.slice(0, sampleLimit);
      samples.push({ tableName: name, result, truncated });
    } finally { statement.free(); }
  }
  return { tables, samples };
}

export function validateReferenceOutput(result: SqlResultSet, output: string[]) {
  if (JSON.stringify(result.columns) !== JSON.stringify(output)) {
    throw new Error("参考答案的输出字段与题目 output 配置不一致。");
  }
}
