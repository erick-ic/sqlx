import SqlJudgeWorker from "./sql-judge.worker.ts?worker";
import type { DataSourceInspection, TableDefinition, WorkerOutboundMessage } from "./types";

/** Inspect full initialization scripts in an isolated, bounded worker. */
export function inspectDataSource(setupSql: string, tables: TableDefinition[] = [], signal?: AbortSignal): Promise<DataSourceInspection> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("已取消", "AbortError")); return; }
    const worker = new SqlJudgeWorker({ name: "sql-source-inspector" });
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    const finish = (error?: Error, inspection?: DataSourceInspection) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); worker.terminate(); signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(inspection!);
    };
    const abort = () => finish(new DOMException("已取消", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish(new Error("数据源 SQL 引擎启动超时，请重试。")), 8_000);
    worker.onerror = (event) => finish(new Error(`数据源解析失败：${event.message || "Worker 异常"}`));
    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const message = event.data;
      if (message.type === "READY") {
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error("数据源 SQL 执行超过 2.5 秒，已停止。")), 2_500);
        worker.postMessage({ type: "INSPECT_SOURCE", setupSql, tables });
      } else if (message.type === "SOURCE_INSPECTION") finish(undefined, message.inspection);
      else if (message.type === "SOURCE_ERROR" || message.type === "BOOT_ERROR") finish(new Error(message.message));
    };
  });
}
