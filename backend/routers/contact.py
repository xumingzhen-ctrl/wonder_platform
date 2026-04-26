"""
contact.py — 移民咨询表单邮件路由
复用现有 GMAIL_SENDER / GMAIL_APP_PASSWORD / ADMIN_EMAIL 配置
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings

router = APIRouter(prefix="/contact", tags=["contact"])


LANG_LABELS = {
    "zh": "中文",
    "en": "English",
    "ar": "العربية",
}

LOCATION_LABELS = {
    "mainland": "中国大陆",
    "hongkong": "香港",
    "macau": "澳门",
    "taiwan": "台湾",
    "usa": "美国",
    "middle_east": "中东地区",
    "europe": "欧洲",
    "other": "其他海外",
}

STATUS_LABELS = {
    "mainland_only": "纯内地户籍（无外国身份）",
    "has_foreign_pr": "已持有外国永居身份",
    "foreign_national": "外国国籍",
    "other": "其他",
}


class ImmigrationInquiry(BaseModel):
    name: str
    contact: str          # 邮箱或微信/WhatsApp
    location: str         # 居住地 key
    status: str           # 当前身份 key
    lang: str = "zh"      # 语言偏好
    message: str = ""     # 可选备注


@router.post("/immigration")
async def send_immigration_inquiry(data: ImmigrationInquiry):
    """
    接收CIES移民咨询表单，通过Gmail SMTP发送通知邮件至管理员。
    收件地址优先使用 ADMIN_EMAIL；若为空则硬编码到 helloaniuwu@gmail.com。
    """
    if not settings.GMAIL_SENDER or not settings.GMAIL_APP_PASSWORD:
        # 配置缺失时记录但不报错（避免影响生产），仅返回成功
        print(f"[WARN] Gmail未配置，无法发送咨询邮件。数据：{data.dict()}")
        return {"success": True, "note": "email_not_configured"}

    recipient = settings.ADMIN_EMAIL or "helloaniuwu@gmail.com"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    location_label = LOCATION_LABELS.get(data.location, data.location)
    status_label = STATUS_LABELS.get(data.status, data.status)
    lang_label = LANG_LABELS.get(data.lang, data.lang)

    subject = f"[CIES咨询] {data.name} — {location_label} — {now_str}"

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            background: #f5f5f5; margin: 0; padding: 20px; }}
    .card {{ background: white; border-radius: 12px; padding: 32px; 
             max-width: 560px; margin: 0 auto; 
             box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
    h2 {{ color: #1a1a2e; margin: 0 0 24px; font-size: 20px; }}
    .badge {{ display: inline-block; background: #e8f0fe; color: #2563a8; 
              padding: 4px 12px; border-radius: 20px; font-size: 13px; 
              margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    td {{ padding: 10px 0; border-bottom: 1px solid #f0f0f0; 
          font-size: 15px; color: #333; }}
    td:first-child {{ color: #666; width: 120px; font-weight: 500; }}
    .footer {{ margin-top: 24px; font-size: 12px; color: #999; 
               text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">📋 WONDER — 香港投资移民咨询</div>
    <h2>新的 CIES 预约申请</h2>
    <table>
      <tr><td>姓名</td><td><strong>{data.name}</strong></td></tr>
      <tr><td>联系方式</td><td>{data.contact}</td></tr>
      <tr><td>居住地</td><td>{location_label}</td></tr>
      <tr><td>当前身份</td><td>{status_label}</td></tr>
      <tr><td>语言偏好</td><td>{lang_label}</td></tr>
      {"<tr><td>备注</td><td>" + data.message + "</td></tr>" if data.message else ""}
      <tr><td>提交时间</td><td>{now_str}</td></tr>
    </table>
    <div class="footer">由 Wonder Platform 自动发送 · 请尽快跟进</div>
  </div>
</body>
</html>
"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"WONDER Immigration <{settings.GMAIL_SENDER}>"
        msg["To"] = recipient
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.GMAIL_SENDER, settings.GMAIL_APP_PASSWORD)
            server.send_message(msg)

        return {"success": True}

    except Exception as e:
        print(f"[ERROR] 发送咨询邮件失败: {e}")
        raise HTTPException(status_code=500, detail=f"邮件发送失败: {str(e)}")
