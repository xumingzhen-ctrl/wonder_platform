import requests

url = "https://wonderwisdom.online/api/fip/portfolios"
try:
    response = requests.get(url, timeout=10)
    print("Status:", response.status_code)
    print(response.json())
except Exception as e:
    print("Error:", e)
