"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import ManagementDialog from "./ManagementDialog";

export default function ChapterOrderDialog({ chapters, defaults, onSave, onClose }: {
  chapters: string[]; defaults: string[]; onSave: (order: string[]) => void; onClose: () => void;
}) {
  const [order, setOrder] = useState(chapters);
  const [error, setError] = useState("");
  const move = (index: number, offset: number) => {
    const next = [...order];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setOrder(next);
  };
  return <ManagementDialog title="章节排序" compact onClose={onClose}>
    <div className="management-body">
      <p>上下移动章节，保存后题库按此顺序显示。</p>
      <ol className="chapter-order-list" aria-label="章节顺序">
        {order.map((chapter, index) => <li key={chapter}>
          <span className="chapter-order-number">{index + 1}</span><span className="chapter-order-name">{chapter}</span>
          <button type="button" className="secondary-button" aria-label={`上移${chapter}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button type="button" className="secondary-button" aria-label={`下移${chapter}`} disabled={index === order.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
        </li>)}
      </ol>
      <div role="status" className="sr-only">当前顺序：{order.join("、")}</div>
      {error ? <p className="config-error" role="alert">{error}</p> : null}
    </div>
    <footer className="management-footer">
      <button type="button" className="secondary-button" onClick={() => setOrder(defaults)}>恢复默认顺序</button>
      <div><button type="button" className="secondary-button" onClick={onClose}>取消</button>
        <button type="button" className="primary-button" onClick={() => {
          try { onSave(order); } catch { setError("顺序保存失败，请检查浏览器存储后重试。"); }
        }}>保存顺序</button></div>
    </footer>
  </ManagementDialog>;
}
