def calculate_salaries_tax(net_chargeable_income: float, total_net_income: float) -> dict:
    if total_net_income <= 0:
        return {"tax": 0.0, "method": "无须征税"}
    standard_tax = total_net_income * 0.15
    if net_chargeable_income <= 0:
        return {"tax": 0.0, "method": "免税额覆盖"}
    progressive_tax = 0.0
    rem = net_chargeable_income
    tiers = [(50000, 0.02), (50000, 0.06), (50000, 0.10), (50000, 0.14)]
    for limit, rate in tiers:
        if rem > limit:
            progressive_tax += limit * rate
            rem -= limit
        else:
            progressive_tax += rem * rate
            rem = 0
            break
    if rem > 0:
        progressive_tax += rem * 0.17
    if progressive_tax < standard_tax:
        return {"tax": progressive_tax, "method": "累进税率"}
    else:
        return {"tax": standard_tax, "method": "15% 标准税率"}

def evaluate_personal_assessment(profit: float, profile_dict: dict) -> dict:
    """
    profile_dict expected:
      marital_status, spouse_net_income, children_count, dependent_parents_60, ...
    """
    res = {}
    
    mpf = float(profile_dict.get('mpf_self_contribution', 0))
    other_deduct = float(profile_dict.get('other_deductions', 0))
    deductions = mpf + other_deduct
    
    my_net_income = max(profit - deductions, 0.0)
    
    child = int(profile_dict.get('children_count', 0))
    p60 = int(profile_dict.get('dependent_parents_60', 0))
    p55 = int(profile_dict.get('dependent_parents_55', 0))
    
    # 2024/25 allowances
    basic_allw = 132000
    married_allw = 264000
    child_allw = child * 130000
    parent_allw = p60 * 50000 + p55 * 25000
    
    marital_status = profile_dict.get('marital_status', 'single')
    
    if marital_status == 'single':
        total_allowance = basic_allw + child_allw + parent_allw
        nci = max(my_net_income - total_allowance, 0.0)
        tax_res = calculate_salaries_tax(nci, my_net_income)
        res['strategy'] = 'single_personal_assessment'
        res['tax'] = tax_res['tax']
        res['breakdown'] = {
            'my_net_income': my_net_income,
            'total_allowance': total_allowance,
            'nci': nci,
            'method': tax_res['method']
        }
        return res
        
    else:
        spouse_inc = float(profile_dict.get('spouse_net_income', 0))
        # 方案1：分开评税 (Separate Assessment)
        total_allowance_sep = basic_allw + child_allw + parent_allw
        my_nci_sep = max(my_net_income - total_allowance_sep, 0.0)
        my_tax_sep = calculate_salaries_tax(my_nci_sep, my_net_income)['tax']
        
        spouse_nci_sep = max(spouse_inc - basic_allw, 0.0) # Assume spouse takes no child allowance here for conservative estimate
        spouse_tax_sep = calculate_salaries_tax(spouse_nci_sep, spouse_inc)['tax']
        sep_total_tax = my_tax_sep + spouse_tax_sep
        
        # 方案2：合并评税 (Joint Assessment)
        joint_net_income = my_net_income + spouse_inc
        joint_allowance = married_allw + child_allw + parent_allw
        joint_nci = max(joint_net_income - joint_allowance, 0.0)
        joint_tax_res = calculate_salaries_tax(joint_nci, joint_net_income)
        joint_total_tax = joint_tax_res['tax']
        
        if sep_total_tax <= joint_total_tax:
            res['strategy'] = 'separate_assessment'
            res['tax'] = my_tax_sep
            res['family_total_tax'] = sep_total_tax
            res['breakdown'] = {
                'my_tax': my_tax_sep,
                'spouse_tax': spouse_tax_sep,
                'method': '分开评税更有利'
            }
        else:
            res['strategy'] = 'joint_assessment'
            res['tax'] = joint_total_tax - spouse_tax_sep # approximate share or just return family tax
            res['family_total_tax'] = joint_total_tax
            res['breakdown'] = {
                'joint_nci': joint_nci,
                'joint_tax': joint_total_tax,
                'method': '合并评税更有利 (' + joint_tax_res['method'] + ')'
            }
        return res

import json
print(evaluate_personal_assessment(800000, {"marital_status": "married", "spouse_net_income": "200000", "children_count": "1"}))
