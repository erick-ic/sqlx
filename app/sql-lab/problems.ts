import f1 from "./challenges/feishu-all-columns.json";
import f2 from "./challenges/feishu-distinct-university.json";
import f3 from "./challenges/feishu-group-activity.json";
import f4 from "./challenges/feishu-having-low-activity.json";
import f5 from "./challenges/feishu-age-groups.json";
import f6 from "./challenges/feishu-zju-detail.json";
import f7 from "./challenges/feishu-school-difficulty-average.json";
import f8 from "./challenges/feishu-profile-age.json";
import f9 from "./challenges/feishu-august-daily.json";
import f10 from "./challenges/feishu-august-totals.json";
import f11 from "./challenges/feishu-running-profit.json";
import q1 from "./challenges/date-range-detail.json";
import q2 from "./challenges/august-metrics.json";
import q3 from "./challenges/zju-join-detail.json";
import q4 from "./challenges/medium-users-exists.json";
import q5 from "./challenges/duplicate-dimension-key.json";
import q6 from "./challenges/safe-count-dirty-dimension.json";
import q7 from "./challenges/university-practice-count.json";
import q8 from "./challenges/university-user-and-practice.json";
import q9 from "./challenges/average-by-school-difficulty.json";
import q10 from "./challenges/average-all-registered-users.json";
import q11 from "./challenges/running-profit-window.json";
import q12 from "./challenges/running-profit-legacy.json";
import { parseChallengeCatalog } from "./challenge-config";
import type { SqlChallenge } from "./types";

export const challenges = parseChallengeCatalog([
  q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11, q12,
  f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11,
]);

const chapterOrder = [
  "基础查询",
  "条件表达式",
  "字符串函数",
  "日期与过滤",
  "JOIN 与子查询",
  "分组与统计",
  "窗口函数",
];

/** Built-in chapters follow the learning sequence; custom chapters retain their order. */
export function getChapters(catalog: SqlChallenge[], preferred: string[] = []): string[] {
  const chapters = [...new Set(catalog.map((challenge) => challenge.chapter))];
  const selected = [...new Set(preferred)].filter((chapter) => chapters.includes(chapter));
  return [
    ...selected,
    ...chapterOrder.filter((chapter) => chapters.includes(chapter) && !selected.includes(chapter)),
    ...chapters.filter((chapter) => !chapterOrder.includes(chapter)),
  ].filter((chapter, index, all) => all.indexOf(chapter) === index);
}

export function getChallenge(id: string | null | undefined) {
  return challenges.find((challenge) => challenge.id === id) ?? challenges[0];
}

/** The initialization script always replaces the dataset in a new database. */
export function getSetupSql(challenge: SqlChallenge, test?: import("./types").ChallengeTest) {
  return test?.setupSql ?? challenge.dataSource.setupSql;
}

export function getChallengeTests(challenge: SqlChallenge): import("./types").ChallengeTest[] {
  return [{
    id: "default", name: "默认样例", visibility: "public",
    setupSql: challenge.dataSource.setupSql, boundaryHint: "",
  }, ...challenge.tests];
}
