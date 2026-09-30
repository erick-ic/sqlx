"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Download, Upload, RotateCcw } from "lucide-react";

export default function CatalogTools({ hydrated, running, onImport, onExport, onReset }: {
  hydrated: boolean; running: boolean; onImport: () => void; onExport: () => void; onReset: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  const act = (action: () => void) => {
    if (menu.current) menu.current.open = false;
    action();
  };
  return <details ref={menu} className="catalog-tools">
    <summary>题库工具<ChevronDown size={14} /></summary>
    <div className="catalog-tools-menu" role="group" aria-label="题库工具">
      <button type="button" disabled={!hydrated || running} onClick={() => act(onImport)}><Download size={16} /><span>导入题库<small>从 JSON 文件导入整个题库</small></span></button>
      <button type="button" disabled={!hydrated} onClick={() => act(onExport)}><Upload size={16} /><span>导出题库<small>备份整个题库为 JSON 文件</small></span></button>
      <div className="catalog-tools-divider" />
      <button type="button" className="catalog-tools-reset" disabled={!hydrated || running} onClick={() => act(onReset)}><RotateCcw size={16} /><span>重置进度<small>清除全部草稿与通过记录</small></span></button>
    </div>
  </details>;
}
