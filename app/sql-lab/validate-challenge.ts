import { judgeChallenge } from "./judge";
import { inspectDataSource } from "./source-inspector";
import type { SqlChallenge } from "./types";

export async function validateChallengeSql(challenge: SqlChallenge) {
  const inspection = await inspectDataSource(challenge.dataSource.setupSql, challenge.dataSource.tables);
  const report = await judgeChallenge(challenge, challenge.referenceSql, "submit");
  if (!report.passed) {
    const failure = report.cases.find((item) => item.verdict !== "ACCEPTED");
    throw new Error(`「${challenge.title}」${failure?.name ?? "配置校验"}：${failure?.message ?? "校验未通过"}`);
  }
  return { ...challenge, dataSource: { ...challenge.dataSource, tables: inspection.tables } };
}
