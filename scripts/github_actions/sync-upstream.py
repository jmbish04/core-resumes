"""
Sync Upstream Companies Script

This script fetches Greenhouse job board tokens from the feashliaa upstream repository
and synchronizes them with the Core Resumes backend database via its REST API.

It acts as a lightweight client that downloads the latest token definitions,
extracts the relevant board identifiers, and posts them to the worker's
`/api/pipeline/board-tokens/sync` endpoint for processing and state management.

Required Environment Variables:
- WORKER_API_URL: The base URL of the Cloudflare Worker API (e.g. https://api.yourdomain.com)
- WORKER_API_KEY: The API key required to authenticate with the Worker API
"""

import os
import requests
import json
import sys

def send_progress(worker_url, worker_key, status, current=None, total=None, message=""):
    url = f"{worker_url.rstrip('/')}/api/pipeline/api-companies/sync-progress"
    try:
        payload = {"status": status, "message": message}
        if current is not None: payload["current"] = current
        if total is not None: payload["total"] = total
        
        requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {worker_key}"
            },
            json=payload
        )
    except Exception as e:
        print(f"Failed to send progress: {e}")

def fetch_upstream(worker_url, worker_key):
    """
    Fetches the list of JSON files from the upstream repository, parses them,
    and extracts the raw job board tokens.
    
    Returns:
        list[str]: A list of unique job board tokens.
    """
    url = "https://api.github.com/repos/Feashliaa/job-board-aggregator/contents/data"
    print(f"Fetching from upstream: {url}")
    send_progress(worker_url, worker_key, "fetching", message="Fetching list of upstream files...")
    
    res = requests.get(url)
    res.raise_for_status()
    contents = res.json()
    
    tokens_set = set()
    company_list = []
    
    # Filter for _companies.json files
    target_files = [item for item in contents if item["type"] == "file" and item["name"].endswith("_companies.json")]
    total_files = len(target_files)
    
    send_progress(worker_url, worker_key, "processing", current=0, total=total_files, message=f"Found {total_files} upstream files to process.")
    
    files_processed = 0
    
    for item in target_files:
        files_processed += 1
        source = item["name"]
        system = source.replace("_companies.json", "")
        
        # Fetch raw content
        raw_url = item["download_url"]
        file_res = requests.get(raw_url)
        file_res.raise_for_status()
        
        try:
            tokens = file_res.json()
            for token in tokens:
                token_str = str(token)
                if token_str not in tokens_set:
                    tokens_set.add(token_str)
                    # We store the token with its source/system metadata
                    company_list.append({
                        "token": token_str,
                        "system": system,
                        "source": source
                    })
        except Exception as e:
            print(f"Failed to parse {source}: {e}")
            send_progress(worker_url, worker_key, "processing", message=f"Warning: Failed to parse {source}: {e}")
            
        if files_processed % 5 == 0 or files_processed == total_files:
            send_progress(worker_url, worker_key, "processing", current=files_processed, total=total_files, message=f"Processed {files_processed}/{total_files} files.")
            
    send_progress(
        worker_url,
        worker_key,
        "processing",
        current=files_processed,
        total=total_files,
        message=f"Fetched {len(company_list)} unique tokens from {files_processed} upstream files."
    )
    return company_list, files_processed


def main():
    worker_url = os.environ.get("WORKER_API_URL")
    worker_key = os.environ.get("WORKER_API_KEY")
    
    if not worker_url or not worker_key:
        print("Error: WORKER_API_URL and WORKER_API_KEY environment variables are required.")
        print("Please configure them before running this script.")
        sys.exit(1)
        
    try:
        tokens, files_processed = fetch_upstream(worker_url, worker_key)
    except Exception as e:
        print(f"Error fetching from upstream: {e}")
        send_progress(worker_url, worker_key, "failed", message=f"Failed to fetch upstream: {e}")
        sys.exit(1)
        
    print(f"Fetched {len(tokens)} unique tokens from {files_processed} upstream files.")
    
    sync_url = f"{worker_url.rstrip('/')}/api/pipeline/api-companies/sync"
    print(f"Syncing to worker API: {sync_url}")
    
    send_progress(
        worker_url,
        worker_key,
        "saving_db",
        message=f"Syncing {len(tokens)} unique companies to local database..."
    )
    
    try:
        res = requests.post(
            sync_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {worker_key}"
            },
            json={"companies": tokens}
        )
        res.raise_for_status()
        
        result = res.json()
        print("\nSync Complete!")
        print(f"Inserted newly discovered tokens: {result.get('inserted', 0)}")
        print(f"Reactivated existing tokens: {result.get('reactivated', 0)}")
        print(f"Deactivated missing tokens: {result.get('deactivated', 0)}")
        
        send_progress(
            worker_url, 
            worker_key, 
            "completed", 
            message=f"Sync complete. Inserted: {result.get('inserted', 0)}, Reactivated: {result.get('reactivated', 0)}, Deactivated: {result.get('deactivated', 0)}"
        )
        
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error during sync: {e}")
        send_progress(worker_url, worker_key, "failed", message=f"HTTP Error during sync: {e}")
        if e.response is not None:
            print(f"Response: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"Failed to sync with API: {e}")
        send_progress(worker_url, worker_key, "failed", message=f"Failed to sync with API: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
