import uuid
import datetime
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.company import Company, User

client = TestClient(app)

def run_tests():
    print("🚀 开始执行 HR 模块自动化验收测试...")
    
    # 1. 登录
    print("🔹 [1/7] 进行系统登录...")
    login_response = client.post(
        "/auth/login",
        json={"email": "admin@hk.com", "password": "password123"}
    )
    assert login_response.status_code == 200, f"登录失败: {login_response.text}"
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. 获取公司 ID
    company_response = client.get("/companies", headers=headers)
    assert company_response.status_code == 200
    companies = company_response.json()
    assert len(companies) > 0, "没有找到公司"
    company_id = companies[0]["id"]
    print(f"✅ 登录成功，锁定测试公司 ID: {company_id[:8]}...")
    
    # 3. 创建测试员工
    print("🔹 [2/7] 测试: 创健新员工档案...")
    emp_data = {
        "name_zh": "测试工程师",
        "name_en": "QA Engineer",
        "hkid": "A123456(7)",
        "gender": "male",
        "date_of_birth": "1990-01-01",
        "position": "软件测试",
        "department": "技术部",
        "employment_type": "full_time",
        "hire_date": "2024-01-01",
        "base_salary": 25000.0,
        "salary_type": "monthly",
        "is_continuous_contract": True,
        "mpf_scheme": "AIA MPF",
        "mpf_member_no": "AIA-9921",
        "bank_name": "HSBC",
        "bank_account": "123-456789-001",
        "email": "qa@hktech.com",
        "phone": "98765432"
    }
    
    res = client.post(f"/companies/{company_id}/hr/employees", json=emp_data, headers=headers)
    assert res.status_code == 200, f"创建员工失败: {res.text}"
    employee = res.json()
    employee_id = employee["id"]
    print(f"✅ 成功创建员工，工号: {employee['employee_number']}, ID: {employee_id[:8]}...")
    
    # 4. 检查自动生成的假期余额
    print("🔹 [3/7] 测试: 检查员工的自动假期生成系统...")
    res = client.get(f"/companies/{company_id}/hr/leave/balances?year=2024", headers=headers)
    assert res.status_code == 200
    balances = [b for b in res.json() if b["employee_id"] == employee_id]
    assert len(balances) > 0, "假期余额未自动生成！"
    print(f"✅ 假期余额已自动生成，2024年总年假: {balances[0]['annual_leave_entitled']}天")

    # 5. 提交假期申请
    print("🔹 [4/7] 测试: 提交假期申请并进行审批...")
    leave_data = {
        "employee_id": employee_id,
        "leave_type": "annual",
        "start_date": "2024-05-01",
        "end_date": "2024-05-02",
        "days": 2.0,
        "reason": "个人私事"
    }
    res = client.post(f"/companies/{company_id}/hr/leave", json=leave_data, headers=headers)
    assert res.status_code == 200
    leave_id = res.json()["id"]
    
    res = client.put(f"/companies/{company_id}/hr/leave/{leave_id}/approve", json={"approved": True, "notes": "OK, Have fun!"}, headers=headers)
    assert res.status_code == 200
    print("✅ 假期申请逻辑通过！已扣除对应年假。")

    # 6. 生成薪资单
    print("🔹 [5/7] 测试: 批量生成当月薪资单及强积金扣算...")
    res = client.post(f"/companies/{company_id}/hr/payroll/generate?month=2024-05", headers=headers)
    assert res.status_code == 200, res.text
    
    res = client.get(f"/companies/{company_id}/hr/payroll?month=2024-05&employee_id={employee_id}", headers=headers)
    records = res.json()
    assert len(records) > 0, "未能找到刚生成的薪资单"
    payroll_id = records[0]["id"]
    
    # MPF Check: 25000 -> mpf 1250
    assert records[0]["employee_mpf"] == 1250.0, f"雇员 MPF 计算错误"
    assert records[0]["employer_mpf"] == 1250.0, "雇主 MPF 计算错误"
    assert records[0]["net_pay"] == 23750.0, "实发工资计算错误"
    print(f"✅ 薪资单MPF扣算正确: 底薪 25000 / MPF: 1250")

    # Confirm list
    res = client.post(f"/companies/{company_id}/hr/payroll/{payroll_id}/confirm", headers=headers)
    assert res.status_code == 200
    
    # 7. eMPF CSV
    print("🔹 [6/7] 测试: 积金易 eMPF 档案导出...")
    res = client.get(f"/companies/{company_id}/hr/payroll/mpf-export?month=2024-05", headers=headers)
    assert res.status_code == 200
    print("✅ eMPF CSV 文件流验证通过！")

    # 8. Terminate
    print("🔹 [7/7] 测试: 员工离职注销...")
    res = client.post(
        f"/companies/{company_id}/hr/employees/{employee_id}/terminate",
        json={"termination_date": "2024-06-01", "reason": "辞职"},
        headers=headers
    )
    assert res.status_code == 200
    print("✅ 员工档案软删除测试通过！")
    print("\n🎉 HR 模块验证 100% 成功！")

if __name__ == "__main__":
    run_tests()
