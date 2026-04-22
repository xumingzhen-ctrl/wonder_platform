"use client";

/**
 * 管理员文章管理页面
 * - 列表展示所有文章（含搜索、分类筛选）
 * - 删除、编辑、新建功能
 * - 仅 admin 角色可访问
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/useAuth";
import Link from "next/link";

// 管理页面直连后端（绕过 Next.js rewrite 避免重定向丢失 Auth header）
// 本地: .env.local → http://localhost:8000
// 生产: .env.production → https://wonderwisdom.online/api
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "/api";

interface Article {
  slug: string;
  title: string;
  date: string;
  category: string;
  summary: string;
  tags: string[];
  author: string;
  restricted: boolean;
  filename: string;
}

interface ArticleDetail extends Article {
  content: string;
}

export default function AdminArticlesPage() {
  const { user, loading: authLoading, isLoggedIn } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("全部");
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [editData, setEditData] = useState<ArticleDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newArticle, setNewArticle] = useState({
    title: "",
    category: "投资理念",
    summary: "",
    tags: "",
    content: "",
  });

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const fetchArticles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/articles/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setArticles(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isLoggedIn) fetchArticles();
  }, [isLoggedIn, fetchArticles]);

  // 鉴权判断
  if (authLoading)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );

  if (!isLoggedIn || user?.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold mb-2">管理员权限</h1>
        <p className="text-muted-foreground">
          此页面仅限管理员访问。请用管理员账户登录。
        </p>
        <Link
          href="/blog"
          className="inline-block mt-6 px-6 py-2 rounded-xl bg-primary text-white"
        >
          返回文章列表
        </Link>
      </div>
    );
  }

  // 筛选
  const categories = ["全部", ...new Set(articles.map((a) => a.category))];
  const filtered = articles.filter((a) => {
    if (catFilter !== "全部" && a.category !== catFilter) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  // 删除
  async function handleDelete(slug: string, title: string) {
    if (!confirm(`确认删除文章「${title}」？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`${API_BASE}/articles/${slug}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("删除失败");
      fetchArticles();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  // 加载编辑
  async function loadForEdit(slug: string) {
    try {
      const res = await fetch(`${API_BASE}/articles/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("加载失败");
      const data: ArticleDetail = await res.json();
      setEditData(data);
      setEditSlug(slug);
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  // 保存编辑
  async function saveEdit() {
    if (!editSlug || !editData) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/articles/${editSlug}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editData.title,
          category: editData.category,
          summary: editData.summary,
          tags: editData.tags,
          content: editData.content,
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      setEditSlug(null);
      setEditData(null);
      fetchArticles();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // 新建
  async function handleCreate() {
    if (!newArticle.title.trim()) {
      alert("请填写标题");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/articles/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newArticle,
          tags: newArticle.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "创建失败");
      }
      setShowCreate(false);
      setNewArticle({
        title: "",
        category: "投资理念",
        summary: "",
        tags: "",
        content: "",
      });
      fetchArticles();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-card-foreground">
            📝 文章管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {articles.length} 篇文章 · 筛选后 {filtered.length} 篇
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/blog"
            className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition"
          >
            ← 前台预览
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition"
          >
            + 新建文章
          </button>
        </div>
      </div>

      {/* 搜索 + 筛选 */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="搜索标题..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input flex-1"
        />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="form-input w-40"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-xl mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">加载中...</div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-semibold">标题</th>
                <th className="px-4 py-3 text-left font-semibold w-24">分类</th>
                <th className="px-4 py-3 text-left font-semibold w-28">日期</th>
                <th className="px-4 py-3 text-right font-semibold w-32">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.slug}
                  className="border-b border-border/50 hover:bg-muted/30 transition"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-card-foreground">
                      {a.restricted && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mr-2">
                          🔒
                        </span>
                      )}
                      {a.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                      {a.filename}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.date}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => loadForEdit(a.slug)}
                      className="text-primary hover:underline mr-3 text-xs"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(a.slug, a.title)}
                      className="text-destructive hover:underline text-xs"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    没有匹配的文章
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 编辑弹窗 ── */}
      {editSlug && editData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">编辑文章</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  标题
                </label>
                <input
                  className="form-input mt-1"
                  value={editData.title}
                  onChange={(e) =>
                    setEditData({ ...editData, title: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    分类
                  </label>
                  <select
                    className="form-input mt-1"
                    value={editData.category}
                    onChange={(e) =>
                      setEditData({ ...editData, category: e.target.value })
                    }
                  >
                    <option>投资理念</option>
                    <option>保险理念</option>
                    <option>客户通讯</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    标签（逗号分隔）
                  </label>
                  <input
                    className="form-input mt-1"
                    value={editData.tags?.join(", ")}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        tags: e.target.value.split(",").map((t) => t.trim()),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  摘要
                </label>
                <input
                  className="form-input mt-1"
                  value={editData.summary}
                  onChange={(e) =>
                    setEditData({ ...editData, summary: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  正文（Markdown）
                </label>
                <textarea
                  className="form-input mt-1 min-h-[300px] font-mono text-xs leading-relaxed"
                  value={editData.content}
                  onChange={(e) =>
                    setEditData({ ...editData, content: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setEditSlug(null);
                  setEditData(null);
                }}
                className="px-4 py-2 rounded-xl border border-border text-sm"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 新建弹窗 ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">新建文章</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  标题 *
                </label>
                <input
                  className="form-input mt-1"
                  value={newArticle.title}
                  onChange={(e) =>
                    setNewArticle({ ...newArticle, title: e.target.value })
                  }
                  placeholder="文章标题"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    分类
                  </label>
                  <select
                    className="form-input mt-1"
                    value={newArticle.category}
                    onChange={(e) =>
                      setNewArticle({ ...newArticle, category: e.target.value })
                    }
                  >
                    <option>投资理念</option>
                    <option>保险理念</option>
                    <option>客户通讯</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    标签（逗号分隔）
                  </label>
                  <input
                    className="form-input mt-1"
                    value={newArticle.tags}
                    onChange={(e) =>
                      setNewArticle({ ...newArticle, tags: e.target.value })
                    }
                    placeholder="资产配置, 投资策略"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  摘要
                </label>
                <input
                  className="form-input mt-1"
                  value={newArticle.summary}
                  onChange={(e) =>
                    setNewArticle({ ...newArticle, summary: e.target.value })
                  }
                  placeholder="选填，用于列表页展示"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  正文（Markdown）
                </label>
                <textarea
                  className="form-input mt-1 min-h-[250px] font-mono text-xs leading-relaxed"
                  value={newArticle.content}
                  onChange={(e) =>
                    setNewArticle({ ...newArticle, content: e.target.value })
                  }
                  placeholder="在这里输入 Markdown 内容..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl border border-border text-sm"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "创建中..." : "创建文章"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
