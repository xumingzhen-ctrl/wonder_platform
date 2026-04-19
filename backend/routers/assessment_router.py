"""
财富问卷 Assessment Router
- POST /api/assessment/submit  → 接收问卷结果，存DB，推送通知
- GET  /api/assessment/templates → 获取5套典型组合模板（供前端展示）
"""
import uuid
import smtplib
import sqlite3
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List
import requests as http_requests

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/assessment", tags=["assessment"])

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hk_admin.db")

# ─────────────────────────────────────────────────────────────
# 1. 初始化数据库表
# ─────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wealth_assessments (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            family_type TEXT,
            age_range TEXT,
            income_range TEXT,
            savings_rate_pct REAL,
            savings_rate_label TEXT,
            emergency_months REAL,
            emergency_label TEXT,
            debt_ratio_pct REAL,
            debt_ratio_label TEXT,
            insurance_gap_label TEXT,
            net_worth_label TEXT,
            risk_profile TEXT,
            matched_template_id INTEGER,
            goals TEXT,
            risk_concerns TEXT,
            contact_name TEXT,
            contact_phone TEXT,
            contact_note TEXT,
            advisor_notified INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ─────────────────────────────────────────────────────────────
# 2. 5套典型组合模板库（全球资产 + 保险配置）
# ─────────────────────────────────────────────────────────────
TEMPLATES = {
    1: {
        "id": 1,
        "name": "保守防御型",
        "emoji": "🛡️",
        "score_range": [7, 14],
        "description": "以资产保全为首要目标，优先保障流动性与稳定性，适合风险承受能力低或短期内有资金需求的家庭。",
        "allocation": [
            {"label": "全球短债/货币市场", "pct": 35, "example": "BIL, SHY, 港元定存"},
            {"label": "全球投资级债券", "pct": 30, "example": "AGG, BNDW"},
            {"label": "高息蓝筹股（全球）", "pct": 20, "example": "DGRO, VYM"},
            {"label": "黄金/抗通胀资产", "pct": 15, "example": "GLD, IAU"},
        ],
        "insurance": [
            "⚡ 最优先：定期寿险（填补保额缺口，纯保障、保费最低）",
            "住院医疗险（建议升级至私家医院计划）",
            "人身意外险",
        ],
        "fis_template": "Accumulation Portfolio",
    },
    2: {
        "id": 2,
        "name": "稳健平衡型",
        "emoji": "⚖️",
        "score_range": [15, 20],
        "description": "在保障资产安全的基础上追求稳定增值，债股均衡配置，适合有一定储蓄积累、中期规划明确的家庭。",
        "allocation": [
            {"label": "全球综合债券", "pct": 35, "example": "BNDW, AGG"},
            {"label": "全球股票（发达市场）", "pct": 30, "example": "VT, ACWI"},
            {"label": "全球 REIT", "pct": 20, "example": "VNQI, VNQ"},
            {"label": "现金/货币基金", "pct": 15, "example": "港元定存"},
        ],
        "insurance": [
            "终身寿险（兼具保障与长期现金价值积累）",
            "重大疾病险（标准档）",
            "住院医疗险",
        ],
        "fis_template": "Income Strategy Sample",
    },
    3: {
        "id": 3,
        "name": "均衡成长型",
        "emoji": "🌱",
        "score_range": [21, 25],
        "description": "以长期资产增值为核心，接受中等市场波动，适合财务状况稳健、有明确长期目标的成长期家庭。",
        "allocation": [
            {"label": "全球股票（分散）", "pct": 50, "example": "VT, VXUS"},
            {"label": "全球债券", "pct": 20, "example": "BNDW"},
            {"label": "大宗商品/另类", "pct": 15, "example": "PDBC, GLD"},
            {"label": "全球 REIT", "pct": 15, "example": "VNQI"},
        ],
        "insurance": [
            "储蓄分红险（香港/新加坡合规，保额+现金价值双增长）",
            "重大疾病险（加强档）",
            "长期护理保险（如有赡养压力）",
        ],
        "fis_template": "Income Strategy Sample",
    },
    4: {
        "id": 4,
        "name": "进取成长型",
        "emoji": "🚀",
        "score_range": [26, 29],
        "description": "愿意承担较高波动以换取长期超额回报，投资经验丰富，家庭财务韧性强，有充裕的长期投资时间窗口。",
        "allocation": [
            {"label": "全球股票（主动/被动混合）", "pct": 55, "example": "VT + 主题ETF"},
            {"label": "新兴市场股票", "pct": 20, "example": "VWO, EEM"},
            {"label": "另类资产/私募相关", "pct": 15, "example": "PCEF"},
            {"label": "全球短债", "pct": 10, "example": "BSV"},
        ],
        "insurance": [
            "定期寿险（高保额纯保障，节省现金流投入市场）",
            "重大疾病险（基础档）",
        ],
        "fis_template": "Accumulation Portfolio",
    },
    5: {
        "id": 5,
        "name": "积极冒险型",
        "emoji": "⚡",
        "score_range": [30, 35],
        "description": "净资产充裕、投资经验丰富，追求高风险高回报策略，具备承担较大波动的心理与财务能力。",
        "allocation": [
            {"label": "集中持股/行业主题", "pct": 45, "example": "QQQ, SOXX"},
            {"label": "新兴/前沿市场", "pct": 25, "example": "VWO, FM"},
            {"label": "另类/对冲策略", "pct": 20, "example": ""},
            {"label": "数字资产（可选）", "pct": 10, "example": ""},
        ],
        "insurance": [
            "高额定期寿险（纯保障，保费最低）",
            "顶级医疗险（无限额国际计划）",
        ],
        "fis_template": "Accumulation Portfolio",
    },
}

# ─────────────────────────────────────────────────────────────
# 3. Pydantic 数据模型
# ─────────────────────────────────────────────────────────────
class AssessmentAnswers(BaseModel):
    # 阶段一：基础画像
    q1_family_type: str       # 家庭结构
    q2_age_range: str         # 年龄区间

    # 阶段二：财务数据（区间标签）
    q3_income: str            # 月收入区间
    q4_fixed_expense: str     # 月固定支出区间
    q5_living_expense: str    # 月生活消费区间
    q6_insurance_premium: str # 月保费区间
    q7_liquid_asset: str      # 流动资产区间
    q8_property_asset: str    # 物业资产区间
    q9_total_debt: str        # 总负债区间
    q10_life_insurance: str   # 寿险保额区间
    q11_critical_illness: str # 重疾险保额区间
    q12_medical: str          # 医疗险状态

    # 阶段三：行为偏好
    q13_goals: List[str]      # 财务目标（多选）
    q14_horizon: str          # 投资期限
    q15_risk_reaction: str    # 风险意愿
    q16_experience: str       # 投资经验

    # 留资信息
    contact_name: str
    contact_phone: str
    contact_note: Optional[str] = ""

# ─────────────────────────────────────────────────────────────
# 4. 财务健康评分引擎
# ─────────────────────────────────────────────────────────────

# 区间中位值映射表（港元，万元单位）
INCOME_MAP = {"3万以下": 2, "3-6万": 4.5, "6-10万": 8, "10-20万": 15, "20-50万": 35, "50万以上": 70}
FIXED_EXP_MAP = {"5千以下": 0.3, "5千-1.5万": 1, "1.5-3万": 2.25, "3-6万": 4.5, "6万以上": 8}
LIVING_EXP_MAP = {"5千以下": 0.3, "5千-1万": 0.75, "1-2万": 1.5, "2-4万": 3, "4万以上": 6}
PREMIUM_MAP = {"无/几乎没有": 0, "5千以下": 0.3, "5千-1.5万": 1, "1.5-3万": 2.25, "3万以上": 4}
LIQUID_MAP = {"10万以下": 5, "10-50万": 30, "50-200万": 125, "200-500万": 350, "500万以上": 700}
PROPERTY_MAP = {"无": 0, "200万以下": 100, "200-500万": 350, "500-1000万": 750, "1000万以上": 1500}
DEBT_MAP = {"无": 0, "50万以下": 25, "50-200万": 125, "200-500万": 350, "500万以上": 700}
LIFE_INS_MAP = {"无": 0, "50万以下": 25, "50-200万": 125, "200-500万": 350, "500万以上": 700, "不清楚": -1}

def label(val, good_range, warn_range):
    if val >= good_range:
        return "充裕 ✅"
    elif val >= warn_range:
        return "警示 ⚠️"
    return "危险 🔴"

def compute_health(ans: AssessmentAnswers) -> dict:
    monthly_income = INCOME_MAP.get(ans.q3_income, 8)
    fixed_exp = FIXED_EXP_MAP.get(ans.q4_fixed_expense, 2.25)
    living_exp = LIVING_EXP_MAP.get(ans.q5_living_expense, 1.5)
    premium = PREMIUM_MAP.get(ans.q6_insurance_premium, 0)
    total_monthly_exp = fixed_exp + living_exp + premium
    net_savings = monthly_income - total_monthly_exp
    savings_rate = (net_savings / monthly_income * 100) if monthly_income > 0 else 0

    liquid = LIQUID_MAP.get(ans.q7_liquid_asset, 30)
    emergency_months = (liquid / total_monthly_exp) if total_monthly_exp > 0 else 0

    debt = DEBT_MAP.get(ans.q9_total_debt, 0)
    debt_ratio = (fixed_exp / monthly_income * 100) if monthly_income > 0 else 0

    annual_income = monthly_income * 12
    life_ins = LIFE_INS_MAP.get(ans.q10_life_insurance, 0)
    if life_ins == -1:  # 不清楚
        insurance_gap_label = "无法判断（需顾问核查）⚠️"
    else:
        recommended_life = annual_income * 10
        gap = recommended_life - life_ins
        if gap <= 0:
            insurance_gap_label = "保障充足 ✅"
        elif gap < annual_income * 3:
            insurance_gap_label = f"缺口约 {gap:.0f} 万 ⚠️"
        else:
            insurance_gap_label = f"严重缺口约 {gap:.0f} 万 🔴"

    property_val = PROPERTY_MAP.get(ans.q8_property_asset, 0)
    net_worth = liquid + property_val - debt
    net_worth_ratio = (net_worth / annual_income) if annual_income > 0 else 0

    return {
        "monthly_income": monthly_income,
        "net_savings": net_savings,
        "savings_rate": round(savings_rate, 1),
        "savings_rate_label": label(savings_rate, 20, 10),
        "emergency_months": round(emergency_months, 1),
        "emergency_label": label(emergency_months, 6, 3),
        "debt_ratio": round(debt_ratio, 1),
        "debt_ratio_label": label(100 - debt_ratio, 70, 60),  # 反向：比例越低越好
        "insurance_gap_label": insurance_gap_label,
        "net_worth": round(net_worth, 0),
        "net_worth_label": label(net_worth_ratio, 5, 1),
    }

def compute_risk_score(ans: AssessmentAnswers) -> int:
    horizon_map = {"3年以内（短期）": 1, "3-7年（中期）": 2, "7-15年（长期）": 3, "15年以上（超长期）": 4}
    reaction_map = {
        "立刻赎回，损失已超出我的心理承受范围": 1,
        "赎回一半，将余下资金转入更保守的产品": 2,
        "继续持有，我认为长期来看会回升": 3,
        "加仓，这正是以低价买入的机会": 4,
    }
    exp_map = {
        "仅有银行存款/货币基金": 1,
        "曾购买过储蓄险/保本型产品": 2,
        "有基金/ETF投资经验": 3,
        "有个股或债券投资经验": 4,
        "有私募/另类资产/海外投资经验": 5,
    }
    h = horizon_map.get(ans.q14_horizon, 2)
    r = reaction_map.get(ans.q15_risk_reaction, 2)
    e = exp_map.get(ans.q16_experience, 2)
    return h * 3 + r * 4 + e * 2  # max=33, min=9

def match_template(score: int, health: dict) -> int:
    # 储蓄率不足时降档
    if health["savings_rate"] < 10 or health["emergency_months"] < 3:
        score = min(score, 16)
    if score <= 14: return 1
    elif score <= 20: return 2
    elif score <= 25: return 3
    elif score <= 29: return 4
    return 5

# ─────────────────────────────────────────────────────────────
# 5. 通知推送
# ─────────────────────────────────────────────────────────────
def send_telegram(data: dict):
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_ADMIN_CHAT_ID
    if not token or not chat_id or token.startswith("your_"):
        logger.warning("Telegram 未配置，跳过推送")
        return
    template = TEMPLATES[data["template_id"]]
    ans = data.get("answers", {})
    
    # 构造问卷明细文本
    ans_text = (
        f"🏠 家庭/年龄：{ans.get('q1_family_type', '-')} | {ans.get('q2_age_range', '-')}\n"
        f"💰 财务状况：收入 {ans.get('q3_income', '-')} | 支出 {ans.get('q4_fixed_expense', '-')} + {ans.get('q5_living_expense', '-')}\n"
        f"🏦 资产负债：流动 {ans.get('q7_liquid_asset', '-')} | 物业 {ans.get('q8_property_asset', '-')} | 负债 {ans.get('q9_total_debt', '-')}\n"
        f"🛡️ 现有保障：寿险 {ans.get('q10_life_insurance', '-')} | 重疾 {ans.get('q11_critical_illness', '-')} | 医疗 {ans.get('q12_medical', '-')}\n"
        f"🎯 目标与经验：{ans.get('q14_horizon', '-')} | {ans.get('q16_experience', '-')}\n"
    )

    text = (
        f"🔔 *Wonder | 新客户财务诊断*\n\n"
        f"👤 姓名：{data['name']}\n"
        f"📱 联系方式：{data['phone']}\n"
        f"⏰ 时间：{data['created_at']}\n\n"
        f"📝 *原始问卷明细*\n"
        f"{ans_text}\n"
        f"📊 *诊断画像*\n"
        f"• 风险类型：{template['emoji']} {template['name']}\n"
        f"• 储蓄率：{data['savings_rate']}% — {data['savings_rate_label']}\n"
        f"• 紧急备用金：{data['emergency_months']}个月 — {data['emergency_label']}\n"
        f"• 负债收入比：{data['debt_ratio']}% — {data['debt_ratio_label']}\n"
        f"• 寿险保障：{data['insurance_gap_label']}\n\n"
        f"✨ *理财目标*：{','.join(ans.get('q13_goals', []))}\n"
        f"📝 备注：{data['note'] or '无'}\n\n"
        f"⚡ 请尽快在 FIS 系统跟进此客户"
    )
    try:
        resp = http_requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
        if resp.status_code == 200:
            logger.info("Telegram 推送成功")
        else:
            logger.error(f"Telegram 推送返回错误码 {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.error(f"Telegram 推送失败: {e}")

def send_email(data: dict):
    sender = settings.GMAIL_SENDER
    password = settings.GMAIL_APP_PASSWORD
    admin_email = settings.ADMIN_EMAIL
    if not sender or not password or sender.startswith("your_"):
        logger.warning("Gmail 未配置，跳过邮件推送")
        return
    template = TEMPLATES[data["template_id"]]
    ans = data.get("answers", {})
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Wonder] 新客户评估 — {data['name']} — {template['name']}"
    msg["From"] = sender
    msg["To"] = admin_email
    
    ans_html = "".join([f"<li><b>{k}:</b> {v}</li>" for k, v in ans.items() if not k.startswith("contact")])

    html = f"""
    <html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;line-height:1.6;">
    <h2 style="color:#1a56db;border-bottom:2px solid #1a56db;padding-bottom:10px;">Wonder Platform | 新客户财务诊断报告</h2>
    
    <h3 style="color:#333;">👤 客户基础信息</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr style="background:#f9f9f9;"><td style="padding:10px;border:1px solid #ddd;width:120px;"><b>姓名</b></td><td style="padding:10px;border:1px solid #ddd;">{data['name']}</td></tr>
      <tr><td style="padding:10px;border:1px solid #ddd;"><b>联系方式</b></td><td style="padding:10px;border:1px solid #ddd;">{data['phone']}</td></tr>
      <tr style="background:#f9f9f9;"><td style="padding:10px;border:1px solid #ddd;"><b>提交时间</b></td><td style="padding:10px;border:1px solid #ddd;">{data['created_at']}</td></tr>
      <tr><td style="padding:10px;border:1px solid #ddd;"><b>风险类型</b></td><td style="padding:10px;border:1px solid #ddd;">{template['emoji']} {template['name']}</td></tr>
    </table>

    <h3 style="color:#333;">📊 诊断核心指标</h3>
    <div style="display:grid;grid-template-cols:1fr 1fr;gap:15px;margin-bottom:20px;">
        <div style="background:#f0f7ff;padding:15px;border-radius:10px;border-left:5px solid #1a56db;">
            <b>储蓄率：</b>{data['savings_rate']}% — {data['savings_rate_label']}<br/>
            <b>紧急备用金：</b>{data['emergency_months']}个月 — {data['emergency_label']}
        </div>
        <div style="background:#fff7ed;padding:15px;border-radius:10px;border-left:5px solid #f97316;">
            <b>负债收入比：</b>{data['debt_ratio']}% — {data['debt_ratio_label']}<br/>
            <b>寿险缺口：</b>{data['insurance_gap_label']}
        </div>
    </div>

    <h3 style="color:#333;">📝 原始问卷回答汇总</h3>
    <div style="background:#f4f4f5;padding:20px;border-radius:10px;font-size:14px;">
        <ul style="margin:0;padding-left:20px;">
            {ans_html}
        </ul>
    </div>

    <p style="margin-top:20px;"><b>客户备注：</b>{data['note'] or '无'}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:30px 0;"/>
    <p style="color:#888;font-size:12px;text-align:center;">此邮件由 Wonder Platform 顾问端自动生成 · 请及时跟进</p>
    </body></html>
    """
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(sender, password)
            s.sendmail(sender, admin_email, msg.as_string())
        logger.info("邮件推送成功")
    except Exception as e:
        logger.error(f"邮件推送失败: {e}")

# ─────────────────────────────────────────────────────────────
# 6. API 路由
# ─────────────────────────────────────────────────────────────
@router.get("/templates")
def get_templates():
    return {"templates": list(TEMPLATES.values())}

@router.post("/submit")
def submit_assessment(ans: AssessmentAnswers):
    health = compute_health(ans)
    risk_score = compute_risk_score(ans)
    template_id = match_template(risk_score, health)
    template = TEMPLATES[template_id]
    record_id = str(uuid.uuid4())
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 存入数据库（脱敏：仅存区间标签，不存精确数字）
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("""
            INSERT INTO wealth_assessments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            record_id, created_at,
            ans.q1_family_type, ans.q2_age_range, ans.q3_income,
            health["savings_rate"], health["savings_rate_label"],
            health["emergency_months"], health["emergency_label"],
            health["debt_ratio"], health["debt_ratio_label"],
            health["insurance_gap_label"], health["net_worth_label"],
            template["name"], template_id,
            ",".join(ans.q13_goals), ans.q15_risk_reaction,
            ans.contact_name, ans.contact_phone, ans.contact_note,
            0,
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"数据库写入失败: {e}")

    # 推送通知
    notify_data = {
        "name": ans.contact_name,
        "phone": ans.contact_phone,
        "note": ans.contact_note,
        "created_at": created_at,
        "template_id": template_id,
        "savings_rate": health["savings_rate"],
        "savings_rate_label": health["savings_rate_label"],
        "emergency_months": health["emergency_months"],
        "emergency_label": health["emergency_label"],
        "debt_ratio": health["debt_ratio"],
        "debt_ratio_label": health["debt_ratio_label"],
        "insurance_gap_label": health["insurance_gap_label"],
        "answers": ans.dict()
    }
    send_telegram(notify_data)
    send_email(notify_data)

    # 构建 FIS 跳转链接
    fis_url = (
        f"https://fis.wonderwisdom.online"
        f"?from=assessment&template={template_id}&profile={template['name']}"
        f"&savings_rate={health['savings_rate']}&emergency={health['emergency_months']}"
    )

    return {
        "record_id": record_id,
        "template": template,
        "health": health,
        "risk_score": risk_score,
        "fis_url": fis_url,
    }
