# OpenRoute API Integration Rules

## Core Standard

When interacting with mapping, routing, or geocoding services, agents MUST use the `OpenRouteService` wrapper class located at `src/backend/services/openroute-service.ts`.

## API URL Migration

As of August 2026, the legacy URL `api.openrouteservice.org` has been officially deprecated by HeiGIT.

- **NEVER** use `api.openrouteservice.org`.
- **ALWAYS** use the unified structure: `api.heigit.org/openrouteservice/v2/`.
- For geocoding (Pelias), use `api.heigit.org/pelias/v1`.
- For elevation, use `api.heigit.org/openelevationservice/v0`.

## Architecture & Error Handling

1. **Delegation**: Do not implement raw fetch calls for mapping inside AI tasks or orchestrators. Always instantiate and call `OpenRouteService`.
2. **Strict Timeouts**: OpenRoute API and Google Maps API requests **must** use native `AbortSignal.timeout(ms)` to prevent worker hangs. Never use `Promise.race` with `setTimeout` for request deadlines.
3. **Graceful Degradation**: Mapping APIs are prone to rate-limiting and downtime. All OpenRoute methods must catch their own exceptions and immediately fail-fast (triggering the GoogleMaps fallback) if `AbortSignal` trips. Returns must be structured `{ success: false, error: string }` or `null` objects so that callers can fall back to AI estimations.
4. **Authentication**: Use `getOpenRouteApiKey(env)` from `utils/secrets.ts`. Do not hardcode tokens. Note that standard openroute endpoints accept the key via the `Authorization` header, whereas Pelias requires it as a query parameter (`&api_key=`).

## Injection into Prompts

When using OpenRoute factual data to ground AI output (e.g. for commute analysis), inject it directly into the `userPrompt` prefixed with "Factual Data:" or similar, and explicitly instruct the model to use the provided factual data as the primary source of truth.
