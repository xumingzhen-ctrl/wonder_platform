import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import { TopNavWrapper } from "@/components/TopNavWrapper";

const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});


export const metadata: Metadata = {
  title: "WONDER | 专业财务规划与投资",
  description: "WONDER团队官方网站 - 专业的家族财富管理、投资诊断与组合分析系统。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${playfairDisplay.variable} ${dmSans.variable} font-sans h-full antialiased light bg-background text-foreground`}
    >
      <body className="min-h-full flex flex-col">
        <TopNavWrapper />
        {children}
      </body>
    </html>
  );
}
