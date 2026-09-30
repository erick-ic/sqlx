"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseChallenge } from "./challenge-config";
import ManagementDialog from "./ManagementDialog";
import DataSourcePreview from "./DataSourcePreview";
import { inspectDataSource } from "./source-inspector";
import { validateChallengeSql } from "./validate-challenge";
import type { Difficulty, DataSourceInspection, SqlChallenge } from "./types";

type Section = "basic" | "source" | "answer";
const sections: [Section, string][] = [["basic", "题目说明"], ["source", "数据源"], ["answer", "答案与解析"]];

function TextField({ label, value, onChange, multiline = false, code = false, help, type = "text", required = false }: {
  label: string; value: string | number; onChange: (value: string) => void;
  multiline?: boolean; code?: boolean; help?: string; type?: string; required?: boolean;
}) {
  return <label className="management-field"><span className="editor-field-label">{label}{required ? <em className="required-mark" aria-hidden="true">*</em> : null}</span>
    {multiline ? <textarea aria-required={required} aria-label={label} className={code ? "sql-input" : ""} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={!code} rows={code ? 6 : 3} />
      : <input aria-required={required} aria-label={label} type={type} min={type === "number" ? 1 : undefined} value={value} onChange={(e) => onChange(e.target.value)} />}
    {help ? <small>{help}</small> : null}
  </label>;
}

function ListField({ label, values, onChange, lines = false, help, required = false }: {
  label: string; values: string[]; onChange: (values: string[]) => void; lines?: boolean; help?: string; required?: boolean;
}) {
  const [raw, setRaw] = useState(values.join(lines ? "\n" : ", "));
  return <TextField required={required} label={label} value={raw} multiline={lines} help={help ?? (lines ? "每行一项。" : "多个值用逗号分隔。")}
    onChange={(value) => { setRaw(value); onChange(value.split(lines ? /\n/ : /[,，\n]/).map((s) => s.trim()).filter(Boolean)); }} />;
}

function ChapterField({ value, chapters, onChange }: {
  value: string; chapters: string[]; onChange: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState<string[]>([]);
  const options = [...new Set([...chapters, ...created, value].filter(Boolean))];
  const confirm = () => {
    const chapter = name.trim();
    if (!chapter) { setMessage("请输入章节名称。"); return; }
    setCreated((items) => [...new Set([...items, chapter])]);
    onChange(chapter); setAdding(false); setName(""); setMessage("");
  };
  return <div className="management-field">
    <label className="editor-field-label" htmlFor="chapter-select">所属章节<em className="required-mark" aria-hidden="true">*</em></label>
    <div className="chapter-picker-row">
      <select aria-required="true" id="chapter-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {!value ? <option value="">请选择章节</option> : null}
        {options.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
      </select>
    </div>
    <div className="chapter-help"><button type="button" className="chapter-text-button" aria-expanded={adding} onClick={() => { setAdding(true); setMessage(""); }}>新建章节</button><small>选择已有章节，或新建章节后选用。</small></div>
    {adding ? <div className="chapter-create">
      <label htmlFor="new-chapter-name">新章节名称</label>
      <input id="new-chapter-name" value={name} placeholder="例如：字符串处理" onChange={(e) => { setName(e.target.value); setMessage(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } }} />
      {message ? <small role="alert">{message}</small> : null}
      <div className="chapter-picker-row">
        <button type="button" className="chapter-action" onClick={confirm}>创建并选用</button>
        <button type="button" className="chapter-action" onClick={() => { setAdding(false); setName(""); setMessage(""); }}>取消新建</button>
      </div>
      <small>同名章节会直接选用。新章节随题目保存到题库。</small>
    </div> : null}
  </div>;
}

export default function ChallengeEditor({ challenge, chapters, creating, onSave, onClose }: {
  challenge: SqlChallenge; chapters: string[]; creating: boolean; onSave: (value: SqlChallenge) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(challenge));
  const [section, setSection] = useState<Section>("basic");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ sql: string; inspection: DataSourceInspection } | null>(null);
  const previewController = useRef<AbortController | null>(null);
  useEffect(() => () => previewController.current?.abort(), []);
  const busy = saving || previewing;
  const stepIndex = sections.findIndex(([key]) => key === section);
  const inspect = async () => {
    if (busy) return;
    setPreviewing(true); setError("");
    const controller = new AbortController();
    previewController.current = controller;
    try {
      const inspection = await inspectDataSource(draft.dataSource.setupSql, draft.dataSource.tables, controller.signal);
      setPreview({ sql: draft.dataSource.setupSql, inspection });
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "数据源解析失败。");
    } finally { if (!controller.signal.aborted) setPreviewing(false); }
  };
  const update = <K extends keyof SqlChallenge>(key: K, value: SqlChallenge[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const close = () => {
    if (JSON.stringify(draft) !== JSON.stringify(challenge) && !window.confirm("有尚未保存的修改，确定放弃吗？")) return;
    onClose();
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true); setError("");
    try {
      const required: [Section, string, unknown][] = [
        ["basic", "题目标题", draft.title], ["basic", "所属章节", draft.chapter], ["basic", "一句话简介", draft.summary], ["basic", "题目要求", draft.task],
        ["basic", "输出字段", draft.output.length], ["source", "数据源 SQL", draft.dataSource.setupSql],
        ["answer", "初始代码", draft.starterSql], ["answer", "参考答案", draft.referenceSql],
        ["answer", "提示 1", draft.hints[0]], ["answer", "提示 2", draft.hints[1]],
        ["answer", "解题解析", draft.analysis], ["answer", "语法说明", draft.dialectNote],
      ];
      for (const [tab, label, value] of required) {
        if (typeof value === "string" ? !value.trim() : !value) { setSection(tab); throw new Error(`请填写${label}。`); }
      }
      if (!Number.isInteger(draft.number) || draft.number <= 0) { setSection("basic"); throw new Error("题目编号必须是正整数。"); }
      for (const [index, test] of draft.tests.entries()) {
        if (!test.name.trim() || !test.setupSql.trim()) { setSection("source"); throw new Error(`请填写补充测试数据 ${index + 1} 的名称和完整初始化 SQL。`); }
      }
      for (const [index, check] of draft.qualityChecks.entries()) {
        if (!check.label.trim() || !check.success.trim() || !check.suggestion.trim()) { setSection("answer"); throw new Error(`请补全写法建议 ${index + 1} 的标题、达标说明和改进说明。`); }
      }
      const next = parseChallenge(draft);
      onSave(await validateChallengeSql(next));
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败，请检查填写内容。"); }
    finally { setSaving(false); }
  };

  return <ManagementDialog title={creating ? "新增题目" : "编辑题目"} busy={busy} onClose={close} className="challenge-editor-dialog">
    <form onSubmit={(event) => void save(event)} noValidate>
      <nav className="management-tabs" aria-label="题目编辑步骤">{sections.map(([key, label], i) =>
        <button type="button" key={key} disabled={busy} className={section === key ? "active" : ""} aria-current={section === key ? "step" : undefined} onClick={() => setSection(key)}><span>{i + 1}</span>{label}</button>)}</nav>
      <div key={section} className="management-scroll-region" role="region" aria-label="题目编辑内容">
        <fieldset disabled={busy} className="management-fieldset">
        <div className="management-body">
          {section === "basic" ? <>
            <section className="challenge-form-section"><h3>基本信息</h3><p className="management-note">设置题目名称、章节与难度。</p>
            <div className="management-grid"><TextField required label="题目编号" type="number" value={draft.number} onChange={(v) => update("number", Number(v))} />
              <TextField required label="题目标题" value={draft.title} onChange={(v) => update("title", v)} /></div>
            <div className="management-grid"><ChapterField value={draft.chapter} chapters={chapters} onChange={(value) => update("chapter", value)} />
              <label className="management-field"><span className="editor-field-label">难度<em className="required-mark" aria-hidden="true">*</em></span><select aria-required="true" value={draft.difficulty} onChange={(e) => update("difficulty", e.target.value as Difficulty)}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label></div>
            </section>
            <section className="challenge-form-section"><h3>题目内容</h3>
            <TextField required label="一句话简介" value={draft.summary} onChange={(v) => update("summary", v)} />
            <TextField required label="题目要求" value={draft.task} multiline onChange={(v) => update("task", v)} />
            <ListField required label="输出字段" values={draft.output} onChange={(v) => update("output", v)} help="按查询结果的列顺序填写，用逗号分隔，例如：id, total。" />
            </section>
            <details className="editor-options"><summary>补充设置 · 标签与排序</summary>
            <ListField label="知识点标签" values={draft.tags} onChange={(v) => update("tags", v)} />
            <label className="management-checkbox"><input type="checkbox" checked={draft.orderSensitive} onChange={(e) => update("orderSensitive", e.target.checked)} />要求结果行按指定顺序排列</label>
            </details>
          </> : null}
          {section === "source" ? <>
            <p className="management-note">完整 SQL 就是本题数据源。直接填写 DROP TABLE、CREATE TABLE、INSERT 等初始化语句，无需再配置默认测试数据或手动填写表结构。</p>
            <TextField required label="数据源 SQL" value={draft.dataSource.setupSql} multiline code help="运行和提交都会在全新数据库中执行这份完整脚本。" onChange={(v) => update("dataSource", { ...draft.dataSource, setupSql: v })} />
            <div className="collection-heading"><h3>自动解析与样例预览</h3><button type="button" className="secondary-button" disabled={busy} onClick={() => void inspect()}>{previewing ? "解析中…" : "解析并预览数据"}</button></div>
            {preview?.sql === draft.dataSource.setupSql ? <DataSourcePreview inspection={preview.inspection} /> : <p className="management-note">{preview ? "SQL 已变更，请重新解析预览。" : "点击解析即可自动读取表名、字段、类型及样例数据；保存时也会自动解析。"}</p>}
            <details className="advanced-tests"><summary>补充测试数据（可选，{draft.tests.length} 组）<small>独立建库，验证边界情况</small></summary>
              <p className="management-note">填写每组完整的初始化 SQL，可检验空表、重复值等情况；不会与默认数据叠加。</p>
              {draft.tests.map((test, index) => {
                const setTest = (next: typeof test) => update("tests", draft.tests.map((t, i) => i === index ? next : t));
                return <section className="management-card" key={test.id} aria-label={`补充测试数据 ${index + 1}`}>
                  <div className="collection-heading"><h4>补充测试数据 {index + 1}</h4><button type="button" className="danger-button" onClick={() => update("tests", draft.tests.filter((_, i) => i !== index))}>移除</button></div>
                  <div className="management-grid"><TextField required label={`补充测试数据 ${index + 1} 名称`} value={test.name} onChange={(v) => setTest({ ...test, name: v })} />
                    <label className="management-field"><span>补充测试数据 {index + 1} 可见性</span><select value={test.visibility} onChange={(e) => setTest({ ...test, visibility: e.target.value as "public" | "hidden" })}><option value="public">公开样例（运行与提交）</option><option value="hidden">隐藏测试（仅提交）</option></select></label></div>
                  <TextField required label={`补充测试数据 ${index + 1} 完整 SQL`} value={test.setupSql} multiline code help="包含建表及本组数据 INSERT；空数据测试只需建表。" onChange={(v) => setTest({ ...test, setupSql: v })} />
                  <TextField label={`补充测试数据 ${index + 1} 边界提示`} value={test.boundaryHint} onChange={(v) => setTest({ ...test, boundaryHint: v })} />
                </section>;
              })}
              <button type="button" className="secondary-button" onClick={() => update("tests", [...draft.tests, { id: `test-${crypto.randomUUID()}`, name: `补充测试数据 ${draft.tests.length + 1}`, visibility: "hidden", setupSql: draft.dataSource.setupSql, boundaryHint: "" }])}>添加补充数据</button>
            </details>
          </> : null}
          {section === "answer" ? <>
            <section className="challenge-form-section"><h3>SQL 配置</h3><p className="management-note">初始代码提供给答题者，参考答案用于判题。</p>
            <TextField required label="初始代码" value={draft.starterSql} multiline code onChange={(v) => update("starterSql", v)} />
            <TextField required label="参考答案" value={draft.referenceSql} multiline code help="只允许一条 SELECT 或 WITH 查询；保存时会在全部测试中验证。" onChange={(v) => update("referenceSql", v)} />
            </section>
            <section className="challenge-form-section"><h3>答题提示与解题说明</h3><p className="management-note">提示 1、2 供答题时逐步查看；解题解析和语法说明显示在题目的“解析”页。</p>
            <div className="management-grid">{draft.hints.map((hint, i) => <TextField required key={i} label={`提示 ${i + 1}`} value={hint} multiline onChange={(v) => update("hints", draft.hints.map((h, index) => index === i ? v : h) as [string, string])} />)}</div>
            <TextField required label="解题解析" value={draft.analysis} multiline onChange={(v) => update("analysis", v)} />
            <TextField required label="语法说明" value={draft.dialectNote} multiline onChange={(v) => update("dialectNote", v)} />
            </section>
            <details className="editor-options"><summary>补充说明 · 易错点（可选）</summary><ListField label="易错点" values={draft.pitfalls} lines onChange={(v) => update("pitfalls", v)} /></details>
            <details className="quality-editor"><summary>SQL 写法建议（可选，{draft.qualityChecks.length} 条）<small>影响“已优化”标记，不影响答案正确性</small></summary>
              <p className="management-note">按正则表达式检查提交的 SQL 写法。符合规则时显示达标说明，不符合时显示改进说明；不参与结果正确性判定。</p>
              {draft.qualityChecks.map((check, index) => {
                const setCheck = (next: typeof check) => update("qualityChecks", draft.qualityChecks.map((c, i) => i === index ? next : c));
                return <section className="management-card" key={check.id}>
                  <div className="collection-heading"><h4>建议 {index + 1}</h4><button type="button" className="danger-button" onClick={() => update("qualityChecks", draft.qualityChecks.filter((_, i) => i !== index))}>移除建议</button></div>
                  <TextField required label={`建议 ${index + 1} 标题`} value={check.label} onChange={(v) => setCheck({ ...check, label: v })} />
                  <TextField required label={`建议 ${index + 1} 符合规则时显示`} value={check.success} onChange={(v) => setCheck({ ...check, success: v })} />
                  <TextField required label={`建议 ${index + 1} 未符合时显示`} value={check.suggestion} onChange={(v) => setCheck({ ...check, suggestion: v })} />
                  {([['allOf', '必须全部匹配'], ['anyOf', '至少匹配一项'], ['noneOf', '禁止匹配']] as const).map(([key, label]) => <ListField key={key} label={`建议 ${index + 1} ${label}`} values={check[key] ?? []} lines help="每行一条正则表达式；不需要此条件时留空。" onChange={(v) => { const next = { ...check }; if (v.length) next[key] = v; else delete next[key]; setCheck(next); }} />)}
                </section>;
              })}
              <button type="button" className="secondary-button" onClick={() => update("qualityChecks", [...draft.qualityChecks, { id: `quality-${crypto.randomUUID()}`, label: "", success: "", suggestion: "" }])}>添加写法建议</button>
            </details>
          </> : null}
        </div>
        </fieldset>
      </div>
      {error ? <p className="config-error" role="alert">{error}</p> : null}
      <footer className="management-footer"><span>保存前解析完整 SQL 并验证参考答案。</span><div>
        <button type="button" className="secondary-button" disabled={busy} onClick={close}>取消</button>
        {stepIndex > 0 ? <button className="secondary-button" type="button" disabled={busy} onClick={() => setSection(sections[stepIndex - 1][0])}>上一步</button> : null}
        {stepIndex < sections.length - 1 ? <button key="next-step" className="primary-button" type="button" disabled={busy} onClick={(event) => { event.preventDefault(); setSection(sections[stepIndex + 1][0]); }}>下一步</button>
          : <button key="save-challenge" className="primary-button" type="submit" disabled={busy}>{saving ? "校验并保存中…" : "保存题目"}</button>}
      </div></footer>
    </form>
  </ManagementDialog>;
}
