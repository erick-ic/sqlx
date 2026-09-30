import type { Metadata } from "next";
import SqlLab from "./sql-lab/SqlLab";

const description = "12 道 MySQL 高频实战题，浏览器内运行 SQL、校验公开与隐藏用例。";

export const metadata: Metadata = {
  title: "SQL 实战练习 · 本地轻量版",
  description,
};

export default function Home() {
  return <SqlLab />;
}
