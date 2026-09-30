"use client";

import { useRef, useState, type RefObject } from "react";
import type { SqlChallenge } from "./types";

type CompletionItem = { value: string; kind: "关键字" | "表" | "字段" };
type Completion = {
  start: number;
  end: number;
  items: CompletionItem[];
  selected: number;
  top: number;
  left: number;
};

const KEYWORDS = [
  "SELECT", "FROM", "WHERE", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN",
  "ON", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "AS", "DISTINCT",
  "AND", "OR", "NOT", "IN", "IS NULL", "BETWEEN", "LIKE", "WITH",
  "UNION", "UNION ALL", "CASE", "WHEN", "THEN", "ELSE", "END",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "ASC", "DESC",
];

const HIGHLIGHT_KEYWORDS = new Set([
  ...KEYWORDS.flatMap((keyword) => keyword.split(" ")),
  "BY", "CROSS", "EXISTS", "FALSE", "FULL", "NULL", "OFFSET", "OUTER", "RECURSIVE", "TRUE",
]);
const SQL_TOKENS = /--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|[^'])*'?|"(?:""|[^"])*"?|`(?:``|[^`])*`?|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;

function highlightSql(value: string) {
  const fragments: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(SQL_TOKENS)) {
    const index = match.index ?? 0;
    if (index > lastIndex) fragments.push(value.slice(lastIndex, index));
    const token = match[0];
    const kind = token.startsWith("--") || token.startsWith("/*") ? "comment"
      : token.startsWith("'") || token.startsWith('"') || token.startsWith("`") ? "string"
      : /^\d/.test(token) ? "number"
      : HIGHLIGHT_KEYWORDS.has(token.toUpperCase()) ? "keyword" : "plain";
    fragments.push(kind === "plain" ? token : <span key={index} className={`sql-token-${kind}`}>{token}</span>);
    lastIndex = index + token.length;
  }
  if (lastIndex < value.length) fragments.push(value.slice(lastIndex));
  return fragments;
}

function candidates(challenge: SqlChallenge, prefix: string, afterDot: boolean): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (!afterDot) {
    for (const value of KEYWORDS) items.push({ value, kind: "关键字" });
    for (const table of challenge.dataSource.tables) items.push({ value: table.name, kind: "表" });
  }
  for (const table of challenge.dataSource.tables) {
    for (const column of table.columns) items.push({ value: column.name, kind: "字段" });
  }
  const seen = new Set<string>();
  return items.filter(({ value }) => {
    const key = value.toLowerCase();
    if (seen.has(key) || !key.startsWith(prefix.toLowerCase()) || key === prefix.toLowerCase()) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function caretPosition(textarea: HTMLTextAreaElement, cursor: number, itemCount: number) {
  const wrap = textarea.closest<HTMLElement>(".editor-wrap");
  if (!wrap) return { top: 8, left: 8 };
  const before = textarea.value.slice(0, cursor);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const lineNumber = before.split("\n").length - 1;
  const style = window.getComputedStyle(textarea);
  const measure = document.createElement("span");
  measure.style.cssText = `position:fixed;visibility:hidden;white-space:pre;font:${style.font};letter-spacing:${style.letterSpacing};tab-size:${style.tabSize};`;
  measure.textContent = line;
  document.body.append(measure);
  const columnWidth = measure.getBoundingClientRect().width;
  measure.remove();

  const wrapRect = wrap.getBoundingClientRect();
  const areaRect = textarea.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || 22;
  const x = areaRect.left - wrapRect.left + parseFloat(style.paddingLeft) + columnWidth - textarea.scrollLeft;
  const y = areaRect.top - wrapRect.top + parseFloat(style.paddingTop) + lineNumber * lineHeight - textarea.scrollTop;
  const popupHeight = Math.min(itemCount * 33 + 30, 210);
  const below = y + lineHeight + popupHeight <= wrapRect.height - 8;
  return {
    left: Math.max(8, Math.min(x, wrapRect.width - Math.min(260, wrapRect.width - 16) - 8)),
    top: Math.max(8, Math.min(below ? y + lineHeight + 4 : y - popupHeight - 4, wrapRect.height - popupHeight - 8)),
  };
}

export default function SqlEditor({ challenge, value, onChange, onRun, editorRef }: {
  challenge: SqlChallenge;
  value: string;
  onChange: (value: string) => void;
  onRun: (mode: "run" | "submit") => void;
  editorRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const composing = useRef(false);
  const highlightRef = useRef<HTMLPreElement>(null);

  const updateCompletion = (textarea: HTMLTextAreaElement) => {
    if (composing.current || textarea.selectionStart !== textarea.selectionEnd) { setCompletion(null); return; }
    const cursor = textarea.selectionStart;
    const before = textarea.value.slice(0, cursor);
    const line = before.slice(before.lastIndexOf("\n") + 1);
    if (line.includes("--") || (before.match(/'/g)?.length ?? 0) % 2 === 1) { setCompletion(null); return; }
    const match = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
    const prefix = match?.[0] ?? "";
    const start = cursor - prefix.length;
    const afterDot = before.slice(0, start).endsWith(".");
    if (prefix.length < 2 && !afterDot) { setCompletion(null); return; }
    const items = candidates(challenge, prefix, afterDot);
    if (!items.length) { setCompletion(null); return; }
    setCompletion({ start, end: cursor, items, selected: 0, ...caretPosition(textarea, cursor, items.length) });
  };

  const acceptCompletion = (item: CompletionItem) => {
    if (!completion) return;
    onChange(`${value.slice(0, completion.start)}${item.value}${value.slice(completion.end)}`);
    const cursor = completion.start + item.value.length;
    setCompletion(null);
    editorRef.current?.focus();
    window.requestAnimationFrame(() => editorRef.current?.setSelectionRange(cursor, cursor));
  };

  return <div className="editor-wrap">
    <div className="line-numbers" aria-hidden="true">{value.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
    <pre ref={highlightRef} className="sql-highlight" aria-hidden="true"><code>{highlightSql(value)}{"\n"}</code></pre>
    <textarea ref={editorRef} id="sql-editor" value={value} wrap="off" className={isComposing ? "composing" : ""}
      onChange={(event) => { onChange(event.target.value); updateCompletion(event.currentTarget); }}
      onScroll={(event) => {
        if (highlightRef.current) {
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }
      }}
      onClick={(event) => updateCompletion(event.currentTarget)}
      onKeyUp={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateCompletion(event.currentTarget);
      }}
      onCompositionStart={() => { composing.current = true; setIsComposing(true); setCompletion(null); }}
      onCompositionEnd={(event) => { composing.current = false; setIsComposing(false); updateCompletion(event.currentTarget); }}
      onBlur={() => setCompletion(null)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          setCompletion(null);
          onRun(event.shiftKey ? "submit" : "run");
          return;
        }
        if (completion && !composing.current) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setCompletion({ ...completion, selected: (completion.selected + (event.key === "ArrowDown" ? 1 : -1) + completion.items.length) % completion.items.length });
            return;
          }
          if (event.key === "Tab" || event.key === "Enter") {
            event.preventDefault();
            acceptCompletion(completion.items[completion.selected]);
            return;
          }
          if (event.key === "Escape") { event.preventDefault(); setCompletion(null); return; }
        }
        if (event.key === "Tab") {
          event.preventDefault();
          const target = event.currentTarget;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          onChange(`${value.slice(0, start)}  ${value.slice(end)}`);
          window.requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
        }
      }}
      spellCheck={false} aria-label={`${challenge.title} SQL 编辑器`}
      aria-autocomplete="list" aria-controls={completion ? "sql-completions" : undefined}
      aria-activedescendant={completion ? `sql-completion-${completion.selected}` : undefined} />
    {completion ? <div id="sql-completions" className="sql-completions" role="listbox" aria-label="SQL 补全建议" style={{ top: completion.top, left: completion.left }}>
      <div className="sql-completions-hint">Tab / Enter 补全 · Esc 关闭</div>
      {completion.items.map((item, index) => <button key={`${item.kind}-${item.value}`} id={`sql-completion-${index}`} type="button" role="option" aria-selected={index === completion.selected}
        className={index === completion.selected ? "active" : ""}
        onMouseDown={(event) => event.preventDefault()} onClick={() => acceptCompletion(item)}>
        <span>{item.value}</span><small>{item.kind}</small>
      </button>)}
    </div> : null}
  </div>;
}
