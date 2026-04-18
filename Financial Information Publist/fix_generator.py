import re
import json

file_path = "/Users/derek/Projects/Financial Information Publist/backend/report_generator.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace prompt rules
old_rules = r'    sections\.append\("""你是一位服务高净值家庭的财富规划顾问型.*?\]\n\n---\n"""\)'
new_rules = '''    sections.append("""你是一位顶尖的家族办公室财富规划师。你的任务是基于我提供的「客户画像」与「蒙特卡洛1万次模拟测算数据」，为客户撰写一份极具深度、专业性与共情力的《专属财富规划报告》。

【写作风格要求】
1. 你的受众是高净值且非金融模型纯专业的客户。必须使用投研报告般克制、精准、且富有解释威力的商务金融语言，禁止使用绝对化推销词汇。
2. 论述深度：拒绝“报菜名”式罗列数字！必须解释数字背后的业务逻辑与模型常识，让客户明白这套方案是如何在现实不确定性中运行的。
3. 动态配置视角：如果数据中包含【保险底座数据】，必须重点论证“双核合并体系（高波动高流动组合 + 保本增值现金价值）”是如何在平滑风险的同时，锁定长期回报安全垫的。

---
""")'''
content = re.sub(r'    sections\.append\("""你是一位服务高净值.*?(?s:.*?)\n---\n"""\)', new_rules, content)

# 2. Skip old output prep block and keys
# the old output prep block starts at: ins_key_desc = ''
old_output = r'''    # 输出格式要求
    ins_key_desc = ''
    if ins:
        ins_key_desc = \(
            '\\n  "insurance_impact": "（120-160字.*?）",'\)
    output_block = f"""## 六、输出要求.*?}}
.*?"""
    sections\.append\(output_block\)'''

new_output = '''    # 输出格式要求
    ins_key_desc = ''
    if ins:
        ins_key_desc = \\
            '\\n  "insurance_strategy": "[保险压舱石论证] 高度聚焦保险的“终值额外补充”特性。必须引用组合在加入保险后回撤的收窄数据（drawdown_improve_pct），向客户论证防御性固收类基石在危机时代的防守减震功能。",'
            
    output_block = f"""【所需输出结构的章节指令】
请严格提取传入的量化数据，以合法 JSON 格式输出包含以下特定键的对象（严禁输出任何多余的解释性文字与 Markdown 标记）：

{{
  "executive_summary": "[致语与目标定调] 从客户的核心规划目标（{goals_text}）切入。结合其年龄与期初资产，给出一份简短有力的执行摘要，点明在万次极端推演下的“目标达成率（{s['success_rate_pct']}%）”给家庭带来的现实确定性。",
  "capital_markets_outlook": "[资本市场与测算模型科普 —— 极为重要！] 深入浅出地向客户解释我们为什么能预测长达几十年的财富轨迹。步骤1：通俗解释“几何布朗运动（GBM）”与“蒙特卡洛测算模拟”（例如用气象模型测算牛熊市随机游走）。步骤2：说明模型带来的指南针意义，打破线性自欺欺人。步骤3：定义并解释 P50（预期财富中枢）和 P10（即便遭遇百年一遇危机的底线保护屏障）两个核心结论。",
  "portfolio_roles": "[底层资产角色拆解] 逐一解释客户组合中各底层资产不只是一个简单的权重比例，它们分别扮演着怎样的配置引擎（进攻、防御、缓冲）。",{ins_key_desc}
  "milestone_interpretation": "[财富里程碑全景] 结合提供的各年份切片数据，描绘随时间推移资产复利滚雪球的形态。需生动区分“顺风乐观积累（P90）”与“逆风悲观防守（P10）”两条路径的不同现实画面。",
  "spending_impact": "[现金流提款极限压力测试] 结合设定的年度提取和通胀率假设，解读提取期资产池的枯竭可能或永续滚动状态。强调这套模型是如何防范因为运气引发的“顺序回报风险（Sequence of Returns Risk）”的。",
  "risk_narrative": "[系统风险与纪律柔韧性] 向客户进行清醒的风险预期管理。不仅要提 P10 悲观回撤，更要给出明确的牛熊市心理建设和战术指导（如遭遇崩盘必须保留筹码，不要在低点收割变现资金底座）。",
  "recommendations": "[顶级顾问的策略建议] 给出2-3条实操维度的投资纪律建议（如动态再平衡、流动性储备等）。语气须像顶级顾问对客户私下当面叮嘱般具有洞察力。"
}}
"""
    sections.append(output_block)'''

content = re.sub(r'    # 输出格式要求.*?sections\.append\(output_block\)', new_output, content, flags=re.DOTALL)

# 3. Update required keys in call_llm
old_required = '''        required = ["client_opening", "strategy_narrative", "portfolio_roles",
                    "milestone_interpretation", "withdrawal_narrative",
                    "risk_narrative", "recommendations"]'''
new_required = '''        required = ["executive_summary", "capital_markets_outlook", "portfolio_roles",
                    "milestone_interpretation", "spending_impact",
                    "risk_narrative", "recommendations"]'''
content = content.replace(old_required, new_required)

# 4. Update fallback dictionary
old_fallback = r'''    fallback = \{
        "client_opening": "如果您正在考虑.*?\}'''
new_fallback = '''    fallback = {
        "executive_summary": "如果您正在考虑为家庭建立长期、可持续的财富积累体系，这份方案正是为此而设计的。我们在测算中验证了极高的目标达成率定调，确保了长远的家庭计划实施无虞。",
        "capital_markets_outlook": "我们通过几何布朗运动（GBM）和蒙特卡洛模型进行了1万次随机漫步测算，如同气象台模拟无数次冷暖气流碰撞来预演极端天气。这打破了传统财务规划单调线性的弊端，让我们不仅关注中枢表现（P50），更能为您在遭受危机时兜住底线（P10）。",
        "portfolio_roles": "组合中的各资产承担进攻（捕捉成长）、防守（抗通胀）和缓冲（提供低波流动性）三大核心职责。各要素低度相关的特质极大平滑了配置风险曲线。",
        "milestone_interpretation": "随着时间推移，在顺风局（P90乐观路径）您能收获远超预期的复利果实；即使在逆风防守（P10悲观路径），时间价值和纪律也能确保财富不发生毁灭性下降，给您安稳的底气。",
        "spending_impact": "面对年度资金动用，提款压力在市场暴跌时极易引发“顺序回报风险”。我们的压力测试已证明，目前的提取速率处于健康的资产造血区间边界内，无需担心长期流动枯竭。",
        "risk_narrative": "最大回撤并非实际锁死的账面亏损，而是在系统性危机中资产的暂时收缩。建议您做足心理建设：在熊市切忌恐慌割肉断送复利。我们已提前预设了应急资金缓冲应对这类突发。",
        "insurance_strategy": "通过配置保险底座，方案获得了一层绝不随市场波动的刚兑安全垫。它在提供终期提取来源的同时，更在危机时刻收窄了账面最大回撤（drawdown_improve），为您构筑了坚固的财务护城河。",
        "recommendations": "请保持战略耐心。每3年进行一次账户再平衡检视即可，严守长期投资纪律，拒绝市场短期杂音干扰；若遇流动性突发诉求，优选无损方式调用工具。"
    }'''
content = re.sub(r'    fallback = \{(?s:.*?)\}', new_fallback, content, count=1)


# 5. Update build_docx key accesses
content = content.replace('sections.get("client_opening", "")', 'sections.get("executive_summary", "")')
content = content.replace('sections.get("strategy_narrative", "")', 'sections.get("capital_markets_outlook", "")')
content = content.replace('sections.get("withdrawal_narrative", "")', 'sections.get("spending_impact", "")')
content = content.replace('sections.get("insurance_impact", "")', 'sections.get("insurance_strategy", "")')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated report_generator.py")
