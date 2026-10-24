"""
turnstile.py — Cloudflare Turnstile 人机验证服务
Canonical siteverify verification implementation.
"""
import logging
import httpx
from config import settings

logger = logging.getLogger("turnstile")

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile_token(
    token: str | None,
    expected_action: str | None = None,
    remote_ip: str | None = None
) -> bool:
    """
    向 Cloudflare 验证 Turnstile Token
    - 如果未配置 TURNSTILE_SECRET（如本地初始调试），打印警告并放行，避免阻断开发
    - 如果配置了 TURNSTILE_SECRET，要求必须提供合法 token 且验证通过
    - 若指定了 expected_action，校验返回的 action 是否一致
    """
    secret = settings.TURNSTILE_SECRET
    if not secret:
        logger.warning("[Turnstile] TURNSTILE_SECRET 未配置，跳过人机验证（开发环境默认放行）")
        return True

    if not token or not token.strip():
        logger.warning("[Turnstile] 缺少 token，拒绝请求")
        return False

    payload = {
        "secret": secret,
        "response": token.strip(),
    }
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(TURNSTILE_VERIFY_URL, data=payload)
            data = resp.json()

        success = data.get("success", False)
        if not success:
            logger.warning(f"[Turnstile] 验证失败: error-codes={data.get('error-codes', [])}")
            return False

        if expected_action:
            action = data.get("action")
            if action and action != expected_action:
                logger.warning(f"[Turnstile] Action 不匹配: 预期={expected_action}, 实际={action}")
                return False

        return True
    except Exception as e:
        logger.error(f"[Turnstile] 验证接口通信异常: {e}")
        return False
