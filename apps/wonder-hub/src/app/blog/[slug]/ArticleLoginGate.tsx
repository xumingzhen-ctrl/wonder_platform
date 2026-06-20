"use client";

/**
 * 文章口令解锁门 (Passcode Gate)
 * - 接受口令输入（不区分大小写，口令为 "wonder"）
 * - 验证成功后在客户端写入 Cookie "wonder_passcode" 并刷新页面展示全文
 */

import { useState } from "react";

export function ArticleLoginGate({ slug }: { slug: string }) {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 增加 350ms 的轻微延迟，用于呈现微动画，提升解锁的流畅感受
    await new Promise((resolve) => setTimeout(resolve, 350));

    if (passcode.trim().toLowerCase() === "wonder") {
      // 写入 30 天有效的 Cookie
      document.cookie = `wonder_passcode=wonder; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      // 重新加载页面以拉取 Server 端的全文
      window.location.reload();
    } else {
      setError("访问口令不正确，请重新输入");
      setLoading(false);
    }
  }

  return (
    <div className="my-12 rounded-[2rem] border border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-card to-card p-8 md:p-12 shadow-xl backdrop-blur-md max-w-xl mx-auto relative overflow-hidden group">
      {/* Premium background glow */}
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
      
      <div className="text-center mb-8 relative z-10">
        <div className="inline-flex w-16 h-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 text-3xl mb-5 shadow-inner">
          🔒
        </div>
        <h3 className="text-2xl font-semibold text-card-foreground mb-3 tracking-tight">
          客户内参 · 受邀专属
        </h3>
        <p className="text-base text-foreground/60 max-w-sm mx-auto leading-relaxed font-light">
          此内容为 WONDER 客户专享。
          <br />
          请输入您的访问口令以解锁完整阅读权限。
        </p>
      </div>

      <form onSubmit={handleUnlock} className="max-w-md mx-auto space-y-4 relative z-10">
        <div className="relative">
          <input
            type="text"
            value={passcode}
            onChange={(e) => {
              setPasscode(e.target.value);
              if (error) setError("");
            }}
            placeholder="请输入您的专属访问口令"
            required
            disabled={loading}
            className="w-full h-14 px-5 rounded-2xl border border-border bg-background/80 text-foreground placeholder-foreground/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all duration-300 text-center text-lg tracking-wide shadow-inner"
          />
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/5 border border-destructive/10 px-4 py-3 rounded-xl text-center animate-shake">
            ⚠️ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !passcode}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-medium text-base hover:opacity-95 active:scale-[0.99] transition-all duration-300 disabled:opacity-40 disabled:pointer-events-none shadow-md flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              正在验证并解锁...
            </>
          ) : (
            "解锁阅读全文"
          )}
        </button>
      </form>

      <div className="text-center mt-8 space-y-2 text-xs text-foreground/40 font-light relative z-10 border-t border-border/50 pt-6">
        <p>
          从微信公众号点击阅读的朋友，直接使用公众号文章中的专属链接即可自动授权访问
        </p>
        <p>
          尚未获取口令？
          <a href="mailto:hello@wonderwisdom.online" className="text-primary hover:underline ml-1">
            联系您的财富顾问获取
          </a>
        </p>
      </div>
    </div>
  );
}
