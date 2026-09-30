"use client";

import { useEffect, useState } from "react";
import DataSourcePreview from "./DataSourcePreview";
import { inspectDataSource } from "./source-inspector";
import type { DataSourceInspection, SqlChallenge } from "./types";

export default function ChallengeSourceContent({ challenge }: { challenge: SqlChallenge }) {
  const [inspection, setInspection] = useState<DataSourceInspection | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    inspectDataSource(challenge.dataSource.setupSql, challenge.dataSource.tables, controller.signal)
      .then((inspection) => { setInspection(inspection); setError(""); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "数据源解析失败。");
      });
    return () => controller.abort();
  }, [challenge.dataSource]);
  return <>
    {!error ? <p className="section-note source-load-status" role="status">{inspection ? "表结构与样例数据已加载" : "正在读取表结构与样例数据…"}</p> : null}
    {error ? <p className="config-error" role="alert">{error}</p> : null}
    <DataSourcePreview inspection={inspection ?? { tables: challenge.dataSource.tables, samples: [] }} collapsible />
  </>;
}
