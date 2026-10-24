"use client"

import { useEffect, useRef, useState } from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          action?: string
          callback?: (token: string) => void
          "error-callback"?: (error: any) => void
          "expired-callback"?: () => void
          theme?: "auto" | "light" | "dark"
          size?: "normal" | "compact" | "flexible"
        }
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onloadTurnstileCallback?: () => void
  }
}

interface TurnstileProps {
  siteKey?: string
  action?: string
  onSuccess: (token: string) => void
  onError?: (error?: any) => void
  onExpire?: () => void
  theme?: "auto" | "light" | "dark"
  className?: string
}

const DEFAULT_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFjTsVIbTsN7i4TZ"

export function Turnstile({
  siteKey = DEFAULT_SITE_KEY,
  action,
  onSuccess,
  onError,
  onExpire,
  theme = "auto",
  className = "",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  // 1. 加载 Cloudflare Turnstile Script
  useEffect(() => {
    if (typeof window === "undefined") return

    if (window.turnstile) {
      setScriptLoaded(true)
      return
    }

    const scriptId = "cf-turnstile-script"
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    if (!script) {
      script = document.createElement("script")
      script.id = scriptId
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      script.async = true
      script.defer = true
      script.onload = () => setScriptLoaded(true)
      document.head.appendChild(script)
    } else {
      script.addEventListener("load", () => setScriptLoaded(true))
    }
  }, [])

  // 2. 渲染 Turnstile 小部件
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.turnstile) return

    // 如果已经渲染过，先移除
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current)
      } catch {
        // ignore
      }
      widgetIdRef.current = null
    }

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme,
        callback: (token: string) => {
          onSuccess(token)
        },
        "error-callback": (err: any) => {
          console.warn("[Turnstile] Error:", err)
          onError?.(err)
        },
        "expired-callback": () => {
          onExpire?.()
        },
      })
      widgetIdRef.current = widgetId
    } catch (e) {
      console.warn("[Turnstile] Render error:", e)
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore
        }
        widgetIdRef.current = null
      }
    }
  }, [scriptLoaded, siteKey, action, theme, onSuccess, onError, onExpire])

  return (
    <div className={`turnstile-container flex justify-center my-3 ${className}`}>
      <div ref={containerRef} />
    </div>
  )
}
