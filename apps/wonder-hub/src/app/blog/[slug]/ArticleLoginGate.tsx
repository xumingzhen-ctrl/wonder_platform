"use client";

/**
 * 文章内嵌登录/权限门
 * - 未登录 → 显示登录表单
 * - 已登录但 free 角色 → 显示权限不足提示
 * - 登录成功后存 JWT 到 cookie 并刷新
 */

import { useState, useEffect } from "react";

// 有权阅读受限文章的角色（与 fis-hub / company-admin 一致）
const PRIVILEGED_ROLES = ["admin", "premium", "advisor"];

export function ArticleLoginGate({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // 检查当前登录状态和角色
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setChecking(false);
      return;
    }
    // 从 JWT payload 解码 role
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        setUserRole(payload.role || "free");
      }
    } catch {
      // token 无效
    }
    setChecking(false);
  }, []);

  async function handleLogin(e: React.FormEvent) {
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

      const token = data.access_token;
      const role = data.role || "free";

      // 存 localStorage + cookie
      localStorage.setItem("token", token);
      document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;

      // 检查角色
      if (PRIVILEGED_ROLES.includes(role)) {
        // 有权 → 刷新显示全文
        window.location.reload();
      } else {
        // free 角色 → 显示权限不足
        setUserRole(role);
        setError("");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  if (checking) return null;

  // 已登录但权限不足
  if (userRole && !PRIVILEGED_ROLES.includes(userRole)) {
    return (
      <div className="my-8 rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white p-8 shadow-sm text-center">
        <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl mb-4">
          🔐
        </div>
        <h3 className="text-xl font-semibold text-card-foreground mb-2">
          权限不足
        </h3>
        <p className="text-sm text-foreground/60 max-w-sm mx-auto leading-relaxed mb-4">
          您已登录，但当前账户（{userRole}）无权查看客户通讯内容。
          <br />
          此内容仅对 WONDER 签约客户开放。
        </p>
        <p className="text-xs text-muted-foreground">
          如需升级权限，请
          <a href="mailto:hello@wonderwisdom.online" className="text-primary hover:underline ml-1">
            联系顾问
          </a>
        </p>
      </div>
    );
  }

  // 未登录 → 显示登录表单
  return (
    <div className="my-8 rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white p-8 shadow-sm">
      <div className="text-center mb-6">
        <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl mb-4">
          🔒
        </div>
        <h3 className="text-xl font-semibold text-card-foreground mb-2">
          客户通讯 · 仅限受邀客户
        </h3>
        <p className="text-sm text-foreground/60 max-w-sm mx-auto leading-relaxed">
          此内容为 WONDER 受邀客户专属，包含定期市场分析与组合调整建议。
          <br />
          如您已是我们的客户，请登录以阅读全文。
        </p>
      </div>

      <form onSubmit={handleLogin} className="max-w-sm mx-auto space-y-3">
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
          {loading ? "登录中..." : "登录查看全文"}
        </button>
      </form>

      <div className="text-center mt-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          从微信公众号点击的用户，请使用公众号文章中的专属链接直接访问
        </p>
        <p className="text-xs text-muted-foreground">
          尚未开通？
          <a href="mailto:hello@wonderwisdom.online" className="text-primary hover:underline ml-1">
            联系顾问申请访问权限
          </a>
        </p>
      </div>
    </div>
  );
}
