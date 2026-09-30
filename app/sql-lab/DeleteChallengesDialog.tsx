"use client";

import { useState } from "react";
import ManagementDialog from "./ManagementDialog";
import type { SqlChallenge } from "./types";

export default function DeleteChallengesDialog({ challenges, error, onDelete, onClose }: {
  challenges: SqlChallenge[]; error: string; onDelete: (ids: string[]) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const filtered = challenges.filter((item) => `${item.number} ${item.title} ${item.chapter}`.toLowerCase().includes(query.trim().toLowerCase()));
  const allSelected = filtered.length > 0 && filtered.every((item) => selected.includes(item.id));
  const targets = challenges.filter((item) => selected.includes(item.id));
  return <ManagementDialog title={confirming ? "确认删除题目" : "批量删除题目"} onClose={onClose}>
    <div className="management-body">
      {confirming ? <>
        <p>将删除以下 {targets.length} 道题目及其草稿、学习进度。</p>
        <p className="management-note">删除后无法直接恢复；需要备份时，请先取消并导出题库。</p>
        <ul>{targets.map((item) => <li key={item.id}>{item.number}. {item.title} · {item.chapter}</li>)}</ul>
      </> : <>
        <label className="management-field"><span>搜索待删除题目</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索题号、标题或章节" /></label>
        <div className="delete-selection-toolbar">
          <label><input type="checkbox" checked={allSelected} disabled={!filtered.length} onChange={() => setSelected((ids) => allSelected ? ids.filter((id) => !filtered.some((item) => item.id === id)) : [...new Set([...ids, ...filtered.map((item) => item.id)])])} /> 全选当前结果（{filtered.length} 道）</label>
          <button type="button" className="ghost-button" disabled={!selected.length} onClick={() => setSelected([])}>清空选择</button>
        </div>
        <p className="management-note">搜索不会清除已选题目，可跨搜索结果选择。</p>
        <div className="delete-question-list">{filtered.map((item) => <label aria-label={`选择删除 ${item.number}. ${item.title}`} className="delete-question-row" htmlFor={`delete-${item.id}`} key={item.id}>
          <input id={`delete-${item.id}`} type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />
          <span><strong>{item.number}. {item.title}</strong><small>{item.chapter}</small></span>
        </label>)}</div>
        {!filtered.length ? <p>没有匹配的题目。</p> : null}
      </>}
      {error ? <p className="config-error" role="alert">{error}</p> : null}
    </div>
    <footer className="management-footer"><span>已选 {targets.length} 道，删除后剩 {challenges.length - targets.length} 道。</span><div>
      <button type="button" className="secondary-button" onClick={confirming ? () => setConfirming(false) : onClose}>{confirming ? "返回选择" : "取消"}</button>
      <button type="button" className="danger-button filled" disabled={!targets.length} onClick={() => confirming ? onDelete(selected) : setConfirming(true)}>{confirming ? `确认删除 ${targets.length} 道题目` : "删除所选题目"}</button>
    </div></footer>
  </ManagementDialog>;
}
