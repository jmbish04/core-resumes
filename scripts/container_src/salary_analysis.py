#!/usr/bin/env python3
import json
import os
import sys

def analyze_compensation(data):
    """
    Perform deep statistical salary analysis on input_data.json.
    Computes remote/local deltas, H1B matches, and target negotiation anchors.
    """
    stats = data.get("stats", [])
    company_salaries = data.get("companySalaries", [])
    role_context = data.get("roleContext", {})
    query = data.get("query", "")

    # Role details
    job_title = role_context.get("jobTitle", "Target Role")
    company_name = role_context.get("companyName", "Target Company")
    min_sal = role_context.get("salaryMin")
    max_sal = role_context.get("salaryMax")

    # Local, remote, national, hubs metrics
    metrics = {
        "remote": None,
        "local_market": None,
        "national": None,
        "top_hubs": None
    }
    
    for s in stats:
        m_key = s.get("metricKey")
        if m_key in metrics:
            metrics[m_key] = {
                "p25": s.get("p25"),
                "median": s.get("median"),
                "p75": s.get("p75"),
                "sampleSize": s.get("sampleSize"),
                "label": s.get("metricLabel", m_key)
            }

    # Seniority analysis for company filings
    company_filings = []
    for cs in company_salaries:
        company_filings.append({
            "title": cs.get("jobTitle"),
            "seniority": cs.get("seniority"),
            "p25": cs.get("p25"),
            "median": cs.get("median"),
            "p75": cs.get("p75"),
            "sampleSize": cs.get("sampleSize")
        })

    # Calculations
    insights = []
    
    # 1. Remote discount delta
    remote = metrics.get("remote")
    local = metrics.get("local_market")
    if remote and local and remote["median"] and local["median"]:
        discount = ((local["median"] - remote["median"]) / local["median"]) * 100
        insights.append(f"Remote roles in this tier typically carry a {discount:.1f}% discount compared to San Francisco local market rates.")

    # 2. Offered salary evaluation
    if min_sal and max_sal:
        midpoint = (min_sal + max_sal) / 2
        insights.append(f"Advertised range: ${min_sal:,} - ${max_sal:,} (Midpoint: ${midpoint:,.0f}).")
        
        # Compare vs Local
        if local and local["median"]:
            ratio = (midpoint / local["median"]) * 100
            if ratio >= 110:
                insights.append(f"Advertised midpoint is {ratio-100:.1f}% ABOVE the local SF Bay Area median (${local['median']:,}).")
            elif ratio <= 90:
                insights.append(f"Advertised midpoint is {100-ratio:.1f}% BELOW the local SF Bay Area median (${local['median']:,}).")
            else:
                insights.append(f"Advertised midpoint aligns closely (within 10%) with local SF Bay Area median (${local['median']:,}).")
    
    # 3. Company H1B comparison
    if company_filings:
        insights.append(f"Found {len(company_filings)} certified H1B filing records for '{company_name}':")
        for f in company_filings:
            insights.append(f"  - Title: '{f['title']}' ({f['seniority']} tier) | Median base: ${f['median']:,} | p75 base: ${f['p75']:,} (Sample size: {f['sampleSize']})")

    # 4. Target anchors recommendations
    target_anchors = {}
    if local and local["median"]:
        target_anchors["local_target"] = {
            "conservative": int(local["p25"]),
            "median": int(local["median"]),
            "aggressive": int(local["p75"])
        }
    if remote and remote["median"]:
        target_anchors["remote_target"] = {
            "conservative": int(remote["p25"]),
            "median": int(remote["median"]),
            "aggressive": int(remote["p75"])
        }

    # Generate Markdown Summary
    md = []
    md.append(f"# High-Fidelity Salary Analysis for {jobTitle_format(job_title)}")
    md.append(f"**Target Company:** {company_name}")
    md.append("")
    md.append("## Statistical Insights")
    for ins in insights:
        md.append(f"- {ins}")
    
    md.append("")
    md.append("## Market Benchmarks")
    md.append("| Metric | 25th Percentile | Median (50th) | 75th Percentile | Sample Size |")
    md.append("| :--- | :--- | :--- | :--- | :--- |")
    for key, val in metrics.items():
        if val:
            md.append(f"| {val['label']} | ${val['p25']:,} | ${val['median']:,} | ${val['p75']:,} | {val['sampleSize']} |")
        else:
            md.append(f"| {key.replace('_', ' ').title()} | N/A | N/A | N/A | N/A |")
            
    md.append("")
    md.append("## Negotiation Anchors & Strategy")
    if target_anchors:
        if "local_target" in target_anchors:
            l_t = target_anchors["local_target"]
            md.append("### Onsite/Hybrid (San Francisco)")
            md.append(f"- **Conservative floor (25th):** ${l_t['conservative']:,}")
            md.append(f"- **Standard target (Median):** ${l_t['median']:,}")
            md.append(f"- **Aggressive ceiling (75th):** ${l_t['aggressive']:,}")
        if "remote_target" in target_anchors:
            r_t = target_anchors["remote_target"]
            md.append("### Remote Work")
            md.append(f"- **Conservative floor (25th):** ${r_t['conservative']:,}")
            md.append(f"- **Standard target (Median):** ${r_t['median']:,}")
            md.append(f"- **Aggressive ceiling (75th):** ${r_t['aggressive']:,}")
    else:
        md.append("Insufficient statistical data to generate anchors.")

    # Write output JSON
    output_data = {
        "insights": insights,
        "metrics": metrics,
        "companyFilings": company_filings,
        "targetAnchors": target_anchors,
        "markdownReport": "\n".join(md)
    }
    
    with open("/workspace/output_results.json", "w") as f:
        json.dump(output_data, f, indent=2)

def jobTitle_format(title):
    return title.title()

if __name__ == "__main__":
    input_path = "/workspace/input_data.json"
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        sys.exit(1)
        
    with open(input_path, "r") as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"Error reading JSON: {e}")
            sys.exit(1)
            
    analyze_compensation(data)
    print("Salary analysis completed successfully inside sandbox.")
