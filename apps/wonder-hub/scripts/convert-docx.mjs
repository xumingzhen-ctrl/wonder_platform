#!/usr/bin/env node
/**
 * WONDER 研报转换工具
 * 使用方法：node scripts/convert-docx.mjs "您的研报文件.docx"
 *
 * 此脚本将自动完成：
 * 1. 读取 Word 文件内容
 * 2. 转换为 Markdown 格式
 * 3. 在 src/content/blog/ 目录下生成 .md 文件
 * 4. 自动填写发布日期（今天）
 *
 * 转换完成后，您只需要打开生成的 .md 文件，补充文章摘要，
 * 然后在 GitHub Desktop 里点击"提交"即可发布。
 */

import mammoth from "mammoth";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { basename, extname, join, resolve } from "path";

// ==========================================
// 工具函数
// ==========================================

/** 将 HTML 内容转换为适合研报的 Markdown */
function htmlToMarkdown(html) {
  return html
    // 标题处理
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n")
    // 强调处理
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    // 段落和换行
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // 列表
    .replace(/<ul[^>]*>/gi, "")
    .replace(/<\/ul>/gi, "\n")
    .replace(/<ol[^>]*>/gi, "")
    .replace(/<\/ol>/gi, "\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    // 表格（基础支持）
    .replace(/<table[^>]*>/gi, "\n")
    .replace(/<\/table>/gi, "\n")
    .replace(/<tr[^>]*>/gi, "")
    .replace(/<\/tr>/gi, " |\n")
    .replace(/<th[^>]*>(.*?)<\/th>/gi, "| **$1** ")
    .replace(/<td[^>]*>(.*?)<\/td>/gi, "| $1 ")
    // 水平线
    .replace(/<hr\s*\/?>/gi, "\n---\n\n")
    // 清理剩余 HTML 标签
    .replace(/<[^>]+>/g, "")
    // 清理 HTML 实体
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // 清理多余空行（保留最多两个连续换行）
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 将文件名转为合适的 slug（URL 路径） */
function toSlug(filename) {
  return filename
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-\u4e00-\u9fa5]/g, "") // 保留中文、字母、数字和连字符
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 获取今天的日期字符串 */
function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

/** 从内容中尝试提取文章摘要（取第一段非标题文字） */
function extractSummary(markdown) {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const clean = line.trim();
    // 跳过标题行、空行、列表行
    if (clean && !clean.startsWith("#") && !clean.startsWith("-") && !clean.startsWith("|") && clean.length > 20) {
      return clean.slice(0, 150) + (clean.length > 150 ? "..." : "");
    }
  }
  return "请在此处填写文章摘要。";
}

// ==========================================
// 主程序
// ==========================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("\n🔴 使用方法：node scripts/convert-docx.mjs <Word文件路径>");
    console.log('   示例：node scripts/convert-docx.mjs "我的研报2026.docx"\n');
    process.exit(1);
  }

  const inputPath = resolve(args[0]);

  if (!existsSync(inputPath)) {
    console.error(`\n🔴 找不到文件：${inputPath}\n`);
    process.exit(1);
  }

  if (extname(inputPath).toLowerCase() !== ".docx") {
    console.error("\n🔴 仅支持 .docx 格式（Word 2007 及以上版本）。\n");
    process.exit(1);
  }

  console.log(`\n📄 正在读取：${inputPath}`);

  try {
    // 1. 用 mammoth 将 Word 转为 HTML
    const result = await mammoth.convertToHtml({ path: inputPath });

    if (result.messages.length > 0) {
      console.log("\n⚠️  转换提示（不影响结果）：");
      result.messages.forEach((m) => console.log(`   ${m.message}`));
    }

    // 2. 将 HTML 转为 Markdown
    const markdown = htmlToMarkdown(result.value);

    // 3. 生成文件名和元数据
    const originalName = basename(inputPath, ".docx");
    const slug = toSlug(originalName) || `wonder-report-${getTodayString()}`;
    const today = getTodayString();
    const summary = extractSummary(markdown);

    // 4. 构建 frontmatter（slug 为 URL 安全的英文字段）
    const slugSuggestion = `wonder-report-${today}`;
    const frontmatter = `---
title: "${originalName}"
slug: "${slugSuggestion}"
date: "${today}"
summary: "${summary}"
tags: ["研究报告"]
author: "WONDER 研究团队"
---

`;

    const finalContent = frontmatter + markdown;

    // 5. 确保输出目录存在
    const outputDir = join(process.cwd(), "src/content/blog");
    mkdirSync(outputDir, { recursive: true });

    // 6. 写入文件
    const outputPath = join(outputDir, `${slug}.md`);
    writeFileSync(outputPath, finalContent, "utf-8");

    console.log(`\n✅ 转换成功！`);
    console.log(`📁 文件已保存至：src/content/blog/${slug}.md`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log("接下来请您：");
    console.log(`  1. 打开文件 src/content/blog/${slug}.md`);
    console.log("  2. 检查文章标题（title: 字段）是否正确");
    console.log("  3. 补充或修改文章摘要（summary: 字段）");
    console.log("  4. 根据需要添加标签（tags: 字段）");
    console.log("  5. 在 GitHub Desktop 中提交并推送");
    console.log("  6. 等待 3-5 分钟，网站自动更新！");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (err) {
    console.error("\n🔴 转换失败：", err.message);
    console.error("请确认文件未被 Word 占用（请先关闭 Word）。\n");
    process.exit(1);
  }
}

main();
