import re

file_path = "/Users/derek/Projects/Financial Information Publist/backend/report_generator.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Fallback Insurance Strategy
content = content.replace(
    '"insurance_strategy": "通过配置保险底座，方案获得了一层绝不随市场波动的刚兑安全垫。',
    '"insurance_strategy": "通过配置具有“平滑机制”的保险底座，方案获得了一层受市场波动影响更小的安全垫。'
)

# 2. Update Fallback Recommendations
content = content.replace(
    '每3年进行一次账户再平衡检视即可',
    '每季度或每半年度进行一次账户再平衡检视即可'
)

# 3. Update Prompt Instructions (Optional but good)
# Update recommendations instruction to guide LLM
content = content.replace(
    '"recommendations": "（90-130字：1-3条针对当前具体参数的个人化建议，语气像顾问面对面说话，要有具体的行动方向或注意事项，不要套话）"',
    '"recommendations": "（90-130字：1-3条个人化建议。注意：再平衡频率应建议为季度或半年度。语气像顾问面对面说话，要有具体的行动方向，不要套话）"'
)

# 4. Update Insurance Impact instruction to avoid "absolute" language
content = content.replace(
    '②危机守护——在最差市场环境下，保险托底了多少；',
    '②危机守护——由于保险公司具备平滑机制，在最差市场环境下受波动更小，托底了多少；'
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated language descriptions in report_generator.py")
