import type { DataSourceInspection } from "./types";

export default function DataSourcePreview({ inspection }: { inspection: DataSourceInspection }) {
  return <div className="source-preview">
    {inspection.tables.map((table) => {
      const sample = inspection.samples.find((sample) => sample.tableName === table.name);
      return <section className="schema-card" key={table.name}>
        <div className="schema-title"><code>{table.name}</code>{table.title !== table.name ? <span>{table.title}</span> : null}</div>
        <div className="table-scroll"><table className="data-table schema-table"><thead><tr><th>字段</th><th>类型</th><th>说明</th></tr></thead>
          <tbody>{table.columns.map((column) => <tr key={column.name}><td><code>{column.name}</code></td><td><code>{column.type}</code></td><td>{column.note || "—"}</td></tr>)}</tbody>
        </table></div>
        {sample ? <>
          <p className="source-sample-note">样例数据{sample.truncated ? "（仅显示前 10 行）" : `（${sample.result.rows.length} 行）`}</p>
          <div className="table-scroll"><table className="data-table"><thead><tr>{sample.result.columns.map((column, i) => <th key={i}>{column}</th>)}</tr></thead>
            <tbody>{sample.result.rows.length ? sample.result.rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j}>{value === null ? <span className="null-value">NULL</span> : value === "" ? <span className="empty-value">空字符串</span> : String(value)}</td>)}</tr>) : <tr><td colSpan={sample.result.columns.length}>此表没有数据</td></tr>}</tbody>
          </table></div>
        </> : null}
      </section>;
    })}
  </div>;
}
