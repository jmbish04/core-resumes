# External Agents API

The External Agents API allows automated job scraping agents to integrate directly with your Human-In-The-Loop (HITL) pipeline.

## Getting Scraping Instructions

To understand what roles to scrape, external agents should first pull your current prompt instructions.

### `GET /api/pipeline/external-agents/prompt`

This endpoint dynamically constructs a Markdown prompt outlining your specific target roles, target locations, major hubs, and tracked companies. It also lists the URLs of jobs you have already processed or applied to so the agent can avoid scraping duplicates.

**Response (Markdown Text):**
```markdown
# Job Scraping Agent Instructions

You are an automated job scraping agent working on my behalf...
```

## Submitting Jobs to the Queue

When an external agent finds a job that matches your criteria, it should submit the job for your review.

### `POST /api/pipeline/external-agents/jobs`

This endpoint accepts a JSON payload of scraped jobs and queues them directly into your Discovery (`/discovery`) HITL review queue.

**Request Payload:**
```json
{
  "jobs": [
    {
      "jobTitle": "Senior Software Engineer",
      "company": "Stripe",
      "location": "Remote",
      "jobUrl": "https://boards.greenhouse.io/stripe/jobs/12345",
      "jobSiteId": "strp-12345" 
    }
  ]
}
```

- `jobTitle` (Required): The title of the job.
- `company` (Required): The company offering the job.
- `location` (Optional): The job location.
- `jobUrl` (Optional): The URL to the original job posting.
- `jobSiteId` (Optional): The unique identifier from the job board. If omitted, the system generates a stable MD5 hash based on the `jobUrl` or `company + jobTitle` to prevent duplicate ingestion.

**Response:**
```json
{
  "insertedCount": 1,
  "skippedCount": 0
}
```

Jobs submitted via this endpoint automatically have `triagePassed` set to `false`, meaning they will await your manual review in the Discovery interface.
