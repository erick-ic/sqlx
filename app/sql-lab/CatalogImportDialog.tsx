"use client";

import { useState, type ChangeEvent } from "react";
import ManagementDialog from "./ManagementDialog";
import { importCatalog, MAX_CATALOG_BYTES, unchangedChallengeIds } from "./catalog-transfer";
import { validateChallengeSql } from "./validate-challenge";
import type { SqlChallenge } from "./types";

export default function CatalogImportDialog({ current, onImport, onClose }: {
  current: SqlChallenge[]; onImport: (catalog: SqlChallenge[]) => void; onClose: () => void;
}) {
  const [incoming, setIncoming] = useState<SqlChallenge[] | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const unchanged = incoming ? unchangedChallengeIds(current, incoming).size : 0;

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError(""); setIncoming(null); setFilename(file.name); setStatus("正在读取题库文件…");
    try {
      if (file.size > MAX_CATALOG_BYTES) throw new Error("题库文件不能超过 5 MB。");
      setIncoming(importCatalog(await file.text()));
    } catch (error) { setError(error instanceof Error ? error.message : "无法读取题库文件。"); }
    finally { setBusy(false); setStatus(""); }
  };

  const confirm = async () => {
    if (incoming === null || busy) return;
    setBusy(true); setError("");
    try {
      const validated: SqlChallenge[] = [];
      for (const [index, challenge] of incoming.entries()) {
        setStatus(`校验 ${index + 1}/${incoming.length}：${challenge.title}`);
        validated.push(await validateChallengeSql(challenge));
      }
      onImport(validated);
    } catch (error) { setError(error instanceof Error ? error.message : "导入失败，原题库未修改。"); }
    finally { setBusy(false); setStatus(""); }
  };

  return <ManagementDialog title="导入整个题库" busy={busy} onClose={onClose} compact>
    <div className="management-body">
      <p className="management-note">选择完整题库的 JSON 文件。导入将替换当前整个题库，不支持单题导入。</p>
      <label className="catalog-file-picker"><span>{filename ? "重新选择文件" : "选择 JSON 文件"}</span><input type="file" aria-label={filename ? "重新选择文件" : "选择 JSON 文件"} accept=".json,application/json" onChange={(event) => void chooseFile(event)} disabled={busy} /></label>
      <small className="management-note">最大 5 MB。文件仅在本机读取，不会上传服务器。</small>
      {incoming !== null ? <>
        <div className="import-summary"><strong>{filename}</strong><p>当前 {current.length} 道 → 导入后 {incoming.length} 道</p><small>{unchanged} 道内容不变，保留其草稿和进度。其余题目的旧草稿和进度会清除。</small></div>
        {!incoming.length ? <p className="import-warning">此文件是空题库，导入后会清空当前全部题目。</p> : null}
        <ul className="import-preview" aria-label="待导入题目">{incoming.map((challenge) => <li key={challenge.id}><span>{String(challenge.number).padStart(2, "0")}</span><strong>{challenge.title}</strong><small>{challenge.tests.length + 1} 组数据</small></li>)}</ul>
        <p className="management-note">确认后会执行所有题目的数据源 SQL 和参考答案，全部通过才替换题库。导入失败时保留原题库。</p>
      </> : null}
      {error ? <p className="config-error" role="alert">{error}</p> : null}
      <p className="management-note" role="status">{status}</p>
    </div>
    <footer className="management-footer"><span>导入导出包含题目配置，不包含学习记录。</span><div><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary-button" disabled={incoming === null || busy} onClick={() => void confirm()}>{busy ? "校验中…" : "校验并替换题库"}</button></div></footer>
  </ManagementDialog>;
}
