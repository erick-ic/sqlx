import type {
  CaseResult,
  QualityFinding,
  SqlChallenge,
  SqlResultSet,
  SqlScalar,
} from "./types";

const FORBIDDEN_TOKENS = new Set([
  "ATTACH",
  "DETACH",
  "PRAGMA",
  "CREATE",
  "DROP",
  "ALTER",
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "VACUUM",
  "REINDEX",
  "ANALYZE",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE",
  "LOAD_EXTENSION",
]);

type ScanState =
  | "normal"
  | "single"
  | "double"
  | "backtick"
  | "bracket"
  | "line-comment"
  | "block-comment";

export class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}

function isTokenChar(character: string) {
  return /[A-Za-z0-9_$]/.test(character);
}

export function validateReadOnlyQuery(source: string) {
  let state: ScanState = "normal";
  let token = "";
  const tokens: string[] = [];
  let terminatorIndex = -1;

  const flushToken = () => {
    if (!token) return;
    tokens.push(token.toUpperCase());
    token = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") state = "normal";
      continue;
    }

    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "normal";
        index += 1;
      }
      continue;
    }

    if (state === "single") {
      if (character === "'" && next === "'") {
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }

    if (state === "double") {
      if (character === '"' && next === '"') {
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }

    if (state === "backtick") {
      if (character === "`" && next === "`") {
        index += 1;
      } else if (character === "`") {
        state = "normal";
      }
      continue;
    }

    if (state === "bracket") {
      if (character === "]" && next === "]") {
        index += 1;
      } else if (character === "]") {
        state = "normal";
      }
      continue;
    }

    if (character === "-" && next === "-") {
      flushToken();
      state = "line-comment";
      index += 1;
      continue;
    }

    if (character === "/" && next === "*") {
      flushToken();
      state = "block-comment";
      index += 1;
      continue;
    }

    if (terminatorIndex >= 0) {
      if (!/\s/.test(character)) {
        throw new QueryValidationError("每次只能运行一条查询；分号后还有其他内容。");
      }
      continue;
    }

    if (character === "'") {
      flushToken();
      state = "single";
    } else if (character === '"') {
      flushToken();
      state = "double";
    } else if (character === "`") {
      flushToken();
      state = "backtick";
    } else if (character === "[") {
      flushToken();
      state = "bracket";
    } else if (character === ";") {
      flushToken();
      terminatorIndex = index;
    } else if (isTokenChar(character)) {
      token += character;
    } else {
      flushToken();
    }
  }

  flushToken();

  if (["single", "double", "backtick", "bracket", "block-comment"].includes(state)) {
    throw new QueryValidationError("SQL 中存在未闭合的字符串、标识符或块注释。");
  }

  if (tokens.length === 0) {
    throw new QueryValidationError("请先输入一条 SELECT 查询。");
  }

  if (tokens[0] !== "SELECT" && tokens[0] !== "WITH") {
    throw new QueryValidationError("练习环境只允许一条 SELECT 或 WITH ... SELECT 查询。");
  }

  const forbidden = tokens.find((candidate) => FORBIDDEN_TOKENS.has(candidate));
  if (forbidden) {
    throw new QueryValidationError(`查询中不允许使用 ${forbidden}。`);
  }

  return (terminatorIndex >= 0 ? source.slice(0, terminatorIndex) : source).trim();
}

export function stripSqlComments(source: string) {
  let output = "";
  let state: ScanState = "normal";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") {
        state = "normal";
        output += "\n";
      } else {
        output += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        output += "  ";
        state = "normal";
        index += 1;
      } else {
        output += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "normal" && character === "-" && next === "-") {
      output += "  ";
      state = "line-comment";
      index += 1;
      continue;
    }

    if (state === "normal" && character === "/" && next === "*") {
      output += "  ";
      state = "block-comment";
      index += 1;
      continue;
    }

    output += character;

    if (state === "normal") {
      if (character === "'") state = "single";
      else if (character === '"') state = "double";
      else if (character === "`") state = "backtick";
      else if (character === "[") state = "bracket";
    } else if (state === "single" && character === "'") {
      if (next === "'") {
        output += next;
        index += 1;
      } else state = "normal";
    } else if (state === "double" && character === '"') {
      if (next === '"') {
        output += next;
        index += 1;
      } else state = "normal";
    } else if (state === "backtick" && character === "`") {
      if (next === "`") {
        output += next;
        index += 1;
      } else state = "normal";
    } else if (state === "bracket" && character === "]") {
      if (next === "]") {
        output += next;
        index += 1;
      } else state = "normal";
    }
  }

  return output;
}

export function evaluateQuality(challenge: SqlChallenge, source: string): QualityFinding[] {
  const normalized = stripSqlComments(source);

  return challenge.qualityChecks.map((check) => {
    const matches = (pattern: string) => new RegExp(pattern, "is").test(normalized);
    const allPassed = (check.allOf ?? []).every(matches);
    const anyPassed = check.anyOf ? check.anyOf.some(matches) : true;
    const nonePassed = (check.noneOf ?? []).every((pattern) => !matches(pattern));
    const passed = allPassed && anyPassed && nonePassed;

    return {
      id: check.id,
      label: check.label,
      passed,
      message: passed ? check.success : check.suggestion,
    };
  });
}

function scalarEqual(left: SqlScalar, right: SqlScalar, tolerance: number) {
  if (left === null || right === null) return left === right;
  if (typeof left === "number" && typeof right === "number") {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= tolerance * scale;
  }
  return typeof left === typeof right && left === right;
}

function rowEqual(left: SqlScalar[], right: SqlScalar[], tolerance: number) {
  return (
    left.length === right.length &&
    left.every((value, index) => scalarEqual(value, right[index], tolerance))
  );
}

function findCellMismatch(
  expected: SqlScalar[][],
  actual: SqlScalar[][],
  tolerance: number,
) {
  const rowCount = Math.min(expected.length, actual.length);
  for (let row = 0; row < rowCount; row += 1) {
    const columnCount = Math.min(expected[row].length, actual[row].length);
    for (let column = 0; column < columnCount; column += 1) {
      if (!scalarEqual(expected[row][column], actual[row][column], tolerance)) {
        return {
          row,
          column,
          expected: expected[row][column],
          actual: actual[row][column],
        };
      }
    }
  }
  return undefined;
}

export function compareResults(
  expected: SqlResultSet,
  actual: SqlResultSet,
  orderSensitive: boolean,
  tolerance: number,
): Pick<CaseResult, "verdict" | "message" | "mismatch"> {
  if (
    expected.columns.length !== actual.columns.length ||
    expected.columns.some((column, index) => column !== actual.columns[index])
  ) {
    return {
      verdict: "WRONG_COLUMNS",
      message: `输出列应为 ${expected.columns.join(", ")}；当前为 ${actual.columns.join(", ") || "（无列）"}。`,
    };
  }

  if (expected.rows.length !== actual.rows.length) {
    return {
      verdict: "WRONG_ROW_COUNT",
      message: `期望 ${expected.rows.length} 行，实际返回 ${actual.rows.length} 行。请检查过滤、JOIN 基数或分组粒度。`,
    };
  }

  if (orderSensitive) {
    for (let index = 0; index < expected.rows.length; index += 1) {
      if (!rowEqual(expected.rows[index], actual.rows[index], tolerance)) {
        return {
          verdict: "WRONG_ANSWER",
          message: `第 ${index + 1} 行与预期不一致；本题按顺序比较。`,
          mismatch: findCellMismatch(expected.rows, actual.rows, tolerance),
        };
      }
    }
  } else {
    const used = new Set<number>();
    for (const expectedRow of expected.rows) {
      const match = actual.rows.findIndex(
        (actualRow, index) =>
          !used.has(index) && rowEqual(expectedRow, actualRow, tolerance),
      );
      if (match < 0) {
        return {
          verdict: "WRONG_ANSWER",
          message: "结果中的行值或重复次数与预期不一致；本题忽略行顺序，但保留重复行。",
        };
      }
      used.add(match);
    }
  }

  return {
    verdict: "ACCEPTED",
    message: orderSensitive
      ? `通过：列名、${actual.rows.length} 行数据与顺序均正确。`
      : `通过：列名和 ${actual.rows.length} 行数据正确（忽略行顺序，保留重复行）。`,
  };
}
