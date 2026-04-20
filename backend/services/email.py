import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings

def send_email(to_email: str, subject: str, body: str, is_html: bool = True):
    if not settings.GMAIL_SENDER or not settings.GMAIL_APP_PASSWORD:
        print("Email configuration missing. Skipping email send.")
        return False

    msg = MIMEMultipart()
    msg["From"] = f"{settings.APP_NAME} <{settings.GMAIL_SENDER}>"
    msg["To"] = to_email
    msg["Subject"] = subject

    msg.attach(MIMEText(body, "html" if is_html else "plain"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.GMAIL_SENDER, settings.GMAIL_APP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

def send_verification_email(to_email: str, token: str, frontend_url: str = "http://localhost:5174"):
    link = f"{frontend_url}/verify-email?token={token}"
    subject = f"【{settings.APP_NAME}】請驗證您的電郵地址"
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb;">歡迎加入 {settings.APP_NAME}</h2>
        <p>您好，感謝您註冊我們的平台。請點擊下方按鈕驗證您的電郵地址，以完成帳戶激活：</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{link}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">驗證電郵</a>
        </div>
        <p>或者複製以下連結到瀏覽器：</p>
        <p style="word-break: break-all; color: #666;">{link}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">此連結 24 小時內有效。如果您沒有註冊此帳戶，請忽略此郵件。</p>
    </div>
    """
    return send_email(to_email, subject, body)

def send_reset_password_email(to_email: str, token: str, frontend_url: str = "http://localhost:5174"):
    link = f"{frontend_url}/reset-password?token={token}"
    subject = f"【{settings.APP_NAME}】重設您的密碼"
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb;">重設密碼請求</h2>
        <p>我們收到了重設您密碼的請求。請點擊下方按鈕進行重設：</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{link}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">重設密碼</a>
        </div>
        <p>或者複製以下連結到瀏覽器：</p>
        <p style="word-break: break-all; color: #666;">{link}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">如果您沒有請求重設密碼，請忽略此郵件。此連結 1 小時內有效。</p>
    </div>
    """
    return send_email(to_email, subject, body)
