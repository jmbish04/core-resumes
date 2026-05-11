---
title: "OpenRoute API Integration"
description: "Integration documentation for the HeiGIT OpenRoute API, used for factual commute location data"
date_last_updated: "2026-05-03"
---

# OpenRoute API Integration

The **OpenRouteService** wrapper is used to communicate with the HeiGIT OpenRoute API. This replaces legacy AI-based commute estimates with deterministic, real-world mapping data, providing factual driving distances and commute times for the role insights analysis.

## API Migration Notice

> [!WARNING]
> As of August 2026, the legacy `api.openrouteservice.org` base URL has been deprecated. All API requests must be routed through the unified HeiGIT structure: `api.heigit.org/openrouteservice/v2/`.

### Supported Endpoints

The internal `OpenRouteService` class currently exposes wrappers for the following endpoints:

- **Directions**: `api.heigit.org/openrouteservice/v2/directions`
- **Isochrones**: `api.heigit.org/openrouteservice/v2/isochrones`
- **Matrix**: `api.heigit.org/openrouteservice/v2/matrix`
- **Geocoding**: `api.heigit.org/pelias/v1/search`

## Usage in Role Insights

The `OpenRouteService` is directly integrated into the `generateLocationInsight` pipeline. When analyzing a role's location, the system uses the candidate's base location and the job location to compute real commute distances.

### The Commute Fallback Pattern

We utilize a robust fallback pattern to ensure the location analysis is generated successfully even if the OpenRoute API is unresponsive or rate-limited:

1. **Attempt Geocoding**: Address strings are converted to `[longitude, latitude]` coordinates via the Pelias endpoint.
2. **Fetch Directions**: Driving directions are fetched to calculate meters and duration in seconds.
3. **Control Prompt**: The factual data is injected into the AI's system prompt (e.g., `Factual Commute Data: OpenRoute API Driving Data: 15.2 miles, 24 minutes each way.`).
4. **AI Fallback**: If the OpenRoute API throws an error, the pipeline catches it, injects a fallback message (`Not available. Estimate using your geographic knowledge.`), and gracefully delegates the estimation back to the LLM.

## Authentication

Authentication is handled via the Cloudflare Workers Secrets store. The key is managed using the `OPENROUTE_API_KEY` binding.

To rotate the API key:

```bash
wrangler secret put OPENROUTE_API_KEY
```

The key is injected into the request header as `Authorization`. Note that for the Pelias geocoding endpoint, it is passed via the `api_key` query parameter.
