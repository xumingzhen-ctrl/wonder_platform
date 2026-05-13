import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * 主题管理 — 纯 CSS 变量切换，不影响任何业务逻辑
 *
 * 主题定义仅覆盖 :root 中的 CSS 变量，所有组件继续使用 var(--xxx) 读取颜色，
 * 因此切换主题时零逻辑变更、零风险。
 */

export const THEMES = {
  default: {
    id: 'default',
    label: '🟣 经典紫',
    labelEn: '🟣 Classic',
    vars: {
      '--bg-gradient': 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
      '--glass-bg': 'rgba(255, 255, 255, 0.05)',
      '--glass-border': 'rgba(255, 255, 255, 0.1)',
      '--accent-color': '#6366f1',
      '--accent-color-rgb': '99, 102, 241',
      '--text-primary': '#f8fafc',
      '--text-secondary': '#94a3b8',
      '--success': '#22c55e',
      '--danger': '#ef4444',
      '--stat-gradient': 'linear-gradient(135deg, #818cf8, #c084fc)',
      '--sidebar-bg': 'rgba(15, 23, 42, 0.8)',
      '--header-bg': 'rgba(15, 23, 42, 0.6)',
      '--card-blur': 'blur(0.75rem)',
      '--card-radius': '1.25rem',
      '--card-shadow': '0 0.625rem 1.875rem rgba(0, 0, 0, 0.3)',
      '--sidebar-blur': 'blur(1.25rem)',
    },
  },
  morningstar: {
    id: 'morningstar',
    label: '🔵 机构蓝',
    labelEn: '🔵 Institutional',
    vars: {
      '--bg-gradient': 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
      '--glass-bg': 'rgba(31, 41, 55, 0.95)',
      '--glass-border': 'rgba(255, 255, 255, 0.08)',
      '--accent-color': '#0ea5e9',
      '--accent-color-rgb': '14, 165, 233',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#9ca3af',
      '--success': '#10b981',
      '--danger': '#f43f5e',
      '--stat-gradient': 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
      '--sidebar-bg': 'rgba(17, 24, 39, 1)',
      '--header-bg': 'rgba(17, 24, 39, 1)',
      '--card-blur': 'none',
      '--card-radius': '0.5rem',
      '--card-shadow': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
      '--sidebar-blur': 'none',
    },
  },
  privateBank: {
    id: 'privateBank',
    label: '🟢 私行绿',
    labelEn: '🟢 Private Bank',
    vars: {
      '--bg-gradient': 'linear-gradient(135deg, #0c1a14 0%, #162920 100%)',
      '--glass-bg': 'rgba(20, 38, 29, 0.8)',
      '--glass-border': 'rgba(255, 255, 255, 0.08)',
      '--accent-color': '#34d399',
      '--accent-color-rgb': '52, 211, 153',
      '--text-primary': '#f0fdf4',
      '--text-secondary': '#9ca3af',
      '--success': '#34d399',
      '--danger': '#fb7185',
      '--stat-gradient': 'linear-gradient(135deg, #34d399, #6ee7b7)',
      '--sidebar-bg': 'rgba(12, 26, 20, 0.95)',
      '--header-bg': 'rgba(12, 26, 20, 0.95)',
      '--card-blur': 'blur(4px)',
      '--card-radius': '0.75rem',
      '--card-shadow': '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
      '--sidebar-blur': 'blur(4px)',
    },
  },
  slate: {
    id: 'slate',
    label: '⚪ 极简灰',
    labelEn: '⚪ Minimal',
    vars: {
      '--bg-gradient': 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      '--glass-bg': 'transparent',
      '--glass-border': 'rgba(255, 255, 255, 0.15)',
      '--accent-color': '#94a3b8',
      '--accent-color-rgb': '148, 163, 184',
      '--text-primary': '#f8fafc',
      '--text-secondary': '#64748b',
      '--success': '#4ade80',
      '--danger': '#f87171',
      '--stat-gradient': 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
      '--sidebar-bg': 'rgba(15, 23, 42, 1)',
      '--header-bg': 'rgba(15, 23, 42, 1)',
      '--card-blur': 'none',
      '--card-radius': '0px',
      '--card-shadow': 'none',
      '--sidebar-blur': 'none',
    },
  },
};

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [themeId, setThemeId] = useState(() => {
    try { return localStorage.getItem('fis-theme') || 'default'; }
    catch { return 'default'; }
  });

  // 应用 CSS 变量到 :root
  useEffect(() => {
    const theme = THEMES[themeId] || THEMES.default;
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    try { localStorage.setItem('fis-theme', themeId); } catch {}
  }, [themeId]);

  const cycleTheme = () => {
    const keys = Object.keys(THEMES);
    const idx = keys.indexOf(themeId);
    setThemeId(keys[(idx + 1) % keys.length]);
  };

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId, cycleTheme, theme: THEMES[themeId] || THEMES.default }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
