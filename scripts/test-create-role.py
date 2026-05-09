#!/usr/bin/env python3
"""
Test script: Create a role via the API and monitor its background processing.

Usage:
  python3 scripts/test-create-role.py --api-key YOUR_KEY
  python3 scripts/test-create-role.py --api-key YOUR_KEY --job-url "https://..."
  python3 scripts/test-create-role.py --api-key YOUR_KEY --timeout 600
"""

import argparse
import json
import time
import sys
import urllib.request
import urllib.error

CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)


def make_headers(api_key: str) -> dict:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": CHROME_UA,
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


from typing import Optional


def api_request(url: str, headers: dict, data: Optional[dict] = None, method: str = "GET"):
    """Make an HTTP request and return parsed JSON."""
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8") if data else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body), response.status
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        return {"error": error_body, "status_code": e.code}, e.code
    except Exception as e:
        return {"error": str(e)}, 0


def status_icon(status: str) -> str:
    return {
        "pending": "⏳",
        "running": "🔄",
        "complete": "✅",
        "failed": "❌",
    }.get(status, "❓")


def main():
    parser = argparse.ArgumentParser(
        description="Test creating a role and monitoring its processing status."
    )
    parser.add_argument(
        "--url",
        default="https://core-resumes.hacolby.workers.dev",
        help="Base URL of the API",
    )
    parser.add_argument(
        "--job-url",
        default="https://job-boards.greenhouse.io/anthropic/jobs/5142374008",
        help="Job URL to submit",
    )
    parser.add_argument("--company", default="Anthropic", help="Company Name")
    parser.add_argument(
        "--title", default="Software Engineer", help="Job Title"
    )
    parser.add_argument(
        "--api-key", required=True, help="The WORKER_API_KEY for authentication"
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Max seconds to wait for all tasks (default: 300)",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=5,
        help="Seconds between status polls (default: 5)",
    )
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    headers = make_headers(args.api_key)

    # ── Step 1: Create the role ─────────────────────────────────────────────
    confirm_url = f"{base_url}/api/intake/confirm"
    payload = {
        "companyName": args.company,
        "jobTitle": args.title,
        "jobUrl": args.job_url,
        "location": "Remote",
        "workplaceType": "remote",
    }

    print(f"\n{'='*60}")
    print(f"  Creating role at {confirm_url}")
    print(f"  Job URL: {args.job_url}")
    print(f"{'='*60}\n")

    role_data, status_code = api_request(confirm_url, headers, payload, method="POST")

    if status_code != 201:
        print(f"❌ Failed to create role: HTTP {status_code}")
        print(json.dumps(role_data, indent=2))
        sys.exit(1)

    role_id = role_data.get("id")
    if not role_id:
        print("❌ Response did not contain a role ID.")
        print(json.dumps(role_data, indent=2))
        sys.exit(1)

    print(f"✅ Role created: {role_id}")
    print(f"   Company: {role_data.get('companyName')}")
    print(f"   Title:   {role_data.get('jobTitle')}")
    print(f"   Status:  {role_data.get('status')}")
    if role_data.get("driveFolderId"):
        print(f"   Drive:   https://drive.google.com/drive/folders/{role_data['driveFolderId']}")

    # ── Step 2: Poll processing status ──────────────────────────────────────
    status_url = f"{base_url}/api/roles/{role_id}/processing-status"
    start_time = time.time()
    seen_task_ids = set()
    last_task_count = 0
    stable_polls = 0  # Count of consecutive polls with same task list and all terminal

    print(f"\n📊 Monitoring processing status (timeout: {args.timeout}s)")
    print(f"   URL: {status_url}\n")

    while True:
        elapsed = time.time() - start_time
        if elapsed > args.timeout:
            print(f"\n⏰ Timeout after {int(elapsed)}s")
            sys.exit(1)

        status_data, sc = api_request(status_url, headers)
        if sc != 200:
            print(f"❌ Failed to get status: HTTP {sc}")
            print(json.dumps(status_data, indent=2))
            sys.exit(1)

        tasks = status_data.get("tasks", [])
        if not tasks:
            print(f"  [{int(elapsed):>3}s] Waiting for tasks to appear...")
            time.sleep(args.poll_interval)
            continue

        # Detect new tasks being auto-chained
        current_ids = {t["id"] for t in tasks}
        new_ids = current_ids - seen_task_ids
        if new_ids:
            for task in tasks:
                if task["id"] in new_ids:
                    print(f"  [{int(elapsed):>3}s] 🆕 New task: {task['type']} ({task['id'][:8]}...)")
            seen_task_ids.update(new_ids)

        # Print status line
        running = [t for t in tasks if t["status"] == "running"]
        pending = [t for t in tasks if t["status"] == "pending"]
        completed = [t for t in tasks if t["status"] == "complete"]
        failed = [t for t in tasks if t["status"] == "failed"]

        parts = []
        if running:
            parts.append(f"🔄 {len(running)} running")
        if pending:
            parts.append(f"⏳ {len(pending)} pending")
        if completed:
            parts.append(f"✅ {len(completed)} done")
        if failed:
            parts.append(f"❌ {len(failed)} failed")

        print(f"  [{int(elapsed):>3}s] {' | '.join(parts)} ({len(tasks)} total)")

        # Print details for running tasks
        for task in running:
            print(f"         🔄 {task['type']}")

        # Print details for newly failed tasks
        for task in failed:
            if task.get("error"):
                truncated = task["error"][:120]
                print(f"         ❌ {task['type']}: {truncated}")

        # Check completion
        all_terminal = all(t["status"] in ("complete", "failed") for t in tasks)

        if all_terminal:
            # Wait a couple polls for auto-chained tasks to appear
            if len(tasks) == last_task_count:
                stable_polls += 1
            else:
                stable_polls = 0

            # After 3 stable polls with all terminal, we're done
            if stable_polls >= 3:
                break

        last_task_count = len(tasks)
        time.sleep(args.poll_interval)

    # ── Step 3: Final summary ───────────────────────────────────────────────
    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"  Processing Complete — {int(elapsed)}s elapsed")
    print(f"{'='*60}\n")

    for task in tasks:
        icon = status_icon(task["status"])
        print(f"  {icon} {task['type']:<28} {task['status']}")
        if task.get("error"):
            print(f"     └─ {task['error'][:200]}")

    has_failures = any(t["status"] == "failed" for t in tasks)
    completed_count = sum(1 for t in tasks if t["status"] == "complete")

    print(f"\n  Summary: {completed_count}/{len(tasks)} tasks succeeded")

    if has_failures:
        print("  ⚠️  Some tasks failed — review errors above.")
        sys.exit(1)
    else:
        print("  🎉 All tasks completed successfully!")
        sys.exit(0)


if __name__ == "__main__":
    main()
