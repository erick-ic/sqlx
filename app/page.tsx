import type { Metadata } from "next";
import { headers } from "next/headers";
import SqlLab from "./sql-lab/SqlLab";

const description = "12 道 MySQL 高频实战题，浏览器内运行 SQL、校验公开与隐藏用例。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const socialImage = `${protocol}://${host}/sql-practice-social.png`;

  return {
    title: "SQL 实战练习 · 本地轻量版",
    description,
    openGraph: {
      title: "SQL 实战练习 · 本地轻量版",
      description,
      type: "website",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "三栏 SQL 练习与判题工作台" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "SQL 实战练习 · 本地轻量版",
      description,
      images: [socialImage],
    },
  };
}

export default function Home() {
  return <SqlLab />;
}
