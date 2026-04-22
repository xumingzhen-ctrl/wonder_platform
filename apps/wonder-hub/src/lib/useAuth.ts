"use client";

/**
 * wonder-hub 用户认证 Hook
 * 通过后端 API 检查当前登录状态
 * 与 fis-hub / backend 共用同一套 JWT token（存在 localStorage）
 */

import { useState, useEffect } from "react";

interface CurrentUser {
  id: number;
  email: string;
  name?: string;
  display_name?: string;
  role?: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  isLoggedIn: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isLoggedIn: false,
  });

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    if (!token) {
      setState({ user: null, loading: false, isLoggedIn: false });
      return;
    }

    // 通过 Next.js 代理访问后端（/api/* → localhost:8000/*）
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        setState({
          user: data.user || data,
          loading: false,
          isLoggedIn: true,
        });
      })
      .catch(() => {
        // token 失效或网络异常 → 视为未登录
        localStorage.removeItem("token");
        setState({ user: null, loading: false, isLoggedIn: false });
      });
  }, []);

  return state;
}
