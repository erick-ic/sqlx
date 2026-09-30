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
]);

/** Chapters follow their first appearance in the ordered catalog. */
export function getChapters(catalog: SqlChallenge[]): string[] {
  return [...new Set(catalog.map((challenge) => challenge.chapter))];
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
