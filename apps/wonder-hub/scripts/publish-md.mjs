#!/usr/bin/env node
/**
 * WONDER Markdown 发布工具
 * 使用方法：node scripts/publish-md.mjs "您的文章.md"
 *
 * 此脚本将自动完成：
 * 1. 读取 Markdown 文件（兼容 Obsidian 格式的 Frontmatter）
 * 2. 补全网站需要的字段 (title, slug, date, summary, tags, author)
 * 3. 移动/复制文件到 src/content/blog/ 目录
 * 4. 自动执行 git 提交并推送以触发云端网站重建
 */

import matter from "gray-matter";
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, readdirSync } from "fs";
import { basename, extname, join, resolve } from "path";
import { execSync } from "child_process";

// 工具函数：获取今天的日期字符串
function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

// 工具函数：生成安全 Slug
function toSlug(filename) {
  // 如果全是中文，则生成 "report-YYYY-MM-DD" 格式，避免中文 URL 风险
  const isAllChinese = /^[\u4e00-\u9fa5]+$/.test(filename.replace(/\s+/g, ""));
  if (isAllChinese) {
    return `report-${getTodayString()}-${Math.floor(Math.random() * 1000)}`;
  }

  return filename
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-\u4e00-\u9fa5]/g, "") 
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 工具函数：清理摘要中的 Markdown
function cleanSummary(text) {
  return text
    .replace(/\*\*/g, "") // 去掉加粗
    .replace(/__/g, "")
    .replace(/#/g, "")   // 去掉标题符
    .replace(/`/g, "")   // 去掉代码符
    .replace(/\n/g, " ") // 换行转空格
    .trim();
}

/** 处理单个文件的核心逻辑 */
function processSingleFile(inputPath, outputDir) {
  const fileContent = readFileSync(inputPath, "utf-8");
  const parsed = matter(fileContent);
  const data = parsed.data || {};
  let content = parsed.content || "";

  // 1. 标题
  let title = data.title;
  if (!title) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    title = h1Match ? h1Match[1].trim() : basename(inputPath, ".md");
  }

  // 2. Slug (改进：如果是中文标题且没指定 slug，生成一个基于日期的安全 ID)
  let slug = data.slug;
  if (!slug) {
    slug = toSlug(title);
  }

  // 3. 日期 (改进：强制转为 YYYY-MM-DD)
  let date = data.date || data.created || getTodayString();
  if (date instanceof Date) {
    date = date.toISOString().split("T")[0];
  } else if (typeof date === "string" && date.includes("T")) {
    date = date.split("T")[0];
  }

  // 4. 摘要 (改进：清理 Markdown)
  let summary = data.summary;
  if (!summary) {
    const coreViewMatch = content.match(/## Core View\n([\s\S]*?)(?=\n##|$)/);
    if (coreViewMatch && coreViewMatch[1].trim()) {
      summary = coreViewMatch[1].trim();
    } else {
      const lines = content.split("\n");
      for (const line of lines) {
        const clean = line.trim();
        if (clean && !clean.startsWith("#") && !clean.startsWith("-") && !clean.startsWith("|") && clean.length > 20) {
          summary = clean;
          break;
        }
      }
    }
  }
  summary = cleanSummary(summary || "请在此处填写文章摘要。").slice(0, 150);

  const newFrontmatter = {
    ...data,
    title,
    slug,
    date,
    summary,
    author: data.author || "WONDER 研究团队",
  };

  if (!newFrontmatter.tags || newFrontmatter.tags.length === 0) {
    newFrontmatter.tags = ["研究报告"];
  }

  const finalContent = matter.stringify(content, newFrontmatter);
  const outputPath = join(outputDir, `${slug}.md`);
  writeFileSync(outputPath, finalContent, "utf-8");

  return { title, outputPath };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("\n🔴 使用方法：node scripts/publish-md.mjs <文件或文件夹路径>");
    process.exit(1);
  }

  const inputPath = resolve(args[0]);
  if (!existsSync(inputPath)) {
    console.error(`\n🔴 找不到路径：${inputPath}\n`);
    process.exit(1);
  }

  const outputDir = join(process.cwd(), "src/content/blog");
  mkdirSync(outputDir, { recursive: true });

  const stats = lstatSync(inputPath);
  let filesToProcess = [];

  if (stats.isDirectory()) {
    console.log(`\n📂 正在扫描文件夹：${inputPath}`);
    filesToProcess = readdirSync(inputPath)
      .filter(f => extname(f).toLowerCase() === ".md")
      .map(f => join(inputPath, f));
  } else if (extname(inputPath).toLowerCase() === ".md") {
    filesToProcess = [inputPath];
  }

  if (filesToProcess.length === 0) {
    console.log("⚠️ 没有找到可处理的 .md 文件。");
    return;
  }

  console.log(`\n🚀 准备处理 ${filesToProcess.length} 个文件...`);

  // 先同步云端
  try {
    console.log("📥 正在同步云端代码 (git pull)...");
    execSync("git pull", { stdio: 'inherit' });
  } catch (e) {
    console.log("⚠️ git pull 失败，尝试继续...");
  }

  const processedTitles = [];
  for (const file of filesToProcess) {
    try {
      const { title, outputPath } = processSingleFile(file, outputDir);
      processedTitles.push(title);
      execSync(`git add "${outputPath}"`);
      console.log(`✅ 已处理: ${title}`);
    } catch (err) {
      console.error(`❌ 处理失败 [${basename(file)}]:`, err.message);
    }
  }

  if (processedTitles.length > 0) {
    console.log(`\n📤 正在推送至云端...`);
    const commitMsg = processedTitles.length === 1 
      ? `docs(blog): publish ${processedTitles[0]}`
      : `docs(blog): batch publish ${processedTitles.length} articles`;

    try {
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
      execSync(`git push`, { stdio: 'inherit' });
      console.log(`\n🎉 发布成功！${processedTitles.length} 篇文章已上线。`);
    } catch (e) {
      console.log("⚠️ 提交或推送失败（可能没有任何内容更新）。");
    }
  }
}

main();
