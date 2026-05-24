#!/usr/bin/env python3
import os
import sys
import subprocess
import json
import requests
import re
import argparse

# Console formatting
GREEN = '\033[0;32m'
CYAN = '\033[0;36m'
RED = '\033[0;31m'
BOLD = '\033[1m'
RESET = '\033[0m'

def info(msg): print(f"{CYAN}▸{RESET} {msg}")
def ok(msg): print(f"{GREEN}✔{RESET} {msg}")
def fail(msg): 
    print(f"{RED}✖ {msg}{RESET}", file=sys.stderr)
    sys.exit(1)

def run_cmd(cmd, check=True, capture_output=True):
    try:
        res = subprocess.run(cmd, check=check, capture_output=capture_output, text=True, shell=isinstance(cmd, str))
        return res.stdout.strip()
    except subprocess.CalledProcessError as e:
        if check:
            fail(f"Command failed: {cmd}\n{e.stderr}")
        return ""

def get_secret(env_var: str) -> str:
    """Fetches secrets from env or local tokens CLI fallback."""
    val = os.environ.get(env_var, "").strip()
    if val: return val
    # Try the tokens CLI
    res = run_cmd(f"tokens show {env_var} --value-only", check=False)
    if res: return res
    return ""

def generate_ai_metadata(diff_text: str, account_id: str, api_token: str, user_hint: str = ""):
    """Uses Cloudflare Workers AI to generate PR metadata from a git diff."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/meta/llama-3.1-8b-instruct"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json"
    }

    # Truncate diff to avoid token limits (~6k words = ~8k tokens)
    if len(diff_text) > 25000:
        diff_text = diff_text[:25000] + "\n...[TRUNCATED]"

    system_prompt = """
You are an expert developer. Based on the provided git diff, generate a pull request title, a detailed markdown PR body, and a short slugified branch name.
Output EXACTLY a JSON object with the keys "branch_name", "pr_title", and "pr_body".

Rules for branch_name:
- all lowercase
- use hyphens instead of spaces
- start with 'feat/', 'fix/', 'chore/', or 'refactor/' based on the changes.
- max 50 chars.

Rules for pr_title:
- Conventional commit format (e.g. "feat: add user authentication")
- max 72 chars.

Rules for pr_body:
- Markdown format
- Include a "## Summary" section
- Include a bulleted list of "## Key Changes"
"""
    user_prompt = f"Git Diff:\n```diff\n{diff_text}\n```"
    if user_hint:
        user_prompt += f"\n\nUser explicitly requested this context/title: {user_hint}"

    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    }

    info("Calling Cloudflare Workers AI...")
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("success"):
            fail(f"AI API failed: {data.get('errors')}")
            
        result_text = data["result"]["response"].strip()
        
        # Extract JSON if wrapped in markdown
        json_match = re.search(r'```json\n(.*?)\n```', result_text, re.DOTALL)
        if json_match:
            result_text = json_match.group(1)
        else:
            # Fallback cleanup just in case
            result_text = result_text.strip('`').strip()
            
        metadata = json.loads(result_text)
        return metadata
    except requests.exceptions.RequestException as e:
        fail(f"Network error calling Workers AI: {e}")
    except json.JSONDecodeError:
        fail(f"Failed to parse AI response as JSON: {result_text}")

def main():
    parser = argparse.ArgumentParser(description="AI-powered git commit and PR generator")
    parser.add_argument("message", nargs="?", default="", help="Optional hint or title for the PR")
    parser.add_argument("--draft", action="store_true", help="Create the PR as a draft")
    args = parser.parse_args()

    # Preflight checks
    if not run_cmd("command -v gh", check=False):
        fail("GitHub CLI (gh) is not installed. Run: brew install gh")
    if not run_cmd("gh auth status", check=False, capture_output=False):
        fail("Not authenticated with GitHub CLI. Run: gh auth login")

    # Ensure Cloudflare credentials
    account_id = get_secret("CLOUDFLARE_ACCOUNT_ID")
    api_token = get_secret("CLOUDFLARE_AI_GATEWAY_TOKEN") or get_secret("CLOUDFLARE_API_TOKEN") or get_secret("WORKER_API_KEY")

    # Stage all changes
    info("Staging all changes...")
    run_cmd("git add -A")

    # Get the diff (including staged changes)
    diff_text = run_cmd("git diff --cached")
    if not diff_text:
        fail("No changes to commit.")

    # Generate AI Metadata or use simple fallback
    if account_id and api_token:
        info("Analyzing changes with AI...")
        metadata = generate_ai_metadata(diff_text, account_id, api_token, args.message)
        branch_name = metadata.get("branch_name", "chore/update")
        pr_title = metadata.get("pr_title", args.message or "chore: automated update")
        pr_body = metadata.get("pr_body", "Automated PR generated by AI.")
    else:
        info("Cloudflare credentials not found. Falling back to basic mode.")
        if not args.message:
            fail("Cloudflare credentials not found AND no commit message provided. Aborting.")
        
        pr_title = args.message
        branch_name = re.sub(r'[^a-z0-9]', '-', pr_title.lower())
        branch_name = re.sub(r'-+', '-', branch_name).strip('-')[:60]
        pr_body = f"## Summary\n\n{pr_title}"

    ok(f"Generated PR Title: {BOLD}{pr_title}{RESET}")
    info(f"Generated Branch: {branch_name}")

    # Determine default branch
    default_branch = run_cmd("gh repo view --json defaultBranchRef -q '.defaultBranchRef.name'", check=False)
    if not default_branch:
        fail("Could not determine default branch. Are you inside a GitHub repo?")

    # Fetch latest default branch just to have up-to-date refs, but DO NOT reset the working directory.
    info(f"Fetching latest {default_branch}...")
    run_cmd(f"git fetch origin {default_branch} --quiet")

    # Ensure we create the branch from the CURRENT HEAD (local state) to preserve work!
    # If the branch already exists, we will just commit to it.
    current_branch = run_cmd("git branch --show-current")
    if current_branch != branch_name:
        info(f"Creating and switching to branch: {BOLD}{branch_name}{RESET} (from current HEAD)")
        run_cmd(f"git checkout -b {branch_name}")

    # Commit
    info(f"Committing: {BOLD}{pr_title}{RESET}")
    run_cmd(["git", "commit", "-m", pr_title])

    # Push
    info(f"Pushing to origin/{branch_name}...")
    run_cmd(f"git push -u origin {branch_name}")

    # Open PR
    info(f"Opening PR against {BOLD}{default_branch}{RESET}...")
    
    pr_body_full = f"{pr_body}\n\n---\n*Opened via `commit_and_pr.py` (Cloudflare Workers AI)*"
    
    cmd = ["gh", "pr", "create", "--base", default_branch, "--head", branch_name, "--title", pr_title, "--body", pr_body_full]
    if args.draft:
        cmd.append("--draft")
        
    pr_url = run_cmd(cmd)
    
    ok(f"PR created: {BOLD}{pr_url}{RESET}")

if __name__ == "__main__":
    main()
