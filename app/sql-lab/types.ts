export type Difficulty = "easy" | "medium" | "hard";
export type Chapter = string;
export type SqlScalar = null | number | string;

export interface SqlResultSet {
  columns: string[];
  rows: SqlScalar[][];
}

export interface TableDefinition {
  name: string;
  title: string;
  columns: Array<{
    name: string;
    type: string;
    note: string;
  }>;
}

export interface ChallengeTest {
  id: string;
  name: string;
  visibility: "public" | "hidden";
  /** A complete alternative initialization script; never appended to the default. */
  setupSql: string;
  boundaryHint: string;
}

export interface QualityCheck {
  id: string;
  label: string;
  success: string;
  suggestion: string;
  allOf?: string[];
  anyOf?: string[];
  noneOf?: string[];
}

export interface ChallengeDataSource {
  /** Complete DROP / CREATE / INSERT script for the default dataset. */
  setupSql: string;
  /** Derived display cache; regenerated from setupSql when saving. */
  tables: TableDefinition[];
}

export interface DataSourceInspection {
  tables: TableDefinition[];
  samples: Array<{ tableName: string; result: SqlResultSet; truncated: boolean }>;
}

export interface SqlChallenge {
  configVersion: 2;
  id: string;
  number: number;
  title: string;
  chapter: Chapter;
  difficulty: Difficulty;
  tags: string[];
  summary: string;
  task: string;
  output: string[];
  dataSource: ChallengeDataSource;
  starterSql: string;
  referenceSql: string;
  orderSensitive: boolean;
  hints: [string, string];
  analysis: string;
  pitfalls: string[];
  dialectNote: string;
  /** Optional additional tests. The default public test is implicit. */
  tests: ChallengeTest[];
  qualityChecks: QualityCheck[];
}

export type VerdictCode =
  | "ACCEPTED"
  | "INVALID_QUERY"
  | "SQL_ERROR"
  | "WRONG_COLUMNS"
  | "WRONG_ROW_COUNT"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export interface CaseResult {
  caseId: string;
  name: string;
  visibility: "public" | "hidden";
  verdict: VerdictCode;
  elapsedMs: number;
  message: string;
  boundaryHint?: string;
  actual?: SqlResultSet;
  expected?: SqlResultSet;
  mismatch?: {
    row?: number;
    column?: number;
    expected?: SqlScalar;
    actual?: SqlScalar;
  };
}

export interface QualityFinding {
  id: string;
  label: string;
  passed: boolean;
  message: string;
}

export interface JudgeReport {
  verdict: VerdictCode;
  passed: boolean;
  optimized: boolean;
  mode: "run" | "submit";
  elapsedMs: number;
  cases: CaseResult[];
  quality: QualityFinding[];
}

export interface WorkerCasePayload {
  test: ChallengeTest;
  setupSql: string;
  referenceSql: string;
  userSql: string;
  orderSensitive: boolean;
  maxRows: number;
  numericTolerance: number;
  output: string[];
}

export type WorkerInboundMessage =
  | { type: "RUN_CASE"; payload: WorkerCasePayload }
  | { type: "INSPECT_SOURCE"; setupSql: string; tables: TableDefinition[] };

export type WorkerOutboundMessage =
  | { type: "READY" }
  | { type: "CASE_RESULT"; result: CaseResult }
  | { type: "SOURCE_INSPECTION"; inspection: DataSourceInspection }
  | { type: "SOURCE_ERROR"; message: string }
  | { type: "BOOT_ERROR"; message: string };
