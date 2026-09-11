import type { Metadata } from "next";
import "./globals.css";
import "./ledger-extra.css";
import "./installment.css";
import "./dashboard.css";
import "./mobile-nav.css";
import "./month-note.css";
import "./danger.css";
import "./login/login.css";
import "./auth.css";
import "./data-safety.css";
import "./analytics.css";
import "./analytics-range.css";
import "./installment-link.css";
import "./account-picker-groups.css";
import "./mortgage-relation.css";

export const metadata: Metadata = {
  title: "家衡｜家庭资产账本",
  description: "私有部署的家庭资产、负债与月度余额账本",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
