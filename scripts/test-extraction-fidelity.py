#!/usr/bin/env python3
"""
Workers AI extraction fidelity test harness.

Captures a Greenhouse job posting once via Browser Rendering `/markdown`,
then sends the SAME prompt + JSON schema + markdown to a list of Workers AI
models through Cloudflare AI Gateway in OpenAI-compat mode (level playing
field) and scores each response against a hand-curated ground-truth JSON.

Scoring detects two failure modes:
  1. Missing schema elements (the model omitted a field or skipped bullets).
  2. Summarized text (a field is present but the bullet text was paraphrased
     / shortened instead of being copied verbatim).

Auth (resolved via the local `tokens` CLI):
  - CLOUDFLARE_ACCOUNT_ID
  - CLOUDFLARE_AI_GATEWAY_TOKEN     (workers-ai routes)
  - CLOUDFLARE_BROWSER_RENDER_TOKEN (browser rendering /markdown)
  - GEMINI_API_KEY                  (google-ai-studio routes — optional)

Usage:
  python3 scripts/test-extraction-fidelity.py
  python3 scripts/test-extraction-fidelity.py --only "@cf/openai/gpt-oss-120b"
  python3 scripts/test-extraction-fidelity.py --markdown-cache .cache/job.md
  python3 scripts/test-extraction-fidelity.py --dump-dir tmp/fidelity-runs
  python3 scripts/test-extraction-fidelity.py --html-report tmp/fidelity-report.html

  # A/B test single-blob vs DOM-scrape-then-classify (hybrid):
  python3 scripts/test-extraction-fidelity.py --mode both \\
    --only kimi gpt-oss --html-report tmp/fidelity-runs/report.html
"""

from __future__ import annotations

import argparse
import difflib
import html as html_lib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_JOB_URL = "https://job-boards.greenhouse.io/anthropic/jobs/5142374008"
DEFAULT_GATEWAY_ID = "job-hunt"

CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

DEFAULT_MODELS = [
    "@cf/openai/gpt-oss-120b",
    "@cf/moonshotai/kimi-k2.5",
    "@cf/moonshotai/kimi-k2.6",
    "@cf/meta/llama-4-scout-17b-16e-instruct",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "google-ai-studio/gemini-3.1-pro-preview",
]

# ---------------------------------------------------------------------------
# Auth helpers — pull values out of the local `tokens` CLI
# ---------------------------------------------------------------------------


def tokens_show(name: str) -> str:
    """Resolve a secret value via `tokens show <name> --value-only`."""
    try:
        out = subprocess.check_output(
            ["tokens", "show", name, "--value-only"],
            stderr=subprocess.PIPE,
            text=True,
        )
        return out.strip()
    except FileNotFoundError as e:
        raise SystemExit("`tokens` CLI not found in PATH") from e
    except subprocess.CalledProcessError as e:
        raise SystemExit(
            f"tokens show {name} failed: {e.stderr.strip() or e.returncode}"
        ) from e


# ---------------------------------------------------------------------------
# Prompt + JSON schema (mirrors src/backend/ai/agents/orchestrator/types.ts)
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM_PROMPT = """You are a precision job posting parser. Extract the MAXIMUM structured data from the supplied text into the JSON schema.

<STRICT_VERBATIM_EXTRACTION>
CRITICAL REQUIREMENT: For ALL text fields — especially array fields (responsibilities, qualifications, skills, benefits, education) — you MUST extract each item VERBATIM.
- Copy the EXACT full text from the posting, character-for-character.
- Do NOT summarize, shorten, paraphrase, truncate, or rephrase ANYTHING.
- Every single word must perfectly match the original text.
- If an item spans multiple sentences in a single bullet, keep all sentences together as one entry.
- If a bullet is 200+ words long, include ALL of it. Length is not a reason to shorten.
- Do not lose any details, no matter how long or verbose a bullet point is.
- When in doubt, include MORE text rather than less.
</STRICT_VERBATIM_EXTRACTION>

<CAPTURE_ALL_CONTENT>
CRITICAL: Do NOT discard or exclude ANY content from the job posting. Every word must be captured in one of the schema fields:
- Company introductions, "About Us", or mission statements → put in "aboutCompany" field
- ALL free-text narrative paragraphs that appear BEFORE bullet lists → put in "aboutRoleNarrative" field. Concatenate ALL such paragraphs with newlines.
- Bullet items for duties/responsibilities → "responsibilities" array
- Bullet items for required/must-have qualifications → "requiredQualifications" array
- Bullet items for preferred/nice-to-have qualifications → "preferredQualifications" array
- Required skills → "requiredSkills" array
- Preferred skills → "preferredSkills" array
- Education → "educationRequirements" array
- Benefits/perks → "benefits" array
- EEO statements, disclaimers, application instructions, form fields, and any other content that does not fit the above → put in "otherContent" field
- NOTHING should be excluded. If text exists in the posting, it MUST appear in exactly one field.
</CAPTURE_ALL_CONTENT>

Guidelines:
- Extract every field present in the posting. Leave optional fields as null only when the information is genuinely absent.
- Distinguish between REQUIRED qualifications (must-have, minimum) and PREFERRED qualifications (nice-to-have, ideal, strong).
- For salary, extract numeric values without currency symbols. Detect the currency code (USD, EUR, GBP, etc.).
- For yearsExperienceMin/Max, extract numeric values from phrases like '5+ years' (min=5) or '3-5 years' (min=3, max=5).
- Return JSON only — no markdown, no commentary."""


# JSON Schema mirroring JobPostingExtractionSchema (orchestrator/types.ts).
# Compatible with OpenAI-style `response_format: { type: "json_schema", strict: true }`.
# Strict mode requires:
#   - every property listed in `required`
#   - `additionalProperties: false`
#   - nullable fields expressed as `["string", "null"]` unions
EXTRACTION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "companyName": {"type": ["string", "null"]},
        "jobTitle": {"type": ["string", "null"]},
        "jobUrl": {"type": ["string", "null"]},
        "salaryMin": {"type": ["number", "null"]},
        "salaryMax": {"type": ["number", "null"]},
        "salaryCurrency": {"type": ["string", "null"]},
        "responsibilities": {
            "type": ["array", "null"],
            "items": {"type": "string"},
            "description": "VERBATIM responsibility bullets — do NOT summarize.",
        },
        "requiredQualifications": {
            "type": ["array", "null"],
            "items": {"type": "string"},
            "description": "VERBATIM required/must-have qualifications.",
        },
        "preferredQualifications": {
            "type": ["array", "null"],
            "items": {"type": "string"},
            "description": "VERBATIM preferred/nice-to-have qualifications.",
        },
        "requiredSkills": {"type": ["array", "null"], "items": {"type": "string"}},
        "preferredSkills": {"type": ["array", "null"], "items": {"type": "string"}},
        "location": {"type": ["string", "null"]},
        "workplaceType": {
            "type": ["string", "null"],
            "description": "One of: remote | hybrid | onsite. Null if unclear.",
        },
        "rtoPolicy": {"type": ["string", "null"]},
        "yearsExperienceMin": {"type": ["number", "null"]},
        "yearsExperienceMax": {"type": ["number", "null"]},
        "educationRequirements": {"type": ["array", "null"], "items": {"type": "string"}},
        "department": {"type": ["string", "null"]},
        "reportingTo": {"type": ["string", "null"]},
        "travelRequirements": {"type": ["string", "null"]},
        "securityClearance": {"type": ["string", "null"]},
        "visaSponsorship": {"type": ["string", "null"]},
        "benefits": {"type": ["array", "null"], "items": {"type": "string"}},
        "additionalNotes": {"type": ["string", "null"]},
        "aboutCompany": {
            "type": ["string", "null"],
            "description": "VERBATIM company intro / 'About Us' section.",
        },
        "aboutRoleNarrative": {
            "type": ["string", "null"],
            "description": "VERBATIM free-text paragraphs preceding any bullet list.",
        },
        "otherContent": {"type": ["string", "null"]},
    },
}
# Strict mode: all keys must appear in `required`. We achieve "optional"
# semantics via the `["type", "null"]` unions above.
EXTRACTION_JSON_SCHEMA["required"] = list(EXTRACTION_JSON_SCHEMA["properties"].keys())


# ---------------------------------------------------------------------------
# Hybrid mode — DOM scrape + AI-classify everything
# ---------------------------------------------------------------------------
#
# Architecture (zero hardcoded heading patterns — Worker AI labels everything):
#   1. Browser Rendering /scrape pulls (h1-h3, ul>li, ol>li, p) elements with
#      vertical positions — deterministic DOM access, no model involvement.
#   2. <li> elements get grouped under their nearest preceding <hN> by `top`.
#   3. AI Pass H: model labels each heading by index into a JobPosting bullet
#      field (responsibilities, requiredQualifications, etc.) or `skip`.
#      Replaces brittle per-company regex patterns.
#   4. AI Pass A: model labels each <p> by index into a narrative bucket
#      (aboutCompany, aboutRoleNarrative, rtoPolicy, visaSponsorship,
#      otherContent, skip). Code-side verbatim concatenation by index — model
#      never reproduces or rewrites the paragraph text.
#   5. AI Pass B: model extracts 12 scalar fact fields (companyName, salary*,
#      location, yearsExperience*, etc.) from the markdown.
#   6. Merge: bullets (DOM, attributed by Pass H) + narrative (Pass A indices,
#      verbatim concat) + facts (Pass B). All bullet text is provably verbatim
#      from the DOM; no regex maintenance is required as new postings appear.


# ── Pass H: classify headings dynamically (replaces deterministic regex) ──
#
# Each posting structures content under different headings — Anthropic uses
# "You may be a good fit if you", another company uses "Minimum Qualifications",
# another might use "Who you are". Hardcoding regex patterns is brittle and
# drifts as new postings come in. Worker AI labels each heading by index based
# on the heading text alone (no per-company patterns required).
#
# Pass H is restricted to BULLET-SECTION fields plus `skip`. Narrative section
# headings (e.g. "About Anthropic", "Logistics") get labeled `skip` here —
# their underlying <p> elements are picked up by Pass A independently. This
# keeps the two classifiers focused and avoids double-attribution.
PASS_H_HEADING_SYSTEM_PROMPT = """You are a precision document classifier. Below are NUMBERED heading texts from a job posting. Each heading typically introduces a SECTION of content. Assign each heading to exactly one schema field that describes the BULLET LIST appearing under that heading. DO NOT generate, summarize, or rewrite any heading text — your only job is to label headings by index.

Schema fields (pick the closest match — these correspond to JobPosting bullet arrays):

- responsibilities: duties, what you'll do, key tasks, day-to-day activities, "the role", "in this role", "your role"
- requiredQualifications: must-have / minimum qualifications, "you may be a good fit if", "what we're looking for", "who you are", "you'll have", "requirements"
- preferredQualifications: nice-to-have, bonus, "strong candidates also have", "additionally", "ideal but not required", "it's a plus if"
- requiredSkills: required technical skills (use ONLY when explicitly distinguished from broader qualifications)
- preferredSkills: preferred technical skills (use ONLY when explicitly distinguished)
- educationRequirements: degrees, education, academic background
- benefits: perks, benefits, "what we offer", "why join us", compensation packages, "come work with us" (when followed by perk bullets)

Skip:
- skip: heading is a NARRATIVE section header (e.g. "About <Company>", "About the role", "Logistics", "Visa sponsorship", "Mission") — its content is paragraphs, not bullets, and Pass A will handle the prose. Also skip page chrome (nav labels, button text, footer fragments).

Each heading is shown along with a preview of the first item that follows it, to help disambiguate. Use the preview as a hint only — the heading text is the primary signal.

Return JSON only: { "assignments": [{ "idx": 0, "field": "responsibilities" }, ...] }.
Every input heading must appear exactly once in `assignments`."""

PASS_H_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "assignments": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "idx": {"type": "integer"},
                    "field": {
                        "type": "string",
                        "enum": [
                            "responsibilities",
                            "requiredQualifications",
                            "preferredQualifications",
                            "requiredSkills",
                            "preferredSkills",
                            "educationRequirements",
                            "benefits",
                            "skip",
                        ],
                    },
                },
                "required": ["idx", "field"],
            },
        },
    },
    "required": ["assignments"],
}


# ── Pass A: classify narrative paragraphs ─────────────────────────────────
PASS_A_NARRATIVE_SYSTEM_PROMPT = """You are a precision document classifier. Below are NUMBERED paragraph texts from a job posting. Assign each paragraph to exactly one schema field. DO NOT generate, summarize, or rewrite any paragraph text — your only job is to label them by index.

Schema fields:
- aboutCompany: company mission / "About Us" / what the company does. Usually appears at the very top of the posting.
- aboutRoleNarrative: prose describing the role, the team, what's non-negotiable, what success looks like — anything narrative about the role itself or the team it sits on.
- rtoPolicy: return-to-office, in-office days, location/schedule policy, hybrid work expectations.
- visaSponsorship: visa, immigration, sponsorship language.
- otherContent: legal/EEO statements, diversity statements, "How we're different", "Come work with us", "Your safety matters" notices, application logistics, hiring process, compensation philosophy prose, and ANYTHING ELSE that doesn't fit a more specific bucket.
- skip: ONLY pure page chrome — nav labels, button text ("Apply Now"), footer copyright lines, fragments under 30 chars of meaningful prose. When in doubt between `otherContent` and `skip`, pick `otherContent` — we never want to leave real body content on the floor.

CAPTURE EVERYTHING. Default behavior: if the paragraph contains real prose, it gets a bucket. Only use `skip` for genuine non-content fragments. Five buckets cover the entire space — pick the best fit.

Return JSON only: { "assignments": [{ "idx": 0, "field": "aboutCompany" }, ...] }.
Every input paragraph must appear exactly once in `assignments`."""

PASS_A_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "assignments": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "idx": {"type": "integer"},
                    "field": {
                        "type": "string",
                        "enum": [
                            "aboutCompany",
                            "aboutRoleNarrative",
                            "rtoPolicy",
                            "visaSponsorship",
                            "otherContent",
                            "skip",
                        ],
                    },
                },
                "required": ["idx", "field"],
            },
        },
    },
    "required": ["assignments"],
}

# ── Pass B: extract facts (small schema, no bullets) ──────────────────────
PASS_B_FACTS_SYSTEM_PROMPT = """Extract these 12 fact fields from the supplied job posting markdown. Use null for any field that is genuinely absent. Return JSON only — no commentary, no markdown fences.

- companyName: the hiring company name (e.g. "Anthropic")
- jobTitle: the role title (verbatim, e.g. "Legal Operations Specialist, Tooling & Enablement")
- jobUrl: the canonical job URL if present in the page, else null
- salaryMin / salaryMax: numeric only, no currency symbols. From phrases like "$170,000 - $220,000" → 170000, 220000
- salaryCurrency: ISO 4217 code (USD, EUR, GBP, CAD, etc.)
- location: a single string, e.g. "San Francisco, CA"
- workplaceType: exactly one of: remote | hybrid | onsite (lowercase, no other values)
- yearsExperienceMin / yearsExperienceMax: numeric, derived from phrases like "5+ years" → min=5; "3-5 years" → min=3, max=5; "4-7 years" → min=4, max=7
- department: the team/department if stated, else null
- reportingTo: who the role reports to if stated, else null"""

PASS_B_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "companyName": {"type": ["string", "null"]},
        "jobTitle": {"type": ["string", "null"]},
        "jobUrl": {"type": ["string", "null"]},
        "salaryMin": {"type": ["number", "null"]},
        "salaryMax": {"type": ["number", "null"]},
        "salaryCurrency": {"type": ["string", "null"]},
        "location": {"type": ["string", "null"]},
        "workplaceType": {"type": ["string", "null"]},
        "yearsExperienceMin": {"type": ["number", "null"]},
        "yearsExperienceMax": {"type": ["number", "null"]},
        "department": {"type": ["string", "null"]},
        "reportingTo": {"type": ["string", "null"]},
    },
}
PASS_B_SCHEMA["required"] = list(PASS_B_SCHEMA["properties"].keys())


# ---------------------------------------------------------------------------
# Ground truth — verbatim text from the Anthropic posting at DEFAULT_JOB_URL
# ---------------------------------------------------------------------------

EXPECTED: dict[str, Any] = {
    "companyName": "Anthropic",
    "jobTitle": "Legal Operations Specialist, Tooling & Enablement",
    "location": "San Francisco, CA",
    "workplaceType": "hybrid",
    "salaryMin": 170000,
    "salaryMax": 220000,
    "salaryCurrency": "USD",
    "yearsExperienceMin": 4,
    "yearsExperienceMax": 7,
    "responsibilities": [
        "Coordinate the legal team's AI tooling roadmap — maintaining visibility into what's in progress, tracking timelines across multiple concurrent workstreams, and communicating status to stakeholders",
        "Triage incoming tooling requests, assess complexity and scope, and route work appropriately — handling straightforward builds yourself and flagging those that need deeper technical review",
        "Build no-code and low-code solutions end-to-end: Claude.ai Projects, AppSheet apps, Slack workflows, and similar tools that solve real pain points without requiring deployment infrastructure",
        "Partner with the team on AI adoption efforts — contributing to training materials, documentation, and user guides as new tools ship",
        "Support the legal team onboarding process and maintain onboarding content as our tooling evolves",
        "Track adoption signals and surface patterns: what's being used, what isn't, and what that tells us about where to focus",
    ],
    "requiredQualifications": [
        "Have at least 4–7 years of experience in legal operations, legal technology, or a technical operations role",
        "Are comfortable keeping multiple projects organized and visible simultaneously — you can track dependencies, flag risks early, and keep stakeholders informed without being asked",
        "Are comfortable building lightweight technical solutions — Claude Projects, no-code apps, Slack automations — and know how to scope what's appropriate for DIY versus what needs engineering input",
        "Have worked alongside teams building and shipping tools, and understand what it takes to get a new workflow actually adopted",
        "Lead with curiosity — you ask good questions, want to understand how things work, and are honest when you don't know something",
        "Bring empathy to the work: you understand that change is hard, especially for busy lawyers, and you meet people where they are rather than where you wish they were",
        "Are collaborative and low-ego — you'll flex into adjacent work as the team grows and don't protect scope at the expense of outcomes",
        "Have enough of a sense of humor to keep the work enjoyable, even when it's complex",
    ],
    "preferredQualifications": [
        "Experience in legal operations at a law firm, in-house legal department, or legal technology company",
        "Hands-on experience with Claude, Claude Code, or MCP integrations",
        "A track record of building or contributing to training programs or onboarding processes in a technical environment",
        "Familiarity with change management in professional services environments, where skepticism about new tools is real and earned",
        "Experience with tools like AppSheet, Tines, Zapier, or similar no-code/low-code platforms",
    ],
    "rtoPolicy": "For this role, we expect all staff to be able to work from our San Francisco office at least 3 days a week, though we encourage you to apply even if you might need some flexibility for an interim period of time.",
    "visaSponsorship": "We do sponsor visas! However, we aren't able to successfully sponsor visas for every role and every candidate. But if we make you an offer, we will make every reasonable effort to get you a visa, and we retain an immigration lawyer to help with this.",
    "aboutCompany": (
        "Anthropic's mission is to create reliable, interpretable, and steerable AI systems. "
        "We want AI to be safe and beneficial for our users and for society as a whole. Our team is "
        "a quickly growing group of committed researchers, engineers, policy experts, and business "
        "leaders working together to build beneficial AI systems."
    ),
}


# ---------------------------------------------------------------------------
# Browser Rendering /markdown
# ---------------------------------------------------------------------------


def fetch_markdown(account_id: str, br_token: str, url: str, *, timeout: int = 60) -> str:
    """POST to Browser Rendering /markdown and return the markdown body."""
    endpoint = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/browser-rendering/markdown"
    )
    body = json.dumps({"url": url}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {br_token}",
            "Content-Type": "application/json",
            "User-Agent": CHROME_UA,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("success"):
        raise RuntimeError(f"Browser Rendering /markdown failed: {payload}")
    md = payload.get("result")
    if not isinstance(md, str) or len(md) < 200:
        raise RuntimeError(f"Suspiciously short markdown: {len(md or '')} chars")
    return md


# ---------------------------------------------------------------------------
# Browser Rendering /scrape — DOM elements with vertical positions
# ---------------------------------------------------------------------------


def fetch_dom_groups(
    account_id: str,
    br_token: str,
    url: str,
    *,
    selectors: Optional[list[str]] = None,
    timeout: int = 60,
) -> list[dict[str, Any]]:
    """POST to Browser Rendering /scrape with a list of CSS selectors.

    Returns the raw `result` array, one entry per selector group, each
    containing { selector, results: [{ text, html, top, left, ... }] }.
    """
    selectors = selectors or ["h1, h2, h3", "ul > li", "ol > li", "p"]
    endpoint = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/browser-rendering/scrape"
    )
    body = json.dumps(
        {"url": url, "elements": [{"selector": s} for s in selectors]}
    ).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {br_token}",
            "Content-Type": "application/json",
            "User-Agent": CHROME_UA,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("success"):
        raise RuntimeError(f"Browser Rendering /scrape failed: {payload}")
    result = payload.get("result")
    if not isinstance(result, list):
        raise RuntimeError(f"Unexpected /scrape shape: {type(result).__name__}")
    return result


def parse_dom_groups(dom_result: list[dict[str, Any]]) -> dict[str, Any]:
    """Pure DOM grouping (no classification — that happens later via Pass H/A).

    Operations:
      - Sort headings, list items, and paragraphs by vertical pixel position.
      - Group each <li> under its nearest preceding heading.
      - Filter <p> elements to drop short fragments, page-chrome dupes, and
        paragraphs that already appear inside a list item.

    Returns: {
      heading_groups: [ { idx, heading, top, items: [...] }, ... ]
                      — every heading, with grouped <li>s (items can be empty
                        for narrative-only sections; we still emit the entry
                        so Pass H can label it `skip`).
      paragraphs:     [ { text, top }, ... ]  — filtered, sorted top-down.
      stats:          { headings, list_items, paragraphs_raw, paragraphs_filtered }
    }
    """

    def pick_group(predicate) -> list[dict[str, Any]]:
        for g in dom_result:
            if predicate(g.get("selector", "")):
                return [r for r in g.get("results", []) if r.get("text", "").strip()]
        return []

    headings = pick_group(lambda s: any(h in s for h in ("h1", "h2", "h3")))
    list_items = pick_group(lambda s: "li" in s)
    raw_paragraphs = pick_group(lambda s: s.strip() == "p")

    headings.sort(key=lambda h: h.get("top", 0))
    list_items.sort(key=lambda li: li.get("top", 0))
    raw_paragraphs.sort(key=lambda p: p.get("top", 0))

    # Group <li>s under their nearest preceding heading.
    heading_groups: list[dict[str, Any]] = [
        {
            "idx": i,
            "heading": h["text"].strip(),
            "top": h.get("top", 0),
            "items": [],
        }
        for i, h in enumerate(headings)
    ]
    for li in list_items:
        li_top = li.get("top", 0)
        best = None
        for g in heading_groups:
            if g["top"] <= li_top and (best is None or g["top"] > best["top"]):
                best = g
        if best is not None:
            best["items"].append(li["text"].strip())

    # Filter paragraphs: drop short fragments, dedupe, drop entries already
    # represented in <li>s (Greenhouse re-renders bullet text as <p> in the
    # plaintext fallback path, which would otherwise double-count).
    li_texts_lc = {li["text"].strip().lower() for li in list_items}
    heading_texts_lc = {h["text"].strip().lower() for h in headings}

    seen: set[str] = set()
    filtered_paragraphs: list[dict[str, Any]] = []
    for p in raw_paragraphs:
        text = p.get("text", "").strip()
        if len(text) < 40:
            continue
        ptext_lc = text.lower()
        if ptext_lc in heading_texts_lc:
            continue
        if any(
            (ptext_lc in lt) or (lt and lt in ptext_lc and len(lt) > 30)
            for lt in li_texts_lc
        ):
            continue
        if ptext_lc in seen:
            continue
        seen.add(ptext_lc)
        filtered_paragraphs.append({"text": text, "top": p.get("top", 0)})

    return {
        "heading_groups": heading_groups,
        "paragraphs": filtered_paragraphs,
        "stats": {
            "headings": len(headings),
            "list_items": len(list_items),
            "paragraphs_raw": len(raw_paragraphs),
            "paragraphs_filtered": len(filtered_paragraphs),
        },
    }


# ---------------------------------------------------------------------------
# AI Gateway compat caller
# ---------------------------------------------------------------------------

JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def strip_fences(s: str) -> str:
    return JSON_FENCE_RE.sub("", s.strip())


@dataclass
class ModelRun:
    model: str
    ok: bool
    elapsed_ms: int
    raw: dict[str, Any] | None = None
    parsed: dict[str, Any] | None = None
    error: str | None = None
    finish_reason: str | None = None
    usage: dict[str, Any] | None = None


def call_compat(
    *,
    account_id: str,
    gateway_id: str,
    cf_token: str,
    gemini_key: Optional[str],
    model: str,
    system_prompt: str,
    user_content: str,
    json_schema: dict[str, Any],
    timeout: int = 240,
) -> ModelRun:
    """Call the AI Gateway OpenAI-compat /chat/completions endpoint."""
    base = f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat"
    endpoint = f"{base}/chat/completions"

    # Pick the right Authorization based on provider prefix.
    if model.startswith("workers-ai/"):
        auth_token = cf_token
    elif model.startswith("google-ai-studio/"):
        auth_token = gemini_key or cf_token
    else:
        auth_token = cf_token

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        # Required when the AI Gateway itself is auth-protected (BYOK mode).
        "cf-aig-authorization": f"Bearer {cf_token}",
        "User-Agent": CHROME_UA,
    }

    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0,
        "max_tokens": 8192,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "JobPostingExtraction",
                # `strict: true` forces the model to honor exact field names,
                # required keys, and additionalProperties:false. Mirrors what
                # `generateStructuredAnalysis` sends in src/backend/ai/providers/.
                "strict": True,
                "schema": json_schema,
            },
        },
        # OpenAI-compat reasoning hint for gpt-oss-120b — also accepted by
        # the gateway and ignored by other providers.
        "reasoning_effort": "low",
    }

    # ── Disable model "thinking" / chain-of-thought reasoning ─────────────
    # Without this, gpt-oss-120b / kimi-k2.5 / kimi-k2.6 dump several thousand
    # reasoning tokens into `reasoning_content` and hit the max_tokens cap
    # before any JSON `content` is emitted (finish_reason = "length",
    # content = ""). Mirrors generateStructuredAnalysis().
    #
    # `chat_template_kwargs` is a Workers AI-specific extension — Google AI
    # Studio, OpenAI, etc. reject the field with HTTP 400. Gate it.
    if model.startswith("workers-ai/"):
        payload["chat_template_kwargs"] = {"enable_thinking": False}

    body = json.dumps(payload).encode("utf-8")

    started = time.time()
    last_err: Optional[str] = None
    raw: Optional[dict[str, Any]] = None
    # One transparent retry for transient 5xx (gemini preview loves to 503).
    for attempt in range(2):
        try:
            req = urllib.request.Request(endpoint, data=body, method="POST", headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw_body = resp.read().decode("utf-8")
            raw = json.loads(raw_body)
            last_err = None
            break
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8")
            except Exception:
                pass
            last_err = f"HTTP {e.code}: {err_body[:600]}"
            if e.code in (502, 503, 504, 529) and attempt == 0:
                time.sleep(2.5)
                continue
            break
        except Exception as e:  # noqa: BLE001
            last_err = f"{type(e).__name__}: {e}"
            break
    elapsed_ms = int((time.time() - started) * 1000)
    if raw is None:
        return ModelRun(model=model, ok=False, elapsed_ms=elapsed_ms, error=last_err)

    # Extract OpenAI-style choices[0].message.content
    try:
        choice = raw["choices"][0]
        message = choice.get("message", {})
        content = message.get("content")
        finish_reason = choice.get("finish_reason")
        usage = raw.get("usage")
    except (KeyError, IndexError, TypeError) as e:
        return ModelRun(
            model=model,
            ok=False,
            elapsed_ms=elapsed_ms,
            raw=raw,
            error=f"Unexpected response shape: {e}",
        )

    # Gateway sometimes pre-parses JSON and returns `content` as a dict —
    # llama-4-scout and llama-3.3-70b-instruct-fp8-fast both do this when
    # response_format.json_schema is honored server-side.
    if isinstance(content, dict):
        parsed: Any = content
    elif isinstance(content, list):
        # OpenAI-style content blocks: [{ "type": "text", "text": "..." }, ...]
        text_parts = [
            blk.get("text", "")
            for blk in content
            if isinstance(blk, dict) and blk.get("type") in ("text", "output_text")
        ]
        joined = "".join(text_parts).strip()
        if not joined:
            return ModelRun(
                model=model,
                ok=False,
                elapsed_ms=elapsed_ms,
                raw=raw,
                finish_reason=finish_reason,
                usage=usage,
                error="No text blocks in content list",
            )
        try:
            parsed = json.loads(strip_fences(joined))
        except json.JSONDecodeError as e:
            return ModelRun(
                model=model,
                ok=False,
                elapsed_ms=elapsed_ms,
                raw=raw,
                finish_reason=finish_reason,
                usage=usage,
                error=f"JSON parse error: {e}. First 400 chars: {joined[:400]!r}",
            )
    elif isinstance(content, str) and content.strip():
        try:
            parsed = json.loads(strip_fences(content))
        except json.JSONDecodeError as e:
            return ModelRun(
                model=model,
                ok=False,
                elapsed_ms=elapsed_ms,
                raw=raw,
                finish_reason=finish_reason,
                usage=usage,
                error=f"JSON parse error: {e}. First 400 chars: {content[:400]!r}",
            )
    else:
        return ModelRun(
            model=model,
            ok=False,
            elapsed_ms=elapsed_ms,
            raw=raw,
            finish_reason=finish_reason,
            usage=usage,
            error=f"Empty/non-string content (finish_reason={finish_reason})",
        )

    if not isinstance(parsed, dict):
        return ModelRun(
            model=model,
            ok=False,
            elapsed_ms=elapsed_ms,
            raw=raw,
            finish_reason=finish_reason,
            usage=usage,
            error=f"Parsed content is {type(parsed).__name__}, expected object",
        )

    return ModelRun(
        model=model,
        ok=True,
        elapsed_ms=elapsed_ms,
        raw=raw,
        parsed=parsed,
        finish_reason=finish_reason,
        usage=usage,
    )


# ---------------------------------------------------------------------------
# Hybrid extraction orchestrator
# ---------------------------------------------------------------------------


def _format_paragraphs_for_pass_a(paragraphs: list[dict[str, Any]]) -> str:
    """Render the numbered paragraph list that Pass A consumes.

    Bounded to 4000 chars/paragraph so a runaway page can't blow the prompt.
    """
    parts: list[str] = []
    for i, p in enumerate(paragraphs):
        text = p["text"]
        if len(text) > 4000:
            text = text[:4000] + "…"
        parts.append(f"[{i}]\n{text}")
    return "\n\n---\n\n".join(parts)


def _format_headings_for_pass_h(heading_groups: list[dict[str, Any]]) -> str:
    """Render the numbered heading list that Pass H consumes.

    For each heading we include a brief preview of the first <li> beneath it
    (truncated to 140 chars) so the model can disambiguate genuinely vague
    headings like "Logistics" or "Compensation". The preview is a hint; the
    heading text is the primary signal.
    """
    parts: list[str] = []
    for i, g in enumerate(heading_groups):
        line = f"[{i}] {g['heading']}"
        items = g.get("items") or []
        if items:
            preview = items[0]
            if len(preview) > 140:
                preview = preview[:140] + "…"
            line += f"\n     ↳ first item: {preview}"
            line += f"\n     ↳ ({len(items)} list item{'s' if len(items) != 1 else ''} total)"
        else:
            line += "\n     ↳ (no <li> items — narrative section, label `skip`)"
        parts.append(line)
    return "\n".join(parts)


HYBRID_BULLET_FIELDS = (
    "responsibilities",
    "requiredQualifications",
    "preferredQualifications",
    "requiredSkills",
    "preferredSkills",
    "educationRequirements",
    "benefits",
)
HYBRID_NARRATIVE_FIELDS = (
    "aboutCompany",
    "aboutRoleNarrative",
    "rtoPolicy",
    "visaSponsorship",
    "otherContent",
)


def run_hybrid_extraction(
    *,
    account_id: str,
    gateway_id: str,
    cf_token: str,
    gemini_key: Optional[str],
    model: str,
    markdown: str,
    dom_groups: list[dict[str, Any]],
    timeout: int = 240,
) -> ModelRun:
    """Hybrid extraction — three independent AI passes plus DOM bullet merge.

       Pass H — model classifies each <hN> heading by index into a bullet
                field (or `skip` if it's a narrative-section header).
       Pass A — model classifies each <p> paragraph by index into a
                narrative bucket (aboutCompany, rtoPolicy, etc.).
       Pass B — model extracts 12 scalar fact fields from the markdown.

       Merge:
         - Bullets:    Pass H label + grouped <li> items (verbatim DOM text).
         - Narrative:  Pass A label + paragraph[idx] (verbatim, code-side join).
         - Facts:      Pass B output verbatim.

       The model never reproduces or rewrites bullet/paragraph text — only
       classifies indices. Bullets are provably verbatim from the DOM.
    """
    started = time.time()
    parsed_dom = parse_dom_groups(dom_groups)
    heading_groups = parsed_dom["heading_groups"]
    paragraphs = parsed_dom["paragraphs"]

    pass_h_run: Optional[ModelRun] = None
    pass_a_run: Optional[ModelRun] = None
    pass_b_run: Optional[ModelRun] = None

    # ── Pass H: classify headings dynamically ─────────────────────────────
    if heading_groups:
        pass_h_user = _format_headings_for_pass_h(heading_groups)
        pass_h_run = call_compat(
            account_id=account_id,
            gateway_id=gateway_id,
            cf_token=cf_token,
            gemini_key=gemini_key,
            model=model,
            system_prompt=PASS_H_HEADING_SYSTEM_PROMPT,
            user_content=pass_h_user,
            json_schema=PASS_H_SCHEMA,
            timeout=timeout,
        )
        if not pass_h_run.ok:
            return ModelRun(
                model=model,
                ok=False,
                elapsed_ms=int((time.time() - started) * 1000),
                raw={"pass_h_raw": pass_h_run.raw},
                error=f"Hybrid Pass H (heading classify) failed: {pass_h_run.error}",
            )

    # ── Pass A: classify narrative paragraphs ─────────────────────────────
    if paragraphs:
        pass_a_user = _format_paragraphs_for_pass_a(paragraphs)
        pass_a_run = call_compat(
            account_id=account_id,
            gateway_id=gateway_id,
            cf_token=cf_token,
            gemini_key=gemini_key,
            model=model,
            system_prompt=PASS_A_NARRATIVE_SYSTEM_PROMPT,
            user_content=pass_a_user,
            json_schema=PASS_A_SCHEMA,
            timeout=timeout,
        )
        if not pass_a_run.ok:
            return ModelRun(
                model=model,
                ok=False,
                elapsed_ms=int((time.time() - started) * 1000),
                raw={
                    "pass_h_raw": pass_h_run.raw if pass_h_run else None,
                    "pass_a_raw": pass_a_run.raw,
                },
                error=f"Hybrid Pass A (narrative classify) failed: {pass_a_run.error}",
            )

    # ── Pass B: extract facts ─────────────────────────────────────────────
    pass_b_run = call_compat(
        account_id=account_id,
        gateway_id=gateway_id,
        cf_token=cf_token,
        gemini_key=gemini_key,
        model=model,
        system_prompt=PASS_B_FACTS_SYSTEM_PROMPT,
        user_content=markdown,
        json_schema=PASS_B_SCHEMA,
        timeout=timeout,
    )
    if not pass_b_run.ok:
        return ModelRun(
            model=model,
            ok=False,
            elapsed_ms=int((time.time() - started) * 1000),
            raw={
                "pass_h_raw": pass_h_run.raw if pass_h_run else None,
                "pass_a_raw": pass_a_run.raw if pass_a_run else None,
                "pass_b_raw": pass_b_run.raw,
            },
            error=f"Hybrid Pass B (facts) failed: {pass_b_run.error}",
        )

    # ── Merge ────────────────────────────────────────────────────────────
    merged: dict[str, Any] = {}

    # Facts (Pass B).
    if pass_b_run.parsed:
        for k, v in pass_b_run.parsed.items():
            merged[k] = v

    # Bullets (DOM verbatim, attributed to fields by Pass H).
    heading_assignments: dict[int, str] = {}
    if pass_h_run and pass_h_run.parsed:
        for a in pass_h_run.parsed.get("assignments") or []:
            idx = a.get("idx")
            field = a.get("field")
            if isinstance(idx, int) and 0 <= idx < len(heading_groups) and field:
                heading_assignments[idx] = field

    bullets_by_field: dict[str, list[str]] = {}
    classified_for_telemetry: list[dict[str, Any]] = []
    skipped_for_telemetry: list[dict[str, Any]] = []
    for g in heading_groups:
        idx = g["idx"]
        field = heading_assignments.get(idx)
        record = {
            "idx": idx,
            "heading": g["heading"],
            "field": field,
            "items": g["items"],
        }
        if field and field in HYBRID_BULLET_FIELDS and g["items"]:
            bullets_by_field.setdefault(field, []).extend(g["items"])
            classified_for_telemetry.append(record)
        else:
            skipped_for_telemetry.append(record)

    for field in HYBRID_BULLET_FIELDS:
        items = bullets_by_field.get(field)
        merged[field] = items if items else None

    # Narrative (Pass A indices → code-side concatenation, never re-generated).
    narrative_buckets: dict[str, list[str]] = {}
    paragraph_assignments_for_telemetry: list[dict[str, Any]] = []
    if pass_a_run and pass_a_run.parsed:
        seen_idx: set[int] = set()
        for a in pass_a_run.parsed.get("assignments") or []:
            idx = a.get("idx")
            field = a.get("field")
            if not isinstance(idx, int):
                continue
            if idx < 0 or idx >= len(paragraphs):
                continue
            if idx in seen_idx:
                continue
            seen_idx.add(idx)
            paragraph_assignments_for_telemetry.append(
                {"idx": idx, "field": field, "preview": paragraphs[idx]["text"][:140]}
            )
            if field and field != "skip" and field in HYBRID_NARRATIVE_FIELDS:
                narrative_buckets.setdefault(field, []).append(paragraphs[idx]["text"])

    for field in HYBRID_NARRATIVE_FIELDS:
        parts = narrative_buckets.get(field)
        merged[field] = "\n\n".join(parts) if parts else None

    aggregate_usage = {
        "pass_h_completion_tokens": (pass_h_run.usage or {}).get("completion_tokens")
        if pass_h_run and pass_h_run.usage
        else None,
        "pass_a_completion_tokens": (pass_a_run.usage or {}).get("completion_tokens")
        if pass_a_run and pass_a_run.usage
        else None,
        "pass_b_completion_tokens": (pass_b_run.usage or {}).get("completion_tokens")
        if pass_b_run.usage
        else None,
        "dom_headings": parsed_dom["stats"]["headings"],
        "dom_list_items": parsed_dom["stats"]["list_items"],
        "paragraphs_filtered": parsed_dom["stats"]["paragraphs_filtered"],
        "bullet_groups_classified": len(classified_for_telemetry),
        "bullet_groups_skipped": len(skipped_for_telemetry),
    }

    return ModelRun(
        model=model,
        ok=True,
        elapsed_ms=int((time.time() - started) * 1000),
        raw={
            "pass_h_raw": pass_h_run.raw if pass_h_run else None,
            "pass_a_raw": pass_a_run.raw if pass_a_run else None,
            "pass_b_raw": pass_b_run.raw,
            "heading_groups_classified": classified_for_telemetry,
            "heading_groups_skipped": skipped_for_telemetry,
            "paragraph_assignments": paragraph_assignments_for_telemetry,
        },
        parsed=merged,
        finish_reason="hybrid",
        usage=aggregate_usage,
    )


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

ARRAY_FIELDS = (
    "responsibilities",
    "requiredQualifications",
    "preferredQualifications",
    "requiredSkills",
    "preferredSkills",
    "educationRequirements",
    "benefits",
)
STRING_FIELDS_VERBATIM = ("aboutCompany", "aboutRoleNarrative", "rtoPolicy", "visaSponsorship")
STRING_FIELDS_FACT = (
    "companyName",
    "jobTitle",
    "location",
    "workplaceType",
    "salaryCurrency",
)
NUMERIC_FIELDS = ("salaryMin", "salaryMax", "yearsExperienceMin", "yearsExperienceMax")


def normalize(s: str) -> str:
    """Lowercase + collapse whitespace + strip punctuation noise."""
    s = s.lower()
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, normalize(a), normalize(b)).ratio()


@dataclass
class ItemScore:
    expected: str
    best_match: str
    ratio: float
    verdict: str  # "verbatim" | "summarized" | "missing"


@dataclass
class ArrayFieldScore:
    field: str
    expected_count: int
    actual_count: int
    items: list[ItemScore] = field(default_factory=list)
    avg_ratio: float = 0.0
    verbatim: int = 0
    summarized: int = 0
    missing: int = 0

    @property
    def percent_verbatim(self) -> float:
        return (self.verbatim / self.expected_count * 100) if self.expected_count else 0.0


@dataclass
class FidelityReport:
    model: str
    elapsed_ms: int
    ok: bool
    mode: str = "single"
    error: str | None = None
    presence: dict[str, bool] = field(default_factory=dict)
    array_scores: list[ArrayFieldScore] = field(default_factory=list)
    string_scores: dict[str, dict[str, Any]] = field(default_factory=dict)
    numeric_match: dict[str, bool] = field(default_factory=dict)
    overall_score: float = 0.0
    finish_reason: str | None = None
    usage: dict[str, Any] | None = None


def score_array_field(
    field_name: str,
    expected: list[str],
    actual: list[str] | None,
    *,
    verbatim_threshold: float = 0.97,
    fuzzy_threshold: float = 0.55,
) -> ArrayFieldScore:
    actual_list = actual or []
    score = ArrayFieldScore(
        field=field_name,
        expected_count=len(expected),
        actual_count=len(actual_list),
    )
    if not expected:
        return score

    ratios: list[float] = []
    for exp in expected:
        if not actual_list:
            score.missing += 1
            score.items.append(ItemScore(exp, "", 0.0, "missing"))
            ratios.append(0.0)
            continue

        best = max(actual_list, key=lambda a: similarity(exp, a))
        ratio = similarity(exp, best)
        if ratio >= verbatim_threshold:
            verdict = "verbatim"
            score.verbatim += 1
        elif ratio >= fuzzy_threshold:
            verdict = "summarized"
            score.summarized += 1
        else:
            verdict = "missing"
            score.missing += 1
        score.items.append(ItemScore(exp, best, ratio, verdict))
        ratios.append(ratio)

    score.avg_ratio = sum(ratios) / len(ratios) if ratios else 0.0
    return score


def score_response(model: str, run: ModelRun, *, mode: str = "single") -> FidelityReport:
    report = FidelityReport(
        model=model,
        mode=mode,
        elapsed_ms=run.elapsed_ms,
        ok=run.ok,
        error=run.error,
        finish_reason=run.finish_reason,
        usage=run.usage,
    )
    if not run.ok or run.parsed is None:
        return report

    parsed = run.parsed

    # ── Field presence ────────────────────────────────────────────────────
    for k in (
        list(STRING_FIELDS_FACT)
        + list(STRING_FIELDS_VERBATIM)
        + list(NUMERIC_FIELDS)
        + list(ARRAY_FIELDS)
    ):
        v = parsed.get(k)
        if v is None:
            report.presence[k] = False
        elif isinstance(v, list):
            report.presence[k] = len(v) > 0
        elif isinstance(v, str):
            report.presence[k] = bool(v.strip())
        else:
            report.presence[k] = True

    # ── Numeric exact-match ──────────────────────────────────────────────
    for k in NUMERIC_FIELDS:
        exp = EXPECTED.get(k)
        got = parsed.get(k)
        if exp is None:
            continue
        try:
            report.numeric_match[k] = float(got) == float(exp)
        except (TypeError, ValueError):
            report.numeric_match[k] = False

    # ── Fact strings (case-insensitive equality / contains) ──────────────
    for k in STRING_FIELDS_FACT:
        exp = EXPECTED.get(k)
        got = parsed.get(k)
        if exp is None:
            continue
        if not isinstance(got, str) or not got.strip():
            report.string_scores[k] = {"match": False, "ratio": 0.0, "got": got}
            continue
        ratio = similarity(exp, got)
        match = ratio > 0.85 or normalize(exp) in normalize(got)
        report.string_scores[k] = {"match": match, "ratio": round(ratio, 3), "got": got}

    # ── Verbatim long strings ─────────────────────────────────────────────
    for k in STRING_FIELDS_VERBATIM:
        exp = EXPECTED.get(k)
        got = parsed.get(k)
        if exp is None:
            continue
        if not isinstance(got, str) or not got.strip():
            report.string_scores[k] = {"match": False, "ratio": 0.0, "got": got}
            continue
        ratio = similarity(exp, got)
        report.string_scores[k] = {
            "match": ratio >= 0.92,
            "ratio": round(ratio, 3),
            "summarized": 0.55 <= ratio < 0.92,
            "got": got,
            "got_preview": got[:240] + ("…" if len(got) > 240 else ""),
        }

    # ── Array fields ──────────────────────────────────────────────────────
    for k in ARRAY_FIELDS:
        exp = EXPECTED.get(k)
        if exp is None:
            continue
        report.array_scores.append(score_array_field(k, exp, parsed.get(k)))

    # ── Aggregate score ───────────────────────────────────────────────────
    weight_total = 0.0
    weighted_sum = 0.0

    # Arrays carry the most weight.
    for s in report.array_scores:
        if s.expected_count == 0:
            continue
        w = float(s.expected_count)
        weight_total += w
        weighted_sum += w * s.avg_ratio

    # Verbatim string fields.
    for k in STRING_FIELDS_VERBATIM:
        info = report.string_scores.get(k)
        if not info:
            continue
        w = 2.0
        weight_total += w
        weighted_sum += w * info["ratio"]

    # Fact strings.
    for k in STRING_FIELDS_FACT:
        info = report.string_scores.get(k)
        if not info:
            continue
        w = 0.5
        weight_total += w
        weighted_sum += w * (1.0 if info["match"] else info["ratio"] * 0.5)

    # Numeric.
    for k, ok in report.numeric_match.items():
        w = 0.5
        weight_total += w
        weighted_sum += w * (1.0 if ok else 0.0)

    report.overall_score = (weighted_sum / weight_total * 100.0) if weight_total else 0.0
    return report


# ---------------------------------------------------------------------------
# Pretty printing
# ---------------------------------------------------------------------------


def hr(width: int = 78) -> str:
    return "─" * width


def fmt_pct(x: float) -> str:
    return f"{x:5.1f}%"


def print_summary_table(reports: list[FidelityReport]) -> None:
    print()
    print(hr())
    print("  SUMMARY")
    print(hr())
    show_mode = any(r.mode != "single" for r in reports)
    if show_mode:
        header = (
            f"  {'Model':<48} {'Mode':>8} {'Score':>7} {'Lat':>6} {'Status':>8}"
        )
    else:
        header = f"  {'Model':<54} {'Score':>7} {'Lat':>6} {'Status':>10}"
    print(header)
    print(hr())
    for r in reports:
        status = "OK" if r.ok else "FAIL"
        score = fmt_pct(r.overall_score) if r.ok else "  —  "
        lat = f"{r.elapsed_ms/1000:5.1f}s"
        name = r.model.replace("workers-ai/", "")
        max_name = 48 if show_mode else 54
        if len(name) > max_name:
            name = name[: max_name - 1] + "…"
        if show_mode:
            print(f"  {name:<48} {r.mode:>8} {score:>7} {lat:>6} {status:>8}")
        else:
            print(f"  {name:<54} {score:>7} {lat:>6} {status:>10}")
    print(hr())


def print_model_detail(r: FidelityReport) -> None:
    print()
    print(hr())
    if r.mode != "single":
        print(f"  {r.model}  [mode={r.mode}]")
    else:
        print(f"  {r.model}")
    print(hr())
    if not r.ok:
        print(f"  ✗ Run failed after {r.elapsed_ms} ms")
        print(f"    error: {r.error}")
        return

    print(f"  Overall fidelity score: {fmt_pct(r.overall_score)}")
    print(f"  Latency:                {r.elapsed_ms/1000:.2f}s")
    if r.finish_reason:
        print(f"  finish_reason:          {r.finish_reason}")
    if r.usage:
        print(f"  usage:                  {r.usage}")

    # ── Numerics ──────────────────────────────────────────────────────────
    if r.numeric_match:
        print()
        print("  Numeric fields:")
        for k, ok in r.numeric_match.items():
            mark = "✓" if ok else "✗"
            print(f"    {mark} {k}: expected={EXPECTED[k]}")

    # ── Fact strings ──────────────────────────────────────────────────────
    print()
    print("  Fact strings:")
    for k in STRING_FIELDS_FACT:
        info = r.string_scores.get(k)
        if not info:
            continue
        mark = "✓" if info["match"] else "✗"
        got_preview = (info.get("got") or "")[:80]
        print(
            f"    {mark} {k:<18} ratio={info['ratio']:.2f}  expected={EXPECTED[k]!r}  got={got_preview!r}"
        )

    # ── Verbatim strings ──────────────────────────────────────────────────
    print()
    print("  Verbatim long-text fields:")
    for k in STRING_FIELDS_VERBATIM:
        info = r.string_scores.get(k)
        if not info:
            continue
        if info.get("ratio", 0) >= 0.92:
            mark, label = "✓", "verbatim"
        elif info.get("summarized"):
            mark, label = "≈", "SUMMARIZED"
        else:
            mark, label = "✗", "missing/wrong"
        print(f"    {mark} {k:<22} ratio={info['ratio']:.2f}  ({label})")

    # ── Arrays ────────────────────────────────────────────────────────────
    print()
    print("  Array fields (verbatim bullet match):")
    print(
        f"    {'field':<26} {'count':>9}  {'ratio':>5}  {'verbatim':>9}  {'summary':>8}  {'missing':>7}"
    )
    for s in r.array_scores:
        cnt = f"{s.actual_count}/{s.expected_count}"
        print(
            f"    {s.field:<26} {cnt:>9}  {s.avg_ratio:.2f}  "
            f"{s.verbatim:>9}  {s.summarized:>8}  {s.missing:>7}"
        )

    # ── Per-bullet drilldown for fields with summary/missing ─────────────
    for s in r.array_scores:
        problematic = [it for it in s.items if it.verdict != "verbatim"]
        if not problematic:
            continue
        print()
        print(f"  ⚠  {s.field}: {len(problematic)} item(s) not verbatim")
        for it in problematic[:8]:
            tag = "MISSING" if it.verdict == "missing" else "SUMMARIZED"
            exp_short = it.expected[:80] + ("…" if len(it.expected) > 80 else "")
            got_short = it.best_match[:80] + ("…" if len(it.best_match) > 80 else "")
            print(f"    [{tag}] ratio={it.ratio:.2f}")
            print(f"       expected: {exp_short}")
            print(f"       got:      {got_short}")
        if len(problematic) > 8:
            print(f"    … {len(problematic) - 8} more")


# ---------------------------------------------------------------------------
# HTML report
# ---------------------------------------------------------------------------


def _esc(s: Any) -> str:
    """HTML-escape any value as a string."""
    return html_lib.escape("" if s is None else str(s), quote=True)


def _ratio_class(ratio: float) -> str:
    if ratio >= 0.97:
        return "ok"
    if ratio >= 0.55:
        return "warn"
    return "bad"


def _verdict_class(verdict: str) -> str:
    return {"verbatim": "ok", "summarized": "warn", "missing": "bad"}.get(verdict, "")


def _diff_inline(a: str, b: str) -> str:
    """Render an inline word-level diff between two strings as HTML."""
    a_words = re.split(r"(\s+)", a)
    b_words = re.split(r"(\s+)", b)
    matcher = difflib.SequenceMatcher(None, a_words, b_words)
    out: list[str] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            out.append(_esc("".join(a_words[i1:i2])))
        elif tag == "delete":
            out.append(f'<del class="del">{_esc("".join(a_words[i1:i2]))}</del>')
        elif tag == "insert":
            out.append(f'<ins class="ins">{_esc("".join(b_words[j1:j2]))}</ins>')
        elif tag == "replace":
            out.append(f'<del class="del">{_esc("".join(a_words[i1:i2]))}</del>')
            out.append(f'<ins class="ins">{_esc("".join(b_words[j1:j2]))}</ins>')
    return "".join(out)


HTML_CSS = """
:root {
  --bg: #0b0d10;
  --bg-elev: #14171c;
  --bg-elev2: #1c2128;
  --border: #2a313c;
  --text: #e4e6eb;
  --muted: #8a9099;
  --accent: #8ab4f8;
  --ok: #4ade80;
  --warn: #fbbf24;
  --bad: #f87171;
  --ok-bg: rgba(74, 222, 128, 0.12);
  --warn-bg: rgba(251, 191, 36, 0.14);
  --bad-bg: rgba(248, 113, 113, 0.14);
  --del-bg: rgba(248, 113, 113, 0.22);
  --ins-bg: rgba(74, 222, 128, 0.22);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  font-size: 14px; line-height: 1.55;
  color: var(--text); background: var(--bg);
}
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
h3 { font-size: 15px; margin: 20px 0 8px; color: var(--accent); font-weight: 600; }
a { color: var(--accent); }
code, pre, .mono {
  font-family: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.meta {
  display: flex; flex-wrap: wrap; gap: 16px;
  color: var(--muted); font-size: 13px;
  margin-bottom: 20px;
}
.meta span { white-space: nowrap; }
table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
th, td {
  text-align: left; padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
tr:hover td { background: var(--bg-elev); }
.bar-cell { width: 240px; }
.bar {
  display: inline-block; height: 8px; border-radius: 4px;
  background: var(--bg-elev2); width: 200px; position: relative; overflow: hidden;
  vertical-align: middle; margin-right: 8px;
}
.bar > i {
  display: block; height: 100%; border-radius: 4px;
  background: linear-gradient(90deg, var(--bad), var(--warn) 50%, var(--ok));
}
.pill {
  display: inline-block; padding: 1px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
  border: 1px solid var(--border);
}
.pill.ok { color: var(--ok); background: var(--ok-bg); border-color: rgba(74,222,128,0.4); }
.pill.warn { color: var(--warn); background: var(--warn-bg); border-color: rgba(251,191,36,0.4); }
.pill.bad { color: var(--bad); background: var(--bad-bg); border-color: rgba(248,113,113,0.4); }
.pill.muted { color: var(--muted); }
.score-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.ok { color: var(--ok); }
.warn { color: var(--warn); }
.bad { color: var(--bad); }
.muted { color: var(--muted); }
details {
  background: var(--bg-elev); border: 1px solid var(--border);
  border-radius: 6px; padding: 0; margin-bottom: 12px;
}
details > summary {
  list-style: none; cursor: pointer; user-select: none;
  padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; font-weight: 500;
}
details > summary::-webkit-details-marker { display: none; }
details > summary::before {
  content: "▶"; color: var(--muted); font-size: 11px;
  transition: transform 0.15s;
}
details[open] > summary::before { transform: rotate(90deg); }
details > .body { padding: 0 16px 16px; }
.stack { display: flex; flex-direction: column; gap: 10px; }
.row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.box {
  background: var(--bg-elev2); border: 1px solid var(--border);
  border-radius: 5px; padding: 10px 12px;
}
.box-label {
  font-size: 11px; font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;
}
.box pre {
  margin: 0; white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, Menlo, monospace; font-size: 12.5px;
  color: var(--text);
}
ins.ins {
  text-decoration: none; background: var(--ins-bg); color: var(--ok);
  padding: 0 2px; border-radius: 2px;
}
del.del {
  background: var(--del-bg); color: var(--bad);
  padding: 0 2px; border-radius: 2px; text-decoration: line-through;
}
.diff-block {
  background: var(--bg-elev2); border: 1px solid var(--border);
  border-radius: 5px; padding: 10px 12px; font-family: ui-monospace, Menlo, monospace;
  font-size: 12.5px; white-space: pre-wrap; word-break: break-word;
}
.kv {
  display: grid; grid-template-columns: 220px auto;
  row-gap: 4px; column-gap: 12px; font-size: 13px;
}
.kv .k { color: var(--muted); font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; }
.markdown-pre {
  background: var(--bg-elev2); border: 1px solid var(--border);
  border-radius: 5px; padding: 12px; max-height: 480px; overflow: auto;
  white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, Menlo, monospace; font-size: 12px;
}
"""


def _render_summary_table(reports: list[FidelityReport]) -> str:
    rows: list[str] = []
    show_mode = any(r.mode != "single" for r in reports)
    for r in reports:
        score = r.overall_score
        score_class = "ok" if score >= 90 else "warn" if score >= 70 else "bad"
        score_html = (
            f'<span class="bar"><i style="width:{score:.1f}%"></i></span>'
            f'<span class="score-num {score_class}">{score:5.1f}%</span>'
            if r.ok
            else '<span class="muted">—</span>'
        )
        status = (
            f'<span class="pill ok">OK</span>'
            if r.ok
            else f'<span class="pill bad">FAIL</span>'
        )
        verb = sum(s.verbatim for s in r.array_scores)
        summ = sum(s.summarized for s in r.array_scores)
        miss = sum(s.missing for s in r.array_scores)
        bullet_breakdown = (
            f'<span class="ok">{verb}✓</span>·'
            f'<span class="warn">{summ}≈</span>·'
            f'<span class="bad">{miss}✗</span>'
        )
        mode_pill_class = "ok" if r.mode == "hybrid" else "muted"
        mode_cell = (
            f'<td><span class="pill {mode_pill_class}">{_esc(r.mode)}</span></td>'
            if show_mode
            else ""
        )
        rows.append(
            f"<tr>"
            f"<td><code>{_esc(r.model)}</code></td>"
            f"{mode_cell}"
            f'<td class="bar-cell">{score_html}</td>'
            f'<td class="mono">{r.elapsed_ms / 1000:.1f}s</td>'
            f"<td>{status}</td>"
            f'<td class="mono">{bullet_breakdown}</td>'
            f'<td class="muted mono">{_esc(r.finish_reason or "")}</td>'
            f"</tr>"
        )
    body = "".join(rows)
    headers = ["Model"]
    if show_mode:
        headers.append("Mode")
    headers.extend(["Score", "Latency", "Status", "Bullets (verb·summ·miss)", "finish_reason"])
    head = "".join(f"<th>{h}</th>" for h in headers)
    return (
        f"<table><thead><tr>{head}</tr></thead>"
        f"<tbody>{body}</tbody></table>"
    )


def _render_model_section(r: FidelityReport) -> str:
    score = r.overall_score
    score_class = "ok" if score >= 90 else "warn" if score >= 70 else "bad"
    summary_pill = (
        f'<span class="score-num {score_class}">{score:5.1f}%</span>'
        if r.ok
        else f'<span class="pill bad">FAIL</span>'
    )

    mode_badge = (
        f'<span class="pill {"ok" if r.mode == "hybrid" else "muted"}">{_esc(r.mode)}</span>'
        if r.mode != "single"
        else ""
    )

    # Failure block — bail out early
    if not r.ok:
        return (
            f"<details open><summary>"
            f"<code>{_esc(r.model)}</code> {mode_badge} &nbsp; {summary_pill}"
            f'<span class="muted mono">{r.elapsed_ms / 1000:.1f}s</span>'
            f"</summary>"
            f'<div class="body">'
            f'<div class="box"><div class="box-label">Error</div>'
            f"<pre>{_esc(r.error)}</pre></div></div></details>"
        )

    # ── Numerics + facts table ────────────────────────────────────────────
    fact_rows: list[str] = []
    for k in NUMERIC_FIELDS:
        if k not in r.numeric_match:
            continue
        ok = r.numeric_match[k]
        cls = "ok" if ok else "bad"
        mark = "✓" if ok else "✗"
        fact_rows.append(
            f"<tr><td class='mono'>{_esc(k)}</td>"
            f"<td><span class='pill {cls}'>numeric</span></td>"
            f"<td class='mono'>{_esc(EXPECTED.get(k))}</td>"
            f"<td class='{cls}'>{mark}</td><td></td></tr>"
        )
    for k in STRING_FIELDS_FACT:
        info = r.string_scores.get(k)
        if not info:
            continue
        cls = "ok" if info["match"] else "bad"
        mark = "✓" if info["match"] else "✗"
        got_preview = (info.get("got") or "")[:120]
        fact_rows.append(
            f"<tr><td class='mono'>{_esc(k)}</td>"
            f"<td><span class='pill {cls}'>fact</span></td>"
            f"<td class='mono'>{_esc(EXPECTED.get(k))}</td>"
            f"<td class='{cls}'>{mark} <span class='muted'>r={info['ratio']:.2f}</span></td>"
            f"<td class='mono muted'>{_esc(got_preview)}</td></tr>"
        )
    fact_table = (
        "<table>"
        "<thead><tr><th>Field</th><th>Type</th><th>Expected</th>"
        "<th>Match</th><th>Got</th></tr></thead>"
        f"<tbody>{''.join(fact_rows)}</tbody></table>"
        if fact_rows
        else ""
    )

    # ── Verbatim long-text fields ─────────────────────────────────────────
    verbatim_blocks: list[str] = []
    for k in STRING_FIELDS_VERBATIM:
        info = r.string_scores.get(k)
        if not info:
            continue
        ratio = info.get("ratio", 0.0)
        if ratio >= 0.92:
            verdict_html = '<span class="pill ok">verbatim</span>'
        elif info.get("summarized"):
            verdict_html = '<span class="pill warn">SUMMARIZED</span>'
        else:
            verdict_html = '<span class="pill bad">missing/wrong</span>'
        expected_text = EXPECTED.get(k) or ""
        got_text = info.get("got") or info.get("got_preview") or ""
        diff_html = _diff_inline(expected_text, got_text) if got_text else "<em class='muted'>(empty)</em>"
        verbatim_blocks.append(
            f"<h3>{_esc(k)} {verdict_html} "
            f"<span class='muted mono' style='font-weight:400'>ratio={ratio:.2f}</span></h3>"
            f"<div class='diff-block'>{diff_html}</div>"
        )

    # ── Array fields summary table ────────────────────────────────────────
    array_rows: list[str] = []
    for s in r.array_scores:
        if s.expected_count == 0:
            continue
        cnt_class = "ok" if s.actual_count == s.expected_count else (
            "warn" if abs(s.actual_count - s.expected_count) <= 1 else "bad"
        )
        ratio_class = _ratio_class(s.avg_ratio)
        array_rows.append(
            f"<tr><td class='mono'>{_esc(s.field)}</td>"
            f"<td class='mono {cnt_class}'>{s.actual_count}/{s.expected_count}</td>"
            f"<td class='mono {ratio_class}'>{s.avg_ratio:.2f}</td>"
            f"<td class='ok mono'>{s.verbatim}</td>"
            f"<td class='warn mono'>{s.summarized}</td>"
            f"<td class='bad mono'>{s.missing}</td></tr>"
        )
    array_table = (
        "<table>"
        "<thead><tr><th>Field</th><th>Count</th><th>Avg Ratio</th>"
        "<th>Verbatim</th><th>Summarized</th><th>Missing</th></tr></thead>"
        f"<tbody>{''.join(array_rows)}</tbody></table>"
        if array_rows
        else ""
    )

    # ── Per-bullet drilldown for fields with non-verbatim items ──────────
    bullet_drilldowns: list[str] = []
    for s in r.array_scores:
        problematic = [it for it in s.items if it.verdict != "verbatim"]
        if not problematic:
            continue
        items_html: list[str] = []
        for it in problematic:
            verdict_cls = _verdict_class(it.verdict)
            tag_html = f'<span class="pill {verdict_cls}">{_esc(it.verdict.upper())}</span>'
            ratio_str = f"<span class='muted mono'>r={it.ratio:.2f}</span>"
            if it.verdict == "missing" and not it.best_match:
                body = (
                    f"<div class='box-label'>Expected</div>"
                    f"<pre>{_esc(it.expected)}</pre>"
                    f"<div class='box-label' style='margin-top:8px;color:var(--bad)'>Got</div>"
                    f"<pre><em class='muted'>(no plausible match in actual response)</em></pre>"
                )
            else:
                body = (
                    f"<div class='box-label'>Diff (expected → got)</div>"
                    f"<div class='diff-block'>{_diff_inline(it.expected, it.best_match)}</div>"
                )
            items_html.append(
                f"<div class='box' style='margin-bottom:10px'>"
                f"<div style='display:flex; gap:10px; align-items:center; margin-bottom:6px'>"
                f"{tag_html} {ratio_str}"
                f"</div>"
                f"{body}"
                f"</div>"
            )
        bullet_drilldowns.append(
            f"<details><summary><code>{_esc(s.field)}</code> · "
            f"<span class='warn'>{len(problematic)} non-verbatim item(s)</span></summary>"
            f"<div class='body'>{''.join(items_html)}</div></details>"
        )

    # ── Field presence dump ───────────────────────────────────────────────
    presence_rows: list[str] = []
    for k, present in sorted(r.presence.items()):
        cls = "ok" if present else "muted"
        mark = "●" if present else "○"
        presence_rows.append(
            f"<tr><td class='mono'>{_esc(k)}</td>"
            f"<td class='{cls}'>{mark} {'present' if present else 'empty/null'}</td></tr>"
        )
    presence_table = (
        "<table>"
        "<thead><tr><th>Field</th><th>Presence</th></tr></thead>"
        f"<tbody>{''.join(presence_rows)}</tbody></table>"
    )

    # ── Usage / metadata box ─────────────────────────────────────────────
    usage_html = ""
    if r.usage:
        usage_kv = []
        for k, v in r.usage.items():
            usage_kv.append(
                f"<div class='k'>{_esc(k)}</div><div class='mono'>{_esc(json.dumps(v))}</div>"
            )
        usage_html = f"<div class='box'><div class='box-label'>Usage</div><div class='kv'>{''.join(usage_kv)}</div></div>"

    # ── Compose the section ──────────────────────────────────────────────
    return (
        f"<details open><summary>"
        f"<code>{_esc(r.model)}</code> {mode_badge} &nbsp; {summary_pill}"
        f"<span class='muted mono'>{r.elapsed_ms / 1000:.1f}s</span>"
        f"<span class='muted mono'>{_esc(r.finish_reason or '')}</span>"
        f"</summary>"
        f"<div class='body'>"
        f"{usage_html}"
        f"<h3>Numeric &amp; fact fields</h3>{fact_table}"
        f"<h3>Array fields (verbatim bullet match)</h3>{array_table}"
        f"<h3>Verbatim long-text fields</h3>{''.join(verbatim_blocks) or '<p class=muted>No long-text fields scored.</p>'}"
        f"<h3>Per-bullet drilldown</h3>{''.join(bullet_drilldowns) or '<p class=ok>All array items matched verbatim.</p>'}"
        f"<h3>Field presence</h3>{presence_table}"
        f"</div></details>"
    )


def render_html_report(
    reports: list[FidelityReport],
    *,
    job_url: str,
    gateway_id: str,
    markdown: str,
    expected: dict[str, Any],
) -> str:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    summary_table = _render_summary_table(reports)
    model_sections = "".join(_render_model_section(r) for r in reports)

    expected_pre = _esc(json.dumps(expected, indent=2, ensure_ascii=False))
    markdown_pre = _esc(markdown)
    succeeded = sum(1 for r in reports if r.ok)
    avg_score = (
        sum(r.overall_score for r in reports if r.ok) / max(succeeded, 1)
    )

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Workers AI Extraction Fidelity Report</title>
<style>{HTML_CSS}</style>
</head><body>
<h1>Workers AI Extraction Fidelity Report</h1>
<div class="meta">
  <span><strong>Job:</strong> <a href="{_esc(job_url)}">{_esc(job_url)}</a></span>
  <span><strong>Gateway:</strong> {_esc(gateway_id)} (compat mode)</span>
  <span><strong>Markdown:</strong> {len(markdown):,} chars</span>
  <span><strong>Models:</strong> {succeeded}/{len(reports)} succeeded</span>
  <span><strong>Avg score:</strong> {avg_score:.1f}%</span>
  <span><strong>Generated:</strong> {generated_at}</span>
</div>

<h2>Summary</h2>
{summary_table}

<h2>Per-Model Details</h2>
{model_sections}

<h2>Ground Truth (Expected)</h2>
<details><summary>Click to expand the hand-curated expected JSON</summary>
<div class="body"><pre class="markdown-pre">{expected_pre}</pre></div>
</details>

<h2>Captured Markdown</h2>
<details><summary>Click to expand the Browser Rendering /markdown capture sent to every model</summary>
<div class="body"><pre class="markdown-pre">{markdown_pre}</pre></div>
</details>

</body></html>
"""


# ---------------------------------------------------------------------------
# Markdown caching
# ---------------------------------------------------------------------------


def load_or_fetch_markdown(args, account_id: str, br_token: str) -> str:
    cache_path = Path(args.markdown_cache) if args.markdown_cache else None
    if cache_path and cache_path.exists() and not args.refresh_markdown:
        print(f"  • Using cached markdown from {cache_path}")
        return cache_path.read_text(encoding="utf-8")

    print(f"  • Fetching markdown via Browser Rendering /markdown for {args.url}")
    started = time.time()
    md = fetch_markdown(account_id, br_token, args.url)
    print(f"    captured {len(md):,} chars in {time.time() - started:.1f}s")

    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(md, encoding="utf-8")
        print(f"    cached → {cache_path}")
    return md


def load_or_fetch_dom(args, account_id: str, br_token: str) -> list[dict[str, Any]]:
    cache_path = Path(args.dom_cache) if args.dom_cache else None
    if cache_path and cache_path.exists() and not args.refresh_dom:
        print(f"  • Using cached DOM scrape from {cache_path}")
        return json.loads(cache_path.read_text(encoding="utf-8"))

    print(f"  • Fetching DOM elements via Browser Rendering /scrape for {args.url}")
    started = time.time()
    dom = fetch_dom_groups(account_id, br_token, args.url)
    counts = {g.get("selector", "?"): len(g.get("results", [])) for g in dom}
    print(f"    captured {sum(counts.values())} elements in {time.time() - started:.1f}s")
    for sel, n in counts.items():
        print(f"      {sel:>14s}: {n}")

    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(dom, ensure_ascii=False), encoding="utf-8")
        print(f"    cached → {cache_path}")
    return dom


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def expand_models(models: list[str]) -> list[str]:
    """Add the workers-ai/ prefix to bare @cf/ model IDs."""
    out: list[str] = []
    for m in models:
        if m.startswith("@cf/"):
            out.append(f"workers-ai/{m}")
        else:
            out.append(m)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Test Workers AI extraction fidelity across multiple models via "
            "AI Gateway compat mode. Captures markdown once, then runs each "
            "model with the same prompt + schema."
        )
    )
    parser.add_argument("--url", default=DEFAULT_JOB_URL, help="Job posting URL")
    parser.add_argument(
        "--gateway-id",
        default=os.environ.get("AI_GATEWAY_ID", DEFAULT_GATEWAY_ID),
        help="AI Gateway ID (default: %(default)s)",
    )
    parser.add_argument(
        "--models",
        nargs="+",
        default=DEFAULT_MODELS,
        help="Model IDs to test. @cf/ models are auto-prefixed with workers-ai/",
    )
    parser.add_argument(
        "--only",
        nargs="+",
        default=None,
        help="Run only models whose name contains any of these substrings",
    )
    parser.add_argument(
        "--markdown-cache",
        default=".cache/extraction-fidelity-markdown.md",
        help="Cache file for the captured markdown (default: %(default)s)",
    )
    parser.add_argument(
        "--refresh-markdown",
        action="store_true",
        help="Force re-fetch the markdown even if a cache file exists",
    )
    parser.add_argument(
        "--mode",
        choices=["single", "hybrid", "both"],
        default="single",
        help=(
            "Extraction mode: 'single' = one big AI call with the full schema "
            "(production-equivalent), 'hybrid' = DOM scrape for bullets + two "
            "small AI calls for narrative/facts, 'both' = run each model in both "
            "modes for A/B comparison."
        ),
    )
    parser.add_argument(
        "--dom-cache",
        default=".cache/extraction-fidelity-dom.json",
        help="Cache file for the BR /scrape DOM groups (default: %(default)s)",
    )
    parser.add_argument(
        "--refresh-dom",
        action="store_true",
        help="Force re-fetch the DOM scrape even if a cache file exists",
    )
    parser.add_argument(
        "--dump-dir",
        default=None,
        help="Directory to dump per-model raw + parsed JSON for inspection",
    )
    parser.add_argument(
        "--report-json",
        default=None,
        help="Write the full report (all models + scores) to this JSON path",
    )
    parser.add_argument(
        "--html-report",
        default=None,
        help="Write a self-contained dark-mode HTML report (with inline diffs) to this path",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the HTML report in the default browser when finished",
    )
    parser.add_argument("--timeout", type=int, default=240, help="Per-model timeout (s)")
    args = parser.parse_args()

    print()
    print(hr())
    print("  Workers AI Extraction Fidelity Test")
    print(hr())

    # ── Auth ──────────────────────────────────────────────────────────────
    print("  • Resolving credentials via tokens CLI…")
    account_id = tokens_show("CLOUDFLARE_ACCOUNT_ID")
    cf_token = tokens_show("CLOUDFLARE_AI_GATEWAY_TOKEN")
    br_token = tokens_show("CLOUDFLARE_BROWSER_RENDER_TOKEN")
    try:
        gemini_key: Optional[str] = tokens_show("GEMINI_API_KEY")
    except SystemExit:
        gemini_key = None
        print("    (GEMINI_API_KEY not available — google-ai-studio routes will use cf token)")

    print(f"    account: {account_id[:8]}…  gateway: {args.gateway_id}")

    # ── Markdown ──────────────────────────────────────────────────────────
    markdown = load_or_fetch_markdown(args, account_id, br_token)

    # ── Model list ────────────────────────────────────────────────────────
    all_models = expand_models(args.models)
    if args.only:
        filt = [m.lower() for m in args.only]
        all_models = [m for m in all_models if any(f in m.lower() for f in filt)]
    if not all_models:
        print("  ✗ No models selected after filtering.")
        return 1

    print()
    print(f"  • Will test {len(all_models)} model(s):")
    for m in all_models:
        print(f"      - {m}")

    # ── Determine which modes to run ─────────────────────────────────────
    modes: list[str] = []
    if args.mode in ("single", "both"):
        modes.append("single")
    if args.mode in ("hybrid", "both"):
        modes.append("hybrid")

    # ── Fetch DOM scrape once if any hybrid pass is needed ───────────────
    dom_groups: Optional[list[dict[str, Any]]] = None
    parsed_dom_preview: Optional[dict[str, Any]] = None
    if "hybrid" in modes:
        dom_groups = load_or_fetch_dom(args, account_id, br_token)
        parsed_dom_preview = parse_dom_groups(dom_groups)
        s = parsed_dom_preview["stats"]
        print(
            f"    DOM stats: headings={s['headings']} "
            f"list_items={s['list_items']} "
            f"paragraphs_filtered={s['paragraphs_filtered']}/{s['paragraphs_raw']}"
        )
        # Show the raw heading groups — Pass H will label each one per model.
        for g in parsed_dom_preview["heading_groups"]:
            n = len(g["items"])
            tag = f"({n} li)" if n else "(narrative)"
            print(f"      • {g['heading'][:60]:<60} {tag}")

    # ── Dump dir setup ────────────────────────────────────────────────────
    dump_dir: Optional[Path] = Path(args.dump_dir) if args.dump_dir else None
    if dump_dir:
        dump_dir.mkdir(parents=True, exist_ok=True)
        (dump_dir / "_markdown.md").write_text(markdown, encoding="utf-8")
        (dump_dir / "_expected.json").write_text(
            json.dumps(EXPECTED, indent=2), encoding="utf-8"
        )
        if dom_groups is not None:
            (dump_dir / "_dom.json").write_text(
                json.dumps(dom_groups, indent=2, ensure_ascii=False), encoding="utf-8"
            )
        if parsed_dom_preview is not None:
            (dump_dir / "_dom-parsed.json").write_text(
                json.dumps(parsed_dom_preview, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    # ── Run each (model, mode) combination ───────────────────────────────
    reports: list[FidelityReport] = []
    for model in all_models:
        for mode in modes:
            print()
            mode_label = f" [{mode}]" if len(modes) > 1 or mode != "single" else ""
            print(f"  ▶ Running {model}{mode_label}…")

            if mode == "single":
                run = call_compat(
                    account_id=account_id,
                    gateway_id=args.gateway_id,
                    cf_token=cf_token,
                    gemini_key=gemini_key,
                    model=model,
                    system_prompt=EXTRACTION_SYSTEM_PROMPT,
                    user_content=markdown,
                    json_schema=EXTRACTION_JSON_SCHEMA,
                    timeout=args.timeout,
                )
            else:  # hybrid
                assert dom_groups is not None
                run = run_hybrid_extraction(
                    account_id=account_id,
                    gateway_id=args.gateway_id,
                    cf_token=cf_token,
                    gemini_key=gemini_key,
                    model=model,
                    markdown=markdown,
                    dom_groups=dom_groups,
                    timeout=args.timeout,
                )

            if run.ok:
                size = len(json.dumps(run.parsed)) if run.parsed else 0
                print(f"    ✓ {run.elapsed_ms} ms — parsed {size:,} bytes")
            else:
                print(f"    ✗ {run.elapsed_ms} ms — {run.error[:200] if run.error else ''}")

            report = score_response(model, run, mode=mode)
            reports.append(report)

            if dump_dir:
                slug_base = re.sub(r"[^a-zA-Z0-9._-]+", "_", model)
                slug = f"{slug_base}.{mode}" if len(modes) > 1 else slug_base
                (dump_dir / f"{slug}.parsed.json").write_text(
                    json.dumps(run.parsed, indent=2, ensure_ascii=False) if run.parsed else "{}",
                    encoding="utf-8",
                )
                if run.raw is not None:
                    (dump_dir / f"{slug}.raw.json").write_text(
                        json.dumps(run.raw, indent=2, ensure_ascii=False),
                        encoding="utf-8",
                    )

    # ── Reports ──────────────────────────────────────────────────────────
    print_summary_table(reports)
    for r in reports:
        print_model_detail(r)

    if args.report_json:
        Path(args.report_json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report_json).write_text(
            json.dumps(
                {
                    "url": args.url,
                    "gatewayId": args.gateway_id,
                    "markdownChars": len(markdown),
                    "expected": EXPECTED,
                    "reports": [
                        {
                            "model": r.model,
                            "mode": r.mode,
                            "ok": r.ok,
                            "elapsedMs": r.elapsed_ms,
                            "overallScore": r.overall_score,
                            "error": r.error,
                            "finishReason": r.finish_reason,
                            "usage": r.usage,
                            "presence": r.presence,
                            "numericMatch": r.numeric_match,
                            "stringScores": r.string_scores,
                            "arrayScores": [
                                {
                                    "field": s.field,
                                    "expectedCount": s.expected_count,
                                    "actualCount": s.actual_count,
                                    "avgRatio": s.avg_ratio,
                                    "verbatim": s.verbatim,
                                    "summarized": s.summarized,
                                    "missing": s.missing,
                                    "items": [
                                        {
                                            "expected": it.expected,
                                            "bestMatch": it.best_match,
                                            "ratio": it.ratio,
                                            "verdict": it.verdict,
                                        }
                                        for it in s.items
                                    ],
                                }
                                for s in r.array_scores
                            ],
                        }
                        for r in reports
                    ],
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print()
        print(f"  • Full report written to {args.report_json}")

    if args.html_report:
        html_path = Path(args.html_report)
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(
            render_html_report(
                reports,
                job_url=args.url,
                gateway_id=args.gateway_id,
                markdown=markdown,
                expected=EXPECTED,
            ),
            encoding="utf-8",
        )
        print()
        print(f"  • HTML report written to {html_path.resolve()}")
        if args.open:
            try:
                if sys.platform == "darwin":
                    subprocess.run(["open", str(html_path)], check=False)
                elif sys.platform.startswith("linux"):
                    subprocess.run(["xdg-open", str(html_path)], check=False)
                elif sys.platform == "win32":
                    os.startfile(str(html_path))  # type: ignore[attr-defined]
            except Exception as e:  # noqa: BLE001
                print(f"    (could not auto-open: {e})")

    # Exit code: nonzero if any model run failed entirely.
    return 0 if all(r.ok for r in reports) else 2


if __name__ == "__main__":
    sys.exit(main())
