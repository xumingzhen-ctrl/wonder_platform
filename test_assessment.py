import requests
import json

url = "http://127.0.0.1:8000/api/assessment/submit"

payload = {
    "q1_family_type": "单身/独居",
    "q2_age_range": "25-35岁",
    "q3_income": "6-10万",
    "q4_fixed_expense": "1.5-3万",
    "q5_living_expense": "1-2万",
    "q6_insurance_premium": "5千以下",
    "q7_liquid_asset": "50-200万",
    "q8_property_asset": "无",
    "q9_total_debt": "无",
    "q10_life_insurance": "50万以下",
    "q11_critical_illness": "50-100万",
    "q12_medical": "仅有内地医保（无商业险）",
    "q13_goals": ["规划子女教育/留学基金", "实现财务自由/提前退休"],
    "q14_horizon": "7-15年（长期）",
    "q15_risk_reaction": "继续持有，我认为长期来看会回升",
    "q16_experience": "有基金/ETF投资经验",
    "contact_name": "Antigravity 测试员",
    "contact_phone": "18611902868",
    "contact_note": "这是一次自动化的端到端通知测试。"
}

print(f"正在测试提交到: {url}...")
try:
    response = requests.post(url, json=payload, timeout=15)
    print(f"状态码: {response.status_code}")
    print(f"响应内容: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
except Exception as e:
    print(f"错误: {e}")
    print("\n提示: 确认后端服务是否已启动? (uvicorn main:app --reload)")
