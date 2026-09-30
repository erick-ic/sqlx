import { getChallengeTests, getSetupSql } from "./problems";
import SqlJudgeWorker from "./sql-judge.worker.ts?worker";
import {
  evaluateQuality,
  QueryValidationError,
  validateReadOnlyQuery,
} from "./judge-core";
import type {
  CaseResult,
  ChallengeTest,
  JudgeReport,
  SqlChallenge,
  WorkerOutboundMessage,
} from "./types";

const WORKER_BOOT_TIMEOUT_MS = 8_000;
const QUERY_TIMEOUT_MS = 2_500;
const MAX_RESULT_ROWS = 500;
const NUMERIC_TOLERANCE = 1e-4;

function runCase(
  challenge: SqlChallenge,
  test: ChallengeTest,
  userSql: string,
): Promise<CaseResult> {
  return new Promise((resolve) => {
    const worker = new SqlJudgeWorker({
      name: `sql-judge-${test.id}`,
    });
    let settled = false;
    let queryTimer: number | undefined;

    const finish = (result: CaseResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(bootTimer);
      if (queryTimer) window.clearTimeout(queryTimer);
      worker.terminate();
      resolve(
        test.visibility === "hidden" && result.verdict !== "ACCEPTED"
          ? { ...result, actual: undefined, expected: undefined, mismatch: undefined }
          : result,
      );
    };

    const bootTimer = window.setTimeout(() => {
      finish({
        caseId: test.id,
        name: test.name,
        visibility: test.visibility,
        verdict: "INTERNAL_ERROR",
        elapsedMs: WORKER_BOOT_TIMEOUT_MS,
        boundaryHint: test.boundaryHint,
        message: "浏览器内 SQL 引擎启动超时，请刷新页面后重试。",
      });
    }, WORKER_BOOT_TIMEOUT_MS);

    worker.onerror = (event) => {
      finish({
        caseId: test.id,
        name: test.name,
        visibility: test.visibility,
        verdict: "INTERNAL_ERROR",
        elapsedMs: 0,
        boundaryHint: test.boundaryHint,
        message: `判题 Worker 异常：${event.message || "未知错误"}`,
      });
    };

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      if (event.data.type === "BOOT_ERROR") {
        finish({
          caseId: test.id,
          name: test.name,
          visibility: test.visibility,
          verdict: "INTERNAL_ERROR",
          elapsedMs: 0,
          boundaryHint: test.boundaryHint,
          message: event.data.message,
        });
        return;
      }

      if (event.data.type === "READY") {
        window.clearTimeout(bootTimer);
        queryTimer = window.setTimeout(() => {
          finish({
            caseId: test.id,
            name: test.name,
            visibility: test.visibility,
            verdict: "TIME_LIMIT_EXCEEDED",
            elapsedMs: QUERY_TIMEOUT_MS,
            boundaryHint: test.boundaryHint,
            message: `查询超过 ${QUERY_TIMEOUT_MS / 1_000} 秒，已终止当前 Worker。`,
          });
        }, QUERY_TIMEOUT_MS);

        worker.postMessage({
          type: "RUN_CASE",
          payload: {
            test,
            setupSql: getSetupSql(challenge, test),
            referenceSql: challenge.referenceSql,
            userSql,
            orderSensitive: challenge.orderSensitive,
            maxRows: MAX_RESULT_ROWS,
            numericTolerance: NUMERIC_TOLERANCE,
            output: challenge.output,
          },
        });
        return;
      }

      if (event.data.type === "CASE_RESULT") finish(event.data.result);
    };
  });
}

function invalidReport(
  challenge: SqlChallenge,
  mode: "run" | "submit",
  message: string,
): JudgeReport {
  const quality = evaluateQuality(challenge, "");
  return {
    verdict: "INVALID_QUERY",
    passed: false,
    optimized: false,
    mode,
    elapsedMs: 0,
    quality,
    cases: [
      {
        caseId: "validation",
        name: "查询校验",
        visibility: "public",
        verdict: "INVALID_QUERY",
        elapsedMs: 0,
        message,
      },
    ],
  };
}

export async function judgeChallenge(
  challenge: SqlChallenge,
  source: string,
  mode: "run" | "submit",
): Promise<JudgeReport> {
  let userSql: string;
  try {
    userSql = validateReadOnlyQuery(source);
  } catch (error) {
    return invalidReport(
      challenge,
      mode,
      error instanceof QueryValidationError ? error.message : "SQL 查询校验失败。",
    );
  }

  const allTests = getChallengeTests(challenge);
  const tests = mode === "run" ? allTests.filter((test) => test.visibility === "public") : allTests;
  const startedAt = performance.now();
  const cases: CaseResult[] = [];

  for (const test of tests) {
    const result = await runCase(challenge, test, userSql);
    cases.push(result);
    if (result.verdict !== "ACCEPTED") break;
  }

  const quality = evaluateQuality(challenge, userSql);
  const passed =
    cases.length === tests.length &&
    cases.every((result) => result.verdict === "ACCEPTED");
  const firstFailure = cases.find((result) => result.verdict !== "ACCEPTED");

  return {
    verdict: firstFailure?.verdict ?? "ACCEPTED",
    passed,
    optimized: quality.length === 0 || quality.every((finding) => finding.passed),
    mode,
    elapsedMs: performance.now() - startedAt,
    cases,
    quality,
  };
}
