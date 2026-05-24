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

import atexit
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import requests

# Background pool for fire-and-forget progress POSTs. Each call returns
# immediately so the main script never blocks on an upstream/worker hiccup.
# Capped at 4 workers - progress events are small and infrequent.
_progress_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sync-progress")


def _shutdown_progress_pool():
    """Flush any in-flight progress POSTs before the process exits."""
    _progress_pool.shutdown(wait=True, cancel_futures=False)


atexit.register(_shutdown_progress_pool)


def _post_progress(url, headers, payload):
    """Single attempt with one retry. Runs on a background worker thread."""
    for attempt in (1, 2):
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            res.raise_for_status()
            return
        except Exception as e:
            response_text = ""
            if 'res' in locals() and res is not None:
                response_text = f" | Status: {res.status_code} | Body: {res.text[:300]}"
            print(f"[progress] attempt {attempt} failed for status '{payload.get('status')}': {e}{response_text}",
                  file=sys.stderr)
            if attempt == 2:
                print(f"[progress] dropped after retry: {payload.get('status')} - {e}{response_text}",
                      file=sys.stderr)


def send_progress(worker_url, worker_key, status, current=None, total=None, message=""):
    """Fire-and-forget progress update. Returns immediately.

    Failures are logged but never propagated to the caller. The worker handler
    is responsible for fanning out to dashboard WebSockets; if that fan-out
    fails the REST POST still succeeds (HTTP 200) so the GitHub Action keeps
    moving forward.
    """
    url = f"{worker_url.rstrip('/')}/api/pipeline/api-companies/sync-progress"
    payload = {"status": status, "message": message}
    if current is not None:
        payload["current"] = current
    if total is not None:
        payload["total"] = total

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {worker_key}",
    }

    try:
        _progress_pool.submit(_post_progress, url, headers, payload)
    except Exception as submit_err:
        # Pool unavailable (shut down, saturated, or otherwise rejecting work).
        # Fall back to a blocking synchronous POST so the event still ships.
        try:
            _post_progress(url, headers, payload)
        except Exception as post_err:
            print(
                f"[progress] dropped (pool: {submit_err}; sync fallback: {post_err})",
                file=sys.stderr,
            )

def send_recommendation(worker_url, worker_key, token, system, source, reason, jobs=None):
    """
    Direct REST API post to save a company recommendation and job postings in real-time.
    Runs on the background progress thread pool to be completely non-blocking.
    """
    url = f"{worker_url.rstrip('/')}/api/pipeline/api-companies/recommend"
    payload = {
        "token": token,
        "system": system,
        "source": source,
        "recommendationReason": reason,
    }
    if jobs:
        payload["jobs"] = [
            {
                "id": j["id"],
                "title": j["title"],
                "location": j["location"]
            }
            for j in jobs
        ]
        
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {worker_key}",
    }
    
    try:
        _progress_pool.submit(_post_recommendation, url, headers, payload)
    except Exception:
        # Fall back to synchronous post if pool is saturated/shut down
        try:
            _post_recommendation(url, headers, payload)
        except Exception:
            pass

def _post_recommendation(url, headers, payload):
    """Sends the recommendation payload to the worker REST API."""
    for attempt in (1, 2):
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=10)
            res.raise_for_status()
            return
        except Exception as e:
            if attempt == 2:
                print(f"[recommendation] Failed to post match to REST API for {payload.get('token')}: {e}", file=sys.stderr)

def fetch_search_terms(worker_url, worker_key):
    """Fetch matching title and location keywords from the worker."""
    url = f"{worker_url.rstrip('/')}/api/pipeline/api-companies/search-terms"
    try:
        res = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {worker_key}",
                "User-Agent": "Core-Resumes-Aggregator-Sync"
            },
            timeout=10
        )
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print(f"Warning: Failed to fetch search terms from worker, using defaults: {e}")
        return {
            "titles": [
                "software engineer",
                "software developer",
                "frontend",
                "backend",
                "fullstack",
                "full stack",
                "engineer",
                "developer",
                "platform",
                "infrastructure",
                "devops"
            ],
            "locations": [
                "remote",
                "san francisco",
                "sf",
                "bay area",
                "california",
                "united states",
                "us",
                "usa"
            ]
        }


def fetch_promoted_tokens(worker_url, worker_key):
    """Fetch list of company board tokens already promoted to Pipeline B."""
    url = f"{worker_url.rstrip('/')}/api/pipeline/board-tokens"
    try:
        res = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {worker_key}",
                "User-Agent": "Core-Resumes-Aggregator-Sync"
            },
            timeout=10
        )
        res.raise_for_status()
        data = res.json()
        tokens = data.get("tokens", [])
        return set(t.get("token") for t in tokens)
    except Exception as e:
        print(f"Warning: Failed to fetch promoted tokens: {e}")
        return set()


def check_company_jobs(token, system, search_terms):
    """
    Queries the public job board for a company and checks if any jobs
    match the title and location keywords.
    
    Returns:
        list[dict]: A list of dictionaries representing matching jobs:
                   {"id": str, "title": str, "location": str}
    """
    titles = search_terms.get("titles", [])
    locations = search_terms.get("locations", [])
    
    titles_lower = [t.lower() for t in titles]
    locations_lower = [l.lower() for l in locations]
    
    matching_jobs = []
    
    if system == "greenhouse":
        url = f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs"
        try:
            res = requests.get(url, timeout=5, headers={"User-Agent": "Core-Resumes-Aggregator-Sync"})
            if res.status_code == 200:
                data = res.json()
                jobs = data.get("jobs", [])
                for job in jobs:
                    title = str(job.get("title", "")).lower()
                    loc_obj = job.get("location") or {}
                    location_name = loc_obj.get("name") if isinstance(loc_obj, dict) else loc_obj
                    location = str(location_name).lower()
                    
                    title_match = any(t in title for t in titles_lower)
                    location_match = any(l in location for l in locations_lower)
                    
                    if title_match and location_match:
                        matching_jobs.append({
                            "id": f"gh-{token}-{job.get('id')}",
                            "title": job.get("title"),
                            "location": location_name
                        })
        except Exception:
            pass
            
    elif system == "lever":
        url = f"https://api.lever.co/v0/postings/{token}"
        try:
            res = requests.get(url, timeout=5, headers={"User-Agent": "Core-Resumes-Aggregator-Sync"})
            if res.status_code == 200:
                jobs = res.json()
                if isinstance(jobs, list):
                    for job in jobs:
                        title = str(job.get("title", "")).lower()
                        cat_obj = job.get("categories") or {}
                        location_name = cat_obj.get("location") if isinstance(cat_obj, dict) else ""
                        location = str(location_name).lower()
                        
                        title_match = any(t in title for t in titles_lower)
                        location_match = any(l in location for l in locations_lower)
                        
                        if title_match and location_match:
                            matching_jobs.append({
                                "id": f"lv-{token}-{job.get('id')}",
                                "title": job.get("title"),
                                "location": location_name
                            })
        except Exception:
            pass

    elif system == "ashby":
        url = f"https://api.ashbyhq.com/posting-api/job-board/{token}"
        try:
            res = requests.get(url, timeout=5, headers={"User-Agent": "Core-Resumes-Aggregator-Sync"})
            if res.status_code == 200:
                data = res.json()
                jobs = data.get("jobs", [])
                for job in jobs:
                    title = str(job.get("title", "")).lower()
                    location_name = job.get("location")
                    location = str(location_name).lower()
                    
                    title_match = any(t in title for t in titles_lower)
                    location_match = any(l in location for l in locations_lower)
                    
                    if title_match and location_match:
                        matching_jobs.append({
                            "id": f"as-{token}-{job.get('id')}",
                            "title": job.get("title"),
                            "location": location_name
                        })
        except Exception:
            pass
            
    return matching_jobs


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
    
    github_headers = {
        "User-Agent": "Core-Resumes-Aggregator-Sync"
    }
    
    res = requests.get(url, headers=github_headers)
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
        file_res = requests.get(raw_url, headers=github_headers)
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
                        "source": source,
                        "isRecommended": False,
                        "recommendationReason": None,
                        "recommendedJobs": []
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
        message=f"Fetched {len(company_list):,} unique tokens from {files_processed} upstream files."
    )

    # -------------------------------------------------------------------------
    # Jobs matching recommendation engine
    # -------------------------------------------------------------------------
    send_progress(worker_url, worker_key, "processing", message="Fetching search keywords and tracked tokens...")
    search_terms = fetch_search_terms(worker_url, worker_key)
    promoted_tokens = fetch_promoted_tokens(worker_url, worker_key)
    
    untracked = [c for c in company_list if c["token"] not in promoted_tokens]
    MAX_CHECKS = 300
    to_scan = untracked[:MAX_CHECKS]
    
    send_progress(
        worker_url,
        worker_key,
        "processing",
        message=f"Scanning jobs for {len(to_scan)} unpromoted companies (Max: {MAX_CHECKS})..."
    )
    
    # We check job listings concurrently using ThreadPoolExecutor
    # 20 workers keep memory footprint low and runs extremely fast
    matches_found = 0
    with ThreadPoolExecutor(max_workers=20, thread_name_prefix="job-scanner") as executor:
        # Create futures mapping each company dict to its async check task
        futures = {
            executor.submit(check_company_jobs, c["token"], c["system"], search_terms): c
            for c in to_scan
        }
        
        for future in futures:
            company = futures[future]
            try:
                matching_jobs = future.result()
                if matching_jobs:
                    company["isRecommended"] = True
                    company["recommendedJobs"] = matching_jobs
                    
                    # Generate a concise reason string listing the jobs
                    job_descriptions = [f"'{j['title']}' in '{j['location']}'" for j in matching_jobs]
                    company["recommendationReason"] = f"Found {len(matching_jobs)} matching job(s): {', '.join(job_descriptions[:3])}"
                    if len(matching_jobs) > 3:
                        company["recommendationReason"] += f" and {len(matching_jobs) - 3} more"
                    
                    matches_found += 1
                    print(f"[recommendation] matched {company['token']}: {company['recommendationReason']}")
                    
                    # Push recommendation to REST API in real-time. This provides immediate D1 coverage
                    # and successfully posts matching jobs even if the final huge sync POST gets interrupted.
                    send_recommendation(
                        worker_url,
                        worker_key,
                        company["token"],
                        company["system"],
                        company["source"],
                        company["recommendationReason"],
                        matching_jobs
                    )
            except Exception as scan_err:
                print(f"[recommendation] error checking {company['token']}: {scan_err}")
                
    send_progress(
        worker_url,
        worker_key,
        "processing",
        message=f"Scanned unpromoted job boards. Identified {matches_found} matching recommendations."
    )
    
    return company_list, files_processed


def main():
    worker_url = os.environ.get("WORKER_API_URL")
    worker_key = os.environ.get("WORKER_API_KEY")
    
    if not worker_url or not worker_key:
        print("Error: WORKER_API_URL and WORKER_API_KEY environment variables are required.")
        print("Please configure them before running this script.")
        sys.exit(1)
        
    # Signal that the remote action script has connected and started execution
    send_progress(worker_url, worker_key, "initializing", message="GitHub Action runner connected. Commencing sync pipeline...")
    
    try:
        tokens, files_processed = fetch_upstream(worker_url, worker_key)
    except Exception as e:
        print(f"Error fetching from upstream: {e}")
        send_progress(worker_url, worker_key, "failed", message=f"Failed to fetch upstream: {e}")
        sys.exit(1)
        
    print(f"Fetched {len(tokens):,} unique tokens from {files_processed} upstream files.")
    
    sync_url = f"{worker_url.rstrip('/')}/api/pipeline/api-companies/sync"
    print(f"Syncing to worker API: {sync_url}")
    
    send_progress(
        worker_url,
        worker_key,
        "saving_db",
        message=f"Syncing {len(tokens):,} unique companies to local database..."
    )
    
    try:
        res = requests.post(
            sync_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {worker_key}"
            },
            json={"companies": tokens, "files_processed": files_processed}
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
            message=f"Sync complete. Inserted: {result.get('inserted', 0):,}, Reactivated: {result.get('reactivated', 0):,}, Deactivated: {result.get('deactivated', 0):,}"
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
