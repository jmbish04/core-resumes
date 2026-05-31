import os, subprocess, requests, json

def get_secret(env_var: str) -> str:
    val = os.environ.get(env_var, "").strip()
    if val: return val
    try:
        result = subprocess.run(["tokens", "show", env_var, "--value-only"], capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except Exception:
        return ""

account_id = get_secret("CLOUDFLARE_ACCOUNT_ID")
api_token = get_secret("CLOUDFLARE_AI_GATEWAY_TOKEN")
if not api_token: api_token = get_secret("CLOUDFLARE_API_TOKEN")

print(f"Account: {account_id}, Token: {api_token[:5]}...")

url = f"https://gateway.ai.cloudflare.com/v1/{account_id}/default-gateway/compat/chat/completions"
headers = {
    "Authorization": f"Bearer {api_token}",
    "Content-Type": "application/json"
}
payload = {
    "model": "workers-ai/@cf/meta/llama-3.1-8b-instruct",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant. Reply with a valid JSON object: {\"message\": \"hello world\"}"},
        {"role": "user", "content": "Say hello"}
    ],
    "response_format": {"type": "json_object"}
}

resp = requests.post(url, headers=headers, json=payload)
print(resp.status_code)
print(resp.text)
