"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  Lightbulb,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Play,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Table2,
  Terminal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { judgeChallenge } from "./judge";
import { getChapters, challenges as defaultChallenges } from "./problems";
import { appendMissingChallenges, FEISHU_UPDATE_STORAGE_KEY, CHAPTER_UPDATE_STORAGE_KEY, updateFeishuChapters, updateGenericStarterSql, removeStarterComments, addMissingQualityChecks } from "./catalog-updates";
import ChallengeEditor from "./ChallengeEditor";
import CatalogTools from "./CatalogTools";
import ChapterOrderDialog from "./ChapterOrderDialog";
import ChallengeSourceContent from "./ChallengeSourceContent";
import CatalogImportDialog from "./CatalogImportDialog";
import DeleteChallengesDialog from "./DeleteChallengesDialog";
import ManagementDialog from "./ManagementDialog";
import SqlEditor from "./SqlEditor";
import { exportCatalog, unchangedChallengeIds } from "./catalog-transfer";
import { CATALOG_STORAGE_KEY, createChallengeTemplate, parseChallengeCatalog, saveChallenge } from "./challenge-config";
import { parseDrafts, parseProgress, parsePreferences, type Filter, type ProgressEntry, type ProgressState, type DraftState } from "./local-state";
import type {
  JudgeReport,
  SqlChallenge,
  SqlResultSet,
  SqlScalar,
  VerdictCode,
} from "./types";

type ContentTab = "problem" | "analysis";
type ResultTab = "output" | "tests" | "quality";
type MobileTab = "problem" | "code" | "result";

const STORAGE = {
  progress: "sql-practice:v1:progress",
  drafts: "sql-practice:v1:accepted-sql",
  legacyDrafts: "sql-practice:v1:drafts",
  preferences: "sql-practice:v1:preferences",
} as const;
const EDITOR_SIZE_STORAGE_KEY = "sql-practice:v1:editor-size";
const DEFAULT_EDITOR_PERCENT = 56;

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
} as const;

const verdictLabel: Record<VerdictCode, string> = {
  ACCEPTED: "通过",
  INVALID_QUERY: "查询被拒绝",
  SQL_ERROR: "SQL 错误",
  WRONG_COLUMNS: "输出列不一致",
  WRONG_ROW_COUNT: "行数不一致",
  WRONG_ANSWER: "答案不一致",
  TIME_LIMIT_EXCEEDED: "执行超时",
  OUTPUT_LIMIT_EXCEEDED: "输出过多",
  INTERNAL_ERROR: "判题器异常",
};

function formatValue(value: SqlScalar) {
  if (value === null) return <span className="null-value">NULL</span>;
  if (value === "") return <span className="empty-value">空字符串</span>;
  return String(value);
}

function ResultTable({ result, label }: { result: SqlResultSet; label?: string }) {
  const shownRows = result.rows.slice(0, 100);
  return (
    <div className="result-table-wrap">
      {label ? <div className="result-table-label">{label}</div> : null}
      <table className="data-table result-table">
        <thead>
          <tr>
            {result.columns.map((column, index) => (
              <th key={`${column}-${index}`}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shownRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, columnIndex) => (
                <td key={columnIndex}>{formatValue(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 ? (
        <div className="empty-rows">查询成功，返回 0 行。</div>
      ) : null}
      {result.rows.length > shownRows.length ? (
        <div className="table-truncated">仅展示前 {shownRows.length} 行</div>
      ) : null}
    </div>
  );
}

function CodeBlock({ children, copyable = false }: { children: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopyError(""); setCopied(true);
      window.setTimeout(() => setCopied(false), 1_400);
    } catch { setCopyError("复制失败，请选中 SQL 手动复制，或使用 HTTPS / localhost 访问。"); }
  };

  return (
    <div className="code-block-wrap">
      {copyError ? <p className="config-error" role="alert">{copyError}</p> : null}
      {copyable ? (
        <button className="copy-button icon-button" type="button" onClick={copy} title="复制 SQL">
          {copied ? <Check size={15} /> : <Copy size={15} />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      ) : null}
      <pre className="code-block"><code>{children}</code></pre>
    </div>
  );
}

function ProgressMark({ progress }: { progress?: ProgressEntry }) {
  if (!progress?.passed) return <Circle className="status-empty" size={17} aria-label="未完成" />;
  if (progress.optimized) {
    return (
      <span className="optimized-mark" aria-label="已通过且写法推荐">
        <CheckCircle2 size={17} />
        <Sparkles size={9} />
      </span>
    );
  }
  return <CheckCircle2 className="status-passed" size={17} aria-label="已通过" />;
}

function statusTone(verdict?: VerdictCode) {
  if (!verdict) return "neutral";
  if (verdict === "ACCEPTED") return "success";
  if (verdict === "INTERNAL_ERROR") return "warning";
  return "danger";
}

function ProblemContent({ challenge }: { challenge: SqlChallenge }) {
  return (
    <div className="problem-content">
      <section className="task-callout" aria-labelledby="task-title">
        <span className="section-kicker">题目要求</span>
        <p id="task-title">{challenge.task}</p>
      </section>

      <section className="content-section">
        <h2>输出字段</h2>
        <div className="field-list">
          {challenge.output.map((field) => <code key={field}>{field}</code>)}
        </div>
        <p className="section-note">
          {challenge.orderSensitive ? "本题按结果顺序比较，请保留题目要求的 ORDER BY。" : "本题忽略行顺序，但重复行数量仍参与比较。"}
        </p>
      </section>

      <section className="content-section">
        <h2><Table2 size={16} /> 数据源 SQL · 表结构与样例数据</h2>
        <ChallengeSourceContent key={`${challenge.id}:${challenge.dataSource.setupSql}`} challenge={challenge} />
      </section>

      <section className="content-section hints-section">
        <h2><Lightbulb size={16} /> 提示</h2>
        {challenge.hints.map((hint, index) => (
          <details key={hint} className="hint-item">
            <summary>提示 {index + 1}<ChevronRight size={15} /></summary>
            <p>{hint}</p>
          </details>
        ))}
      </section>
    </div>
  );
}

function AnalysisContent({ challenge }: { challenge: SqlChallenge }) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="problem-content analysis-content">
      <section className="content-section analysis-lead">
        <span className="section-kicker">解题解析</span>
        <p>{challenge.analysis}</p>
      </section>

      <section className="content-section">
        <h2>易错点</h2>
        <ul className="pitfall-list">
          {challenge.pitfalls.map((pitfall) => <li key={pitfall}>{pitfall}</li>)}
        </ul>
      </section>

      <section className="content-section">
        <div className="solution-heading">
          <div>
            <h2><Code2 size={16} /> 参考答案</h2>
            <p>先独立完成，再对照列名、粒度和边界条件。</p>
          </div>
          <button className="secondary-button compact" type="button" onClick={() => setShowAnswer((value) => !value)}>
            {showAnswer ? <EyeOff size={15} /> : <Eye size={15} />}
            {showAnswer ? "收起答案" : "显示答案"}
          </button>
        </div>
        {showAnswer ? <CodeBlock copyable>{challenge.referenceSql}</CodeBlock> : <div className="answer-placeholder">参考答案已折叠，不影响运行与提交。</div>}
      </section>

      <section className="dialect-note">
        <Database size={17} />
        <div><strong>语法说明</strong><p>{challenge.dialectNote}</p></div>
      </section>
    </div>
  );
}

function ResultPanel({
  report,
  resultTab,
  setResultTab,
  activeCaseId,
  setActiveCaseId,
  running,
}: {
  report: JudgeReport | null;
  resultTab: ResultTab;
  setResultTab: (tab: ResultTab) => void;
  activeCaseId: string | null;
  setActiveCaseId: (id: string) => void;
  running: boolean;
}) {
  const activeCase = report?.cases.find((item) => item.caseId === activeCaseId) ?? report?.cases[0];

  return (
    <section className={`result-panel ${running ? "is-running" : ""}`} id="run-result" aria-live="polite" aria-busy={running}>
      <div className="result-tabs" role="tablist" aria-label="判题结果">
        {([
          ["output", "执行结果"],
          ["tests", "测试用例"],
          ["quality", "写法建议"],
        ] as const).map(([tab, label]) => (
          <button key={tab} type="button" role="tab" aria-selected={resultTab === tab} className={resultTab === tab ? "active" : ""} onClick={() => setResultTab(tab)}>
            {label}
            {tab === "tests" && report ? <span>{report.cases.filter((item) => item.verdict === "ACCEPTED").length}/{report.cases.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="result-body">
        {running ? (
          <div className="running-banner"><LoaderCircle className="spin" size={16} /> 正在启动隔离数据库并执行测试…</div>
        ) : null}

        {!report && !running ? (
          <div className="result-empty">
            <Terminal size={26} />
            <strong>运行公开样例查看结果</strong>
            <p>“运行”只测公开数据；“提交”还会执行隐藏边界用例。</p>
          </div>
        ) : null}

        {report ? (
          <>
            {resultTab === "tests" ? (
              <div className="tests-view">
                <div className="test-list">{report.cases.map((testCase) => (
                  <button key={testCase.caseId} type="button" className={`test-row ${activeCase?.caseId === testCase.caseId ? "active" : ""}`} onClick={() => {
                    setActiveCaseId(testCase.caseId);
                    if (testCase.visibility === "public") setResultTab("output");
                  }}>
                    <span className={`test-icon tone-${statusTone(testCase.verdict)}`}>
                      {testCase.verdict === "ACCEPTED" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
                    </span>
                    <span className="test-name">
                      <strong title={testCase.name}>{testCase.name}</strong>
                      <small>{testCase.visibility === "hidden" ? <><LockKeyhole size={11} /> 隐藏边界</> : "公开数据"}</small>
                    </span>
                    <span className="test-verdict">{verdictLabel[testCase.verdict]}</span>
                    <span className="test-time">{Math.round(testCase.elapsedMs)} ms</span>
                  </button>
                ))}</div>
                {activeCase?.verdict !== "ACCEPTED" ? (
                  <div className="failure-detail">
                    <strong>{activeCase?.message}</strong>
                    {activeCase?.boundaryHint ? <p>{activeCase.boundaryHint}</p> : null}
                  </div>
                ) : null}
                {report.mode === "run" ? <p className="test-scope-note">本次仅运行公开样例；提交后会检查隐藏边界用例。</p> : null}
              </div>
            ) : null}

            {resultTab === "output" ? (
              <div className="output-view">
                <div className={`run-summary tone-${statusTone(report.verdict)}`} role={report.passed ? "status" : "alert"}>
                  {report.passed ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  <div>
                    <strong>{report.passed ? (report.mode === "submit" ? "全部测试通过" : "公开样例通过") : verdictLabel[report.verdict]}</strong>
                    <span>{Math.round(report.elapsedMs)} ms · {report.mode === "submit" ? "提交校验" : "公开运行"}</span>
                  </div>
                  {report.passed && !report.optimized ? <span className="quality-badge">结果正确 · 仍可优化</span> : null}
                  {report.passed && report.optimized ? <span className="optimized-badge"><Sparkles size={12} /> 推荐写法</span> : null}
                </div>
                {!activeCase ? null : activeCase.visibility === "hidden" ? (
                  <div className="hidden-output"><LockKeyhole size={21} /><strong>隐藏用例不展示完整数据</strong><p>{activeCase.message}</p>{activeCase.boundaryHint ? <span>{activeCase.boundaryHint}</span> : null}</div>
                ) : (
                  <>
                    <div className="case-message">
                      <strong>{activeCase.name}</strong>
                      <span title={activeCase.verdict === "ACCEPTED" ? undefined : activeCase.message}>{activeCase.verdict === "ACCEPTED" && activeCase.actual ? `${activeCase.actual.rows.length} 行 · ${activeCase.actual.columns.length} 列` : activeCase.message}</span>
                    </div>
                    {activeCase.verdict !== "ACCEPTED" && activeCase.actual && activeCase.expected ? (
                      <div className="diff-grid">
                        <ResultTable result={activeCase.actual} label="你的输出" />
                        <ResultTable result={activeCase.expected} label="预期输出" />
                      </div>
                    ) : activeCase.actual ? <ResultTable result={activeCase.actual} /> : null}
                  </>
                )}
              </div>
            ) : null}

            {resultTab === "quality" ? (
              <div className="quality-list">
                <p className="quality-intro">以下建议不参与正确性判定，只帮助你写出语义更清楚、通常也更稳健的 SQL。</p>
                {report.quality.map((finding) => (
                  <div className={`quality-item ${finding.passed ? "passed" : "suggestion"}`} key={finding.id}>
                    <div className="quality-item-heading">
                      {finding.passed ? <Sparkles size={17} aria-hidden="true" /> : <Lightbulb size={17} aria-hidden="true" />}
                      <strong>{finding.label}</strong>
                    </div>
                    <p>{finding.message}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function SqlLab() {
  const [chapterOrder, setChapterOrder] = useState<string[]>([]);
  const [sortingChapters, setSortingChapters] = useState(false);
  const [challenges, setChallenges] = useState(defaultChallenges);
  const [editing, setEditing] = useState<{ challenge: SqlChallenge; creating: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [pendingChallenge, setPendingChallenge] = useState<SqlChallenge | null>(null);
  const [selectedId, setSelectedId] = useState(challenges[0].id);
  const [sql, setSql] = useState(challenges[0].starterSql);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [progress, setProgress] = useState<ProgressState>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [contentTab, setContentTab] = useState<ContentTab>("problem");
  const [resultTab, setResultTab] = useState<ResultTab>("output");
  const [mobileTab, setMobileTab] = useState<MobileTab>("problem");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [report, setReport] = useState<JudgeReport | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [editorPercent, setEditorPercent] = useState(DEFAULT_EDITOR_PERCENT);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const codingPaneRef = useRef<HTMLElement>(null);
  const problemScrollRef = useRef<HTMLDivElement>(null);
  const analysisScrollRef = useRef<HTMLDivElement>(null);
  const contentScrollPositions = useRef<Record<string, number>>({});
  const resizePointer = useRef<number | null>(null);
  const persistLearningState = useCallback((key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { setCatalogError("本地记录保存失败，可能是存储空间不足或浏览器禁用了存储。请保留当前 SQL 后重试。"); }
  }, []);

  useEffect(() => {
    if (!catalogNotice) return;
    const timer = window.setTimeout(() => setCatalogNotice(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [catalogNotice]);

  useEffect(() => {
    if (!catalogError || deleting) return;
    const timer = window.setTimeout(() => setCatalogError(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [catalogError, deleting]);

  const challenge = challenges.find((item) => item.id === selectedId) ?? defaultChallenges[0];
  useLayoutEffect(() => {
    const panel = contentTab === "problem" ? problemScrollRef.current : analysisScrollRef.current;
    if (panel) panel.scrollTop = contentScrollPositions.current[`${challenge.id}:${contentTab}`] ?? 0;
  }, [challenge.id, contentTab]);
  const completedCount = challenges.filter((item) => progress[item.id]?.passed).length;
  const completionPercent = challenges.length ? Math.round((completedCount / challenges.length) * 100) : 0;

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      let catalog = defaultChallenges;
      try {
        const saved = localStorage.getItem(CATALOG_STORAGE_KEY);
        if (saved !== null) catalog = parseChallengeCatalog(JSON.parse(saved));
      } catch (error) {
        setCatalogError(`本地题库加载失败，已显示内置题库：${error instanceof Error ? error.message : "配置损坏"}`);
      }
      try {
        if (localStorage.getItem(FEISHU_UPDATE_STORAGE_KEY) !== "applied") {
          const update = appendMissingChallenges(catalog, defaultChallenges.filter((item) => item.id.startsWith("feishu-")));
          catalog = update.catalog;
          // Persist the catalog before its marker so a failed write can be retried.
          if (update.added > 0) {
            localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
            setCatalogNotice(`已补充 ${update.added} 道飞书实战题，保留原有题目和学习记录。`);
          }
          localStorage.setItem(FEISHU_UPDATE_STORAGE_KEY, "applied");
        }
        if (localStorage.getItem(CHAPTER_UPDATE_STORAGE_KEY) !== "applied") {
          const update = updateFeishuChapters(catalog, defaultChallenges);
          catalog = update.catalog;
          if (update.changed > 0) {
            localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
            setCatalogNotice(`已按知识点调整 ${update.changed} 道题的章节。`);
          }
          localStorage.setItem(CHAPTER_UPDATE_STORAGE_KEY, "applied");
        }
        const starterUpdate = updateGenericStarterSql(catalog, defaultChallenges);
        catalog = starterUpdate.catalog;
        if (starterUpdate.changed > 0) {
          localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
          setCatalogNotice(`已优化 ${starterUpdate.changed} 道题的初始代码。`);
        }
        const commentUpdate = removeStarterComments(catalog);
        catalog = commentUpdate.catalog;
        if (commentUpdate.changed > 0) localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
        const qualityUpdate = addMissingQualityChecks(catalog, defaultChallenges);
        catalog = qualityUpdate.catalog;
        if (qualityUpdate.changed > 0) localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
      } catch (error) {
        setCatalogError(`飞书题库更新未能保存：${error instanceof Error ? error.message : "存储不可用"}；请检查浏览器存储后刷新重试。`);
      }
      setChallenges(catalog);
      const read = (key: string) => {
        try { return localStorage.getItem(key); }
        catch { return null; }
      };
      try {
        const savedOrder: unknown = JSON.parse(read("sql-practice:v1:chapter-order") ?? "[]");
        if (Array.isArray(savedOrder) && savedOrder.every((item) => typeof item === "string")) setChapterOrder(savedOrder);
      } catch { /* Invalid preferences fall back to the default learning sequence. */ }
      const storedProgress = parseProgress(read(STORAGE.progress));
      const storedDrafts = Object.fromEntries(Object.entries(parseDrafts(read(STORAGE.drafts)))
        .filter(([id]) => storedProgress[id]?.passed && catalog.some((item) => item.id === id)));
      const preferences = parsePreferences(read(STORAGE.preferences));
      const savedEditorPercent = Number(read(EDITOR_SIZE_STORAGE_KEY));
      if (Number.isFinite(savedEditorPercent) && savedEditorPercent >= 30 && savedEditorPercent <= 70) setEditorPercent(savedEditorPercent);
      const restored = catalog.find((item) => item.id === preferences.selectedId) ?? catalog[0] ?? defaultChallenges[0];
      setDrafts(storedDrafts);
      setProgress(storedProgress);
      setSelectedId(restored.id);
      setFilter(preferences.filter ?? "all");
      setSql(storedProgress[restored.id]?.passed ? storedDrafts[restored.id] ?? restored.starterSql : restored.starterSql);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const flush = () => persistLearningState(STORAGE.drafts, drafts);
    const timer = window.setTimeout(flush, 0);
    window.addEventListener("pagehide", flush);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", flush); };
  }, [drafts, hydrated, persistLearningState]);

  useEffect(() => {
    if (!hydrated) return;
    const flush = () => persistLearningState(STORAGE.progress, progress);
    const timer = window.setTimeout(flush, 0);
    window.addEventListener("pagehide", flush);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", flush); };
  }, [hydrated, progress, persistLearningState]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => persistLearningState(STORAGE.preferences, { selectedId, filter }), 0);
    return () => window.clearTimeout(timer);
  }, [filter, hydrated, selectedId, persistLearningState]);

  useEffect(() => {
    const syncProgress = (event: StorageEvent) => {
      if (event.key === STORAGE.progress) setProgress(parseProgress(event.newValue));
    };
    window.addEventListener("storage", syncProgress);
    return () => window.removeEventListener("storage", syncProgress);
  }, []);

  const filteredChallenges = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return challenges.filter((item) => {
      const matchesKeyword = !keyword || `${item.number} ${item.title} ${item.tags.join(" ")} ${item.chapter}`.toLowerCase().includes(keyword);
      const isPassed = Boolean(progress[item.id]?.passed);
      const matchesFilter = filter === "all" || (filter === "passed" ? isPassed : !isPassed);
      return matchesKeyword && matchesFilter;
    });
  }, [challenges, filter, progress, search]);

  const switchChallenge = (next: SqlChallenge) => {
    setSelectedId(next.id);
    setSql(progress[next.id]?.passed ? drafts[next.id] ?? next.starterSql : next.starterSql);
    setReport(null);
    setActiveCaseId(null);
    setContentTab("problem");
    setResultTab("output");
    setMobileTab("problem");
    setSidebarOpen(false);
  };

  const selectChallenge = (next: SqlChallenge) => {
    if (running) return;
    if (next.id === selectedId) { setSidebarOpen(false); return; }
    const savedSql = progress[selectedId]?.passed ? drafts[selectedId] ?? challenge.starterSql : challenge.starterSql;
    if (sql !== savedSql) { setPendingChallenge(next); return; }
    switchChallenge(next);
  };

  const resizeEditor = (clientY: number) => {
    const pane = codingPaneRef.current;
    if (!pane) return editorPercent;
    const bounds = pane.getBoundingClientRect();
    const next = clampEditorPercent((clientY - bounds.top) / bounds.height * 100);
    setEditorPercent(next);
    return next;
  };
  const clampEditorPercent = (value: number) => {
    const height = codingPaneRef.current?.getBoundingClientRect().height ?? 800;
    const min = Math.max(30, Math.ceil(280 / height * 100));
    const max = Math.min(70, Math.floor((height - 244) / height * 100));
    return Math.min(Math.max(min, max), Math.max(min, Math.round(value)));
  };
  const saveEditorSize = (value: number) => {
    const next = clampEditorPercent(value);
    setEditorPercent(next);
    try { localStorage.setItem(EDITOR_SIZE_STORAGE_KEY, String(next)); }
    catch { setCatalogError("编辑区大小保存失败，请检查浏览器的本地存储设置。"); }
  };

  const run = async (mode: "run" | "submit") => {
    if (running) return;
    setRunning(true);
    setResultTab(mode === "run" ? "output" : "tests");
    setMobileTab("result");
    try {
      const nextReport = await judgeChallenge(challenge, sql, mode);
      setReport(nextReport);
      const failure = nextReport.cases.find((item) => item.verdict !== "ACCEPTED");
      setActiveCaseId((failure ?? nextReport.cases[0])?.caseId ?? null);
      if (mode === "submit" && nextReport.passed) {
        setDrafts((current) => ({ ...current, [challenge.id]: sql }));
        setProgress((current) => ({
          ...current,
          [challenge.id]: {
            passed: true,
            optimized: nextReport.optimized,
            passedAt: new Date().toISOString(),
          },
        }));
      }
    } catch (error) {
      setCatalogError(`判题失败，请重试：${error instanceof Error ? error.message : "SQL 引擎异常"}`);
    } finally { setRunning(false); }
  };

  const resetCurrent = () => {
    setSql(challenge.starterSql);
    setReport(null);
    setActiveCaseId(null);
    editorRef.current?.focus();
  };

  const resetAll = () => {
    if (!window.confirm("将清除全部题目的本地草稿、通过记录和最近选择。题库配置会保留。确定继续吗？")) return;
    try { Object.values(STORAGE).forEach((key) => localStorage.removeItem(key)); }
    catch { setCatalogError("重置失败，浏览器无法访问本地存储。请检查存储设置后重试。"); return; }
    setDrafts({});
    setProgress({});
    setSelectedId(challenges[0]?.id ?? defaultChallenges[0].id);
    setSql(challenges[0]?.starterSql ?? "");
    setReport(null);
    setFilter("all");
  };

  const saveConfig = (next: SqlChallenge) => {
    const catalog = saveChallenge(challenges, next, editing?.creating ? undefined : editing?.challenge.id);
    // Persist first so a quota/storage error keeps the editor and original catalog intact.
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    setChallenges(catalog);
    setProgress((current) => { const updated = { ...current }; delete updated[next.id]; return updated; });
    setDrafts((current) => { const updated = { ...current }; delete updated[next.id]; return updated; });
    setSelectedId(next.id);
    setSql(next.starterSql);
    setReport(null);
    setActiveCaseId(null);
    setSearch("");
    setFilter("all");
    setEditing(null);
    setCatalogError("");
    setCatalogNotice("题目已保存。");
    setContentTab("problem");
  };

  const removeConfig = (ids: string[]) => {
    const removed = new Set(ids);
    try {
      const catalog = challenges.filter((item) => !removed.has(item.id));
      localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
      setChallenges(catalog);
      setDrafts((current) => { const next = { ...current }; for (const id of removed) delete next[id]; return next; });
      setProgress((current) => { const next = { ...current }; for (const id of removed) delete next[id]; return next; });
      if (removed.has(selectedId)) {
        const next = catalog[0];
        setSelectedId(next?.id ?? "");
        setSql(next ? (progress[next.id]?.passed ? drafts[next.id] ?? next.starterSql : next.starterSql) : "");
        setReport(null); setActiveCaseId(null);
      }
      setDeleting(false);
      setCatalogError("");
      setCatalogNotice(`已删除 ${removed.size} 道题目。`);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "删除失败");
    }
  };

  const downloadCatalog = () => {
    try {
      const blob = new Blob([exportCatalog(challenges)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      link.download = `sql-practice-catalog-${timestamp}.json`;
      document.body.appendChild(link);
      link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setCatalogError("");
      setCatalogNotice(`已导出整个题库（${challenges.length} 道题）。`);
    } catch (error) { setCatalogError(error instanceof Error ? error.message : "导出失败"); }
  };

  const replaceCatalog = (incoming: SqlChallenge[]) => {
    const unchanged = unchangedChallengeIds(challenges, incoming);
    const nextDrafts = Object.fromEntries(Object.entries(drafts).filter(([id]) => unchanged.has(id) && progress[id]?.passed));
    const nextProgress = Object.fromEntries(Object.entries(progress).filter(([id]) => unchanged.has(id)));
    // Save the catalog first; failure keeps the dialog and current catalog intact.
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(incoming));
    setChallenges(incoming); setDrafts(nextDrafts); setProgress(nextProgress);
    const next = incoming.find((item) => item.id === selectedId) ?? incoming[0];
    setSelectedId(next?.id ?? "");
    setSql(next ? (nextProgress[next.id]?.passed ? nextDrafts[next.id] ?? next.starterSql : next.starterSql) : "");
    setReport(null); setActiveCaseId(null);
    setFilter("all"); setSearch(""); setContentTab("problem");
    setImporting(false); setCatalogError("");
    setCatalogNotice(`已导入整个题库（${incoming.length} 道题）。`);
  };

  const tools = <CatalogTools hydrated={hydrated} running={running} onImport={() => setImporting(true)} onExport={downloadCatalog} onReset={resetAll} />;

  const manager = <>
    <div className="catalog-actions">
      <div className="catalog-action-group" role="group" aria-label="题目管理">
        <button type="button" className="primary-button" disabled={!hydrated || running} onClick={() => {
          const next = createChallengeTemplate(Math.max(0, ...challenges.map((c) => c.number)) + 1);
          next.id = `challenge-${crypto.randomUUID()}`;
          setEditing({ challenge: next, creating: true });
        }}>新增题目</button>
        <button type="button" className="secondary-button" disabled={!hydrated || running || !challenges.length} onClick={() => setEditing({ challenge, creating: false })}>编辑当前题目</button>
        <button type="button" className="secondary-button" disabled={!hydrated || running || getChapters(challenges).length < 2} onClick={() => setSortingChapters(true)}>章节排序</button>
        <button type="button" className="danger-button" disabled={!hydrated || running || !challenges.length} onClick={() => { setCatalogError(""); setDeleting(true); }}>删除题目</button>
      </div>
    </div>
    <div className="catalog-toast-region">
      {catalogError && !deleting ? <div className="catalog-toast catalog-toast-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{catalogError}</p><button type="button" aria-label="关闭错误提示" onClick={() => setCatalogError("")}><X size={16} /></button></div> : null}
      {catalogNotice ? <div className="catalog-toast" role="status"><CheckCircle2 size={18} aria-hidden="true" /><p>{catalogNotice}</p><button type="button" aria-label="关闭操作提示" onClick={() => setCatalogNotice("")}><X size={16} /></button></div> : null}
    </div>
    {sortingChapters ? <ChapterOrderDialog chapters={getChapters(challenges, chapterOrder)} defaults={getChapters(challenges)} onClose={() => setSortingChapters(false)} onSave={(order) => {
      localStorage.setItem("sql-practice:v1:chapter-order", JSON.stringify(order));
      setChapterOrder(order); setSortingChapters(false); setCatalogNotice("已保存章节顺序。");
    }} /> : null}
    {editing ? <ChallengeEditor chapters={getChapters(challenges, chapterOrder)} challenge={editing.challenge} creating={editing.creating} onSave={saveConfig} onClose={() => setEditing(null)} /> : null}
    {importing ? <CatalogImportDialog current={challenges} onImport={replaceCatalog} onClose={() => setImporting(false)} /> : null}
    {deleting ? <DeleteChallengesDialog challenges={challenges} error={catalogError} onDelete={removeConfig} onClose={() => setDeleting(false)} /> : null}
    {pendingChallenge ? <ManagementDialog title="放弃当前修改？" onClose={() => setPendingChallenge(null)} className="switch-confirm-dialog" compact>
      <div className="management-body"><p>切换题目后，未提交的 SQL 将丢失。</p></div>
      <footer className="management-footer"><div><button type="button" className="secondary-button" onClick={() => setPendingChallenge(null)}>继续编辑</button><button type="button" className="danger-button filled" onClick={() => { switchChallenge(pendingChallenge); setPendingChallenge(null); }}>丢弃并切换</button></div></footer>
    </ManagementDialog> : null}
  </>;

  if (!hydrated) return <div className="workspace-loading" aria-busy="true">
    <header className="workspace-loading-header"><Database size={22} aria-hidden="true" /><strong>SQL 实战练习</strong><span role="status"><LoaderCircle size={15} className="spin" aria-hidden="true" />正在恢复工作区…</span></header>
    <div className="workspace-loading-toolbar" aria-hidden="true"><i /><i /><i /></div>
    <div className="workspace-loading-grid" aria-hidden="true">
      <div className="workspace-loading-nav">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>
      <div className="workspace-loading-problem"><i /><i /><i /><div /><i /><i /></div>
      <div className="workspace-loading-code"><div /><section><i /><i /></section></div>
    </div>
  </div>;

  if (!challenges.length) return <div className="empty-catalog"><h1>SQL 实战练习</h1><p>题库为空，新增题目并配置本题的数据源 SQL。</p>{tools}{manager}</div>;

  return (
    <div className="sql-lab-shell">
      <a className="skip-link" href="#sql-editor">跳到 SQL 编辑器</a>
      <header className="topbar">
        <div className="brand-group">
          <button className="mobile-menu-button icon-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开题库"><Menu size={19} /></button>
          <div className="brand-mark" aria-hidden="true"><Database size={20} strokeWidth={1.7} /></div>
          <div className="brand-copy"><strong>SQL 实战练习</strong><span>在练习中掌握查询</span></div>
        </div>
        <div className="top-progress">
          <div className="top-progress-caption"><span>学习进度</span><span><strong>{completedCount}</strong><span className="progress-total"> / {challenges.length} 道</span></span><strong className="progress-percent">{completionPercent}%</strong></div>
          <div className="mini-progress" role="progressbar" aria-label="题目完成进度" aria-valuemin={0} aria-valuemax={challenges.length} aria-valuenow={completedCount} aria-valuetext={`已完成 ${completedCount} 道，共 ${challenges.length} 道`}><i style={{ width: `${completionPercent}%` }} /></div>
        </div>
        <div className="topbar-tools"><span className="runtime-status" title="浏览器内 SQLite · 支持 MySQL 8 常用语法子集"><span className="runtime-dot" />本地运行</span>{tools}</div>
      </header>

      {manager}
      <div className="mobile-workflow-tabs" role="tablist" aria-label="移动端工作区">
        {([ ["problem", "题目"], ["code", "代码"], ["result", "结果"] ] as const).map(([tab, label]) => (
          <button key={tab} type="button" role="tab" aria-selected={mobileTab === tab} className={mobileTab === tab ? "active" : ""} onClick={() => setMobileTab(tab)}>{label}</button>
        ))}
      </div>

      <main className="workspace-grid">
        {sidebarOpen ? <button className="sidebar-backdrop" type="button" aria-label="关闭题库" onClick={() => setSidebarOpen(false)} /> : null}
        <aside className={`problem-nav ${sidebarOpen ? "open" : ""}`} aria-label="SQL 题库">
          <div className="nav-mobile-controls"><button className="nav-close icon-button" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭题库"><X size={18} /></button></div>
          <label className="search-box">
            <Search size={15} />
            <span className="sr-only">搜索题目</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索题号、标题、知识点" />
            {search ? <button type="button" onClick={() => setSearch("")} aria-label="清空搜索"><X size={14} /></button> : null}
          </label>
          <div className="filter-tabs" role="group" aria-label="题目筛选">
            <ListFilter size={14} />
            {([ ["all", "全部"], ["todo", "未完成"], ["passed", "已通过"] ] as const).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          <div className="challenge-list">
            {getChapters(challenges, chapterOrder).map((chapter) => {
              const chapterChallenges = filteredChallenges.filter((item) => item.chapter === chapter);
              if (chapterChallenges.length === 0) return null;
              return (
                <section className="chapter-group" key={chapter}>
                  <h2>{chapter}<span>{chapterChallenges.filter((item) => progress[item.id]?.passed).length}/{challenges.filter((item) => item.chapter === chapter).length}</span></h2>
                  {chapterChallenges.map((item) => (
                    <button key={item.id} type="button" className={`challenge-row ${item.id === challenge.id ? "active" : ""}`} onClick={() => selectChallenge(item)}>
                      <ProgressMark progress={progress[item.id]} />
                      <span className="challenge-index">{String(item.number).padStart(2, "0")}</span>
                      <span className="challenge-name" title={item.title}>{item.title}</span>
                      <span className={`difficulty-dot ${item.difficulty}`}>{difficultyLabel[item.difficulty]}</span>
                    </button>
                  ))}
                </section>
              );
            })}
            {filteredChallenges.length === 0 ? <div className="nav-empty">没有匹配的题目</div> : null}
          </div>
        </aside>

        <section className={`problem-pane mobile-${mobileTab}`} aria-label="题目说明">
          <header className="problem-header">
            <div className="problem-title-row">
              <span className="problem-number">SQL {String(challenge.number).padStart(2, "0")}</span>
              <span className={`difficulty-badge ${challenge.difficulty}`}>{difficultyLabel[challenge.difficulty]}</span>
              {progress[challenge.id]?.passed ? <span className="passed-label"><CheckCircle2 size={14} /> 已通过{progress[challenge.id].optimized ? " · 已优化" : ""}</span> : null}
            </div>
            <h1>{challenge.title}</h1>
            <p>{challenge.summary}</p>
            <div className="tag-list">{challenge.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </header>
          <div className="content-tabs" role="tablist" aria-label="题目内容">
            <button id="problem-tab" type="button" role="tab" aria-controls="problem-panel" aria-selected={contentTab === "problem"} className={contentTab === "problem" ? "active" : ""} onClick={() => setContentTab("problem")}>题目</button>
            <button id="analysis-tab" type="button" role="tab" aria-controls="analysis-panel" aria-selected={contentTab === "analysis"} className={contentTab === "analysis" ? "active" : ""} onClick={() => setContentTab("analysis")}>解析</button>
          </div>
          <div id="problem-panel" key={`${challenge.id}:problem`} ref={problemScrollRef} className="pane-scroll" role="tabpanel" aria-labelledby="problem-tab" hidden={contentTab !== "problem"} onScroll={(event) => {
            if (contentTab === "problem") contentScrollPositions.current[`${challenge.id}:problem`] = event.currentTarget.scrollTop;
          }}>
            <ProblemContent challenge={challenge} />
          </div>
          <div id="analysis-panel" key={`${challenge.id}:analysis`} ref={analysisScrollRef} className="pane-scroll" role="tabpanel" aria-labelledby="analysis-tab" hidden={contentTab !== "analysis"} onScroll={(event) => {
            if (contentTab === "analysis") contentScrollPositions.current[`${challenge.id}:analysis`] = event.currentTarget.scrollTop;
          }}>
            <AnalysisContent challenge={challenge} />
          </div>
        </section>

        <section ref={codingPaneRef} className={`coding-pane mobile-${mobileTab}`} aria-label="SQL 编程区" style={{ "--editor-pane-size": `${editorPercent}%` } as React.CSSProperties}>
          <div className="editor-section">
            <div className="editor-toolbar">
              <div className="editor-language"><Code2 size={16} /><strong>SQL</strong></div>
              <div className="editor-actions">
                <button className="ghost-button" type="button" onClick={resetCurrent} disabled={running} title="恢复本题初始代码"><RotateCcw size={15} /><span>重置</span></button>
                <button className="secondary-button" type="button" onClick={() => void run("run")} disabled={running}><Play size={15} fill="currentColor" />运行</button>
                <button className="primary-button" type="button" onClick={() => void run("submit")} disabled={running}>{running ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}提交</button>
              </div>
            </div>
            <SqlEditor key={challenge.id} challenge={challenge} value={sql} onChange={setSql} onRun={(mode) => void run(mode)} editorRef={editorRef} />
            <div className="editor-footer">
              <span><kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd> 运行 · 加 <kbd>Shift</kbd> 提交</span>
            </div>
          </div>
          <div className="editor-resizer" role="slider" tabIndex={0} aria-label="SQL 编辑区高度" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={editorPercent} aria-valuetext={`编辑区占 ${editorPercent}%`}
            onPointerDown={(event) => { resizePointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); resizeEditor(event.clientY); }}
            onPointerMove={(event) => { if (resizePointer.current === event.pointerId) resizeEditor(event.clientY); }}
            onPointerUp={(event) => { if (resizePointer.current === event.pointerId) { resizePointer.current = null; saveEditorSize(resizeEditor(event.clientY)); event.currentTarget.releasePointerCapture(event.pointerId); } }}
            onPointerCancel={() => { resizePointer.current = null; }}
            onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); saveEditorSize(clampEditorPercent(editorPercent + (event.key === "ArrowUp" ? -5 : 5))); } }}>
            <span aria-hidden="true" />
          </div>
          <ResultPanel report={report} resultTab={resultTab} setResultTab={setResultTab} activeCaseId={activeCaseId} setActiveCaseId={setActiveCaseId} running={running} />
          <div className="mobile-action-bar">
            <button className="secondary-button" type="button" onClick={() => void run("run")} disabled={running}><Play size={16} />运行</button>
            <button className="primary-button" type="button" onClick={() => void run("submit")} disabled={running}><Send size={16} />提交</button>
          </div>
        </section>
      </main>
    </div>
  );
}
