"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { BlogPostMeta } from "@/lib/blog";
import { RESTRICTED_CATEGORY } from "@/lib/constants";
import { useAuth } from "@/lib/useAuth";
import { cn } from "@/lib/utils";

// 有权阅读受限文章的角色（与后端、fis-hub、company-admin 一致）
const PRIVILEGED_ROLES = ["admin", "premium", "advisor"];

// ─── 分类颜色 ─────────────────────────────────────────────────────────────
const CATEGORY_STYLE: Record<string, string> = {
  投资理念: "bg-blue-50 text-blue-700 border-blue-200",
  保险理念: "bg-emerald-50 text-emerald-700 border-emerald-200",
  客户通讯: "bg-amber-50 text-amber-700 border-amber-200",
};

// ─── 登录弹窗（精简内联版，触发后跳回当前页） ─────────────────────────────
function InlineLoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "登录失败");
      // 同时存 localStorage + cookie（cookie 让 SSR 可读）
      localStorage.setItem("token", data.access_token);
      document.cookie = `token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-sm bg-card border border-border rounded-3xl p-8 shadow-2xl relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-5 text-foreground/40 hover:text-foreground text-lg"
        >
          ✕
        </button>
        <h2 className="text-xl font-semibold text-card-foreground mb-1">
          登录以阅读全文
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          客户通讯为受邀客户专属内容
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="电子邮件"
            required
            className="form-input"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            required
            className="form-input"
          />
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
        <p className="text-xs text-center text-muted-foreground mt-4">
          尚未开通？
          <a href="mailto:hello@wonderwisdom.online" className="text-primary hover:underline ml-1">
            联系顾问申请
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── 客户通讯卡片（摘要对所有人可见，全文需授权）────────────────────────
function NewsletterCard({
  post,
  isLoggedIn,
  userRole,
  onLoginRequest,
}: {
  post: BlogPostMeta;
  isLoggedIn: boolean;
  userRole?: string;
  onLoginRequest: () => void;
}) {
  const hasAccess = isLoggedIn && userRole && PRIVILEGED_ROLES.includes(userRole);

  function handleClick(e: React.MouseEvent) {
    if (!hasAccess) {
      e.preventDefault();
      onLoginRequest();
    }
  }

  return (
    <article className="group relative rounded-[1.75rem] border border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-white overflow-hidden hover:shadow-lg transition-all duration-300">
      {/* 顶部色带 */}
      <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />

      <div className="p-6">
        {/* 头部标签 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
            客户通讯
          </span>
          <span className="text-xs text-muted-foreground">{post.date}</span>
          <span className={cn(
            "ml-auto text-xs font-medium px-2 py-0.5 rounded-full",
            hasAccess
              ? "bg-emerald-50 text-emerald-600"
              : isLoggedIn
                ? "bg-orange-50 text-orange-600"
                : "bg-foreground/5 text-muted-foreground"
          )}>
            {hasAccess ? "已授权" : isLoggedIn ? "🔐 需升级" : "🔒 客户专属"}
          </span>
        </div>

        {/* 标题 */}
        <h3 className="text-lg font-semibold text-card-foreground mb-2 leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {post.title}
        </h3>

        {/* 摘要（所有人可见）*/}
        <p className="text-sm text-foreground/60 leading-relaxed line-clamp-3 mb-4">
          {post.summary}
        </p>

        {/* 标签 */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-foreground/5 text-foreground/50"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 行动按钮 */}
        <Link
          href={`/blog/${post.slug}`}
          onClick={handleClick}
          className={cn(
            "inline-flex items-center gap-2 text-sm font-medium transition-all duration-200",
            hasAccess
              ? "text-amber-700 hover:text-amber-900"
              : "text-muted-foreground cursor-pointer"
          )}
        >
          {hasAccess ? (
            <>阅读全文 <span className="group-hover:translate-x-1 transition-transform">→</span></>
          ) : isLoggedIn ? (
            <>
              <span className="text-xs">权限不足</span>
              <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                联系顾问升级
              </span>
            </>
          ) : (
            <>
              <span className="text-xs">登录查看全文</span>
              <span className="text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded-full hover:bg-primary/90 transition-colors">
                立即登录
              </span>
            </>
          )}
        </Link>
      </div>
    </article>
  );
}

// ─── 普通文章卡片 ─────────────────────────────────────────────────────────
function ArticleCard({ post }: { post: BlogPostMeta }) {
  const styleClass = CATEGORY_STYLE[post.category] ?? "bg-muted text-foreground border-border";
  return (
    <article className="group relative rounded-[1.75rem] border border-border bg-card hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
      <div className={cn("h-1", {
        "bg-gradient-to-r from-blue-400 to-blue-600": post.category === "投资理念",
        "bg-gradient-to-r from-emerald-400 to-green-500": post.category === "保险理念",
      })} />
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", styleClass)}>
            {post.category}
          </span>
          <span className="text-xs text-muted-foreground">{post.date}</span>
        </div>
        <h3 className="text-lg font-semibold text-card-foreground mb-2 leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {post.title}
        </h3>
        <p className="text-sm text-foreground/60 leading-relaxed line-clamp-3 mb-4">
          {post.summary}
        </p>
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
        <Link
          href={`/blog/${post.slug}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all duration-200"
        >
          阅读全文 <span className="group-hover:translate-x-1 transition-transform">→</span>
        </Link>
      </div>
    </article>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────
export function BlogList({ posts }: { posts: BlogPostMeta[] }) {
  const { user, isLoggedIn, loading } = useAuth();
  const userRole = user?.role;
  const [activeCategory, setActiveCategory] = useState<string>("全部");
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // 所有文章（含客户通讯）的摘要对所有人可见
  // 分类标签从所有文章生成
  const categories = useMemo(() => {
    const cats = new Set(posts.map((p) => p.category));
    return ["全部", ...Array.from(cats)];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (activeCategory === "全部") return posts;
    return posts.filter((p) => p.category === activeCategory);
  }, [posts, activeCategory]);

  const handleLoginSuccess = useCallback(() => {
    setLoginModalOpen(false);
    setTimeout(() => window.location.reload(), 100);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-[1.75rem] border border-border bg-muted/30 h-52 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <InlineLoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      {/* 分类筛选条 */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200",
              activeCategory === cat
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "border-border text-foreground/60 hover:text-foreground hover:border-foreground/30 bg-card"
            )}
          >
            {cat}
            {cat !== "全部" && (
              <span className="ml-1.5 text-xs opacity-60">
                ({posts.filter((p) => p.category === cat).length})
              </span>
            )}
          </button>
        ))}

        {/* 客户通讯说明标注 */}
        {!(isLoggedIn && userRole && PRIVILEGED_ROLES.includes(userRole)) && posts.some(p => p.category === RESTRICTED_CATEGORY) && (
          <button
            onClick={() => setLoginModalOpen(true)}
            className="ml-auto flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 transition-colors font-medium"
          >
            <span>🔒</span>
            <span>{isLoggedIn ? "升级权限以查看通讯" : "客户登录后查看通讯全文"}</span>
          </button>
        )}
      </div>

      {/* 文章网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPosts.map((post) =>
          post.category === RESTRICTED_CATEGORY ? (
            <NewsletterCard
              key={post.slug}
              post={post}
              isLoggedIn={isLoggedIn}
              userRole={userRole}
              onLoginRequest={() => setLoginModalOpen(true)}
            />
          ) : (
            <ArticleCard key={post.slug} post={post} />
          )
        )}
      </div>

      {filteredPosts.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          该分类暂无文章
        </div>
      )}
    </>
  );
}
