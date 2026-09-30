/// <reference lib="webworker" />

import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { compareResults } from "./judge-core";
import { inspectDatabase, normalizeSqlValue, validateReferenceOutput } from "./data-source";
import type {
  CaseResult,
  SqlResultSet,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./types";

const context = self as DedicatedWorkerGlobalScope;
let SQL: SqlJsStatic;

class OutputLimitError extends Error {}

function post(message: WorkerOutboundMessage) {
  context.postMessage(message);
}

function mysqlDatePart(value: unknown, part: "year" | "month") {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return Number(part === "year" ? match[1] : match[2]);
}

function installCompatibilityFunctions(database: Database) {
  database.create_function("YEAR", (value) => mysqlDatePart(value, "year"));
  database.create_function("MONTH", (value) => mysqlDatePart(value, "month"));
}

function createDatabase(setupSql: string) {
  const database = new SQL.Database();
  installCompatibilityFunctions(database);
  try {
    database.exec(setupSql);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function executeQuery(database: Database, sql: string, maxRows: number): SqlResultSet {
  const statement = database.prepare(sql);
  try {
    const columns = statement.getColumnNames();
    const rows: SqlResultSet["rows"] = [];
    while (statement.step()) {
      if (rows.length >= maxRows) {
        throw new OutputLimitError(`查询超过 ${maxRows} 行输出上限。`);
      }
      rows.push(statement.get().map(normalizeSqlValue));
    }
    return { columns, rows };
  } finally {
    statement.free();
  }
}

function sqlErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error:\s*/i, "");
}

function executeCase(message: Extract<WorkerInboundMessage, { type: "RUN_CASE" }>): CaseResult {
  const { payload } = message;
  const { test } = payload;
  let expectedDatabase: Database | undefined;
  let actualDatabase: Database | undefined;

  try {
    expectedDatabase = createDatabase(payload.setupSql);
    const expected = executeQuery(
      expectedDatabase,
      payload.referenceSql,
      payload.maxRows,
    );
    validateReferenceOutput(expected, payload.output);

    actualDatabase = createDatabase(payload.setupSql);
    const startedAt = performance.now();
    const actual = executeQuery(actualDatabase, payload.userSql, payload.maxRows);
    const elapsedMs = performance.now() - startedAt;
    const comparison = compareResults(
      expected,
      actual,
      payload.orderSensitive,
      payload.numericTolerance,
    );

    return {
      caseId: test.id,
      name: test.name,
      visibility: test.visibility,
      elapsedMs,
      boundaryHint: test.boundaryHint,
      actual,
      expected,
      ...comparison,
    };
  } catch (error) {
    const isOutputLimit = error instanceof OutputLimitError;
    return {
      caseId: test.id,
      name: test.name,
      visibility: test.visibility,
      verdict: isOutputLimit ? "OUTPUT_LIMIT_EXCEEDED" : "SQL_ERROR",
      elapsedMs: 0,
      boundaryHint: test.boundaryHint,
      message: isOutputLimit
        ? sqlErrorMessage(error)
        : `SQL 执行失败：${sqlErrorMessage(error)}`,
    };
  } finally {
    expectedDatabase?.close();
    actualDatabase?.close();
  }
}

context.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;
  if (message.type === "RUN_CASE") {
    post({ type: "CASE_RESULT", result: executeCase(message) });
    return;
  }
  let database: Database | undefined;
  try {
    database = createDatabase(message.setupSql);
    post({ type: "SOURCE_INSPECTION", inspection: inspectDatabase(database, message.tables) });
  } catch (error) {
    post({ type: "SOURCE_ERROR", message: `数据源 SQL 执行失败：${sqlErrorMessage(error)}` });
  } finally { database?.close(); }
};

initSqlJs({ locateFile: () => wasmUrl })
  .then((runtime) => {
    SQL = runtime;
    post({ type: "READY" });
  })
  .catch((error: unknown) => {
    post({
      type: "BOOT_ERROR",
      message: `SQL 引擎加载失败：${sqlErrorMessage(error)}`,
    });
  });
