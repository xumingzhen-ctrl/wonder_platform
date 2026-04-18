import httpx, json
res = httpx.get("https://openrouter.ai/api/v1/models")
models = res.json().get("data", [])
for m in models:
    if m["id"] in ["qwen/qwen2.5-vl-72b-instruct", "meta-llama/llama-3.2-90b-vision-instruct", "meta-llama/llama-3.2-11b-vision-instruct"]:
        name = m["id"]
        prompt = float(m["pricing"]["prompt"]) * 1000000
        completion = float(m["pricing"]["completion"]) * 1000000
        print(f"{name}: Input ${prompt:.3f}/1M | Output ${completion:.3f}/1M")
