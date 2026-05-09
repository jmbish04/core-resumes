# Secrets Management Rule

All secret access is centralized in `src/backend/utils/secrets.ts`. Route, agent, and tool code should use typed accessors from that module.

## ⚠️ CRITICAL: Secrets Store ≠ Worker Secrets

Cloudflare's **Secrets Store** (distinct from standard static Worker Secrets) exposes secrets as **bindings**, not plain strings. You **MUST** always use the asynchronous `.get()` method to retrieve these values:

```typescript
// ✅ CORRECT — Secrets Store binding (async .get())
const token = await env.NOTEBOOKLM_AUTH_TOKEN.get();

// ❌ WRONG — This treats it as a plain string and will return the binding object, not the value
const token = env.NOTEBOOKLM_AUTH_TOKEN;
```

Never treat Secrets Store bindings as plain string properties on the `env` object.

## Three storage tiers

| Tier              | Config                                      | Access                    | Mutability         | Example                                               |
| ----------------- | ------------------------------------------- | ------------------------- | ------------------ | ----------------------------------------------------- |
| **Secrets Store** | `secrets_store_secrets` in `wrangler.jsonc` | `await env.BINDING.get()` | Immutable          | `GITHUB_TOKEN`, `GOOGLE_CREDS_SA_*`                   |
| **Worker Secret** | `wrangler secret put NAME`                  | `env.NAME` (string)       | CLI-updatable      | `NOTEBOOKLM_COOKIES`                                  |
| **KV**            | `env.KV.put()` / `.get()`                   | `await env.KV.get("KEY")` | Runtime read/write | `NOTEBOOKLM_COOKIE_SIGNING_KEY`, cached access tokens |

## Rules

1. **Never** put secret values in source code or `wrangler.jsonc` vars.
2. **Never** use the Secrets Store for values that need to be updated at runtime — it is read-only.
3. **Always** add a typed accessor in `src/backend/utils/secrets.ts` for every new secret.
4. **Always** run `pnpm run cf-typegen` after changing `wrangler.jsonc` bindings.
5. Route/agent code should call `getSecretName(env)` from `secrets.ts`, not `env.BINDING.get()` directly.
6. The generic `getSecret(env, key)` is for dynamic/provisioning use only. Prefer named accessors.

## Current secrets store bindings (from `wrangler.jsonc`)

```
GITHUB_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WRANGLER_API_TOKEN,
WORKER_API_KEY, AGENTIC_WORKER_API_KEY, CLOUDFLARE_AI_GATEWAY_TOKEN,
CF_BROWSER_RENDER_TOKEN, JULES_API_KEY,
GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1, GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2,
GOOGLE_CREDS_SA_CLIENT_EMAIL, NOTEBOOKLM_AUTH_TOKEN
```

## Special patterns

- **Google SA private key**: Split across two secrets store bindings (`_PT_1` + `_PT_2`) due to the 1024-byte limit. `getGoogleServiceAccountPrivateKey()` concatenates them.
- **NotebookLM cookie signing key**: Stored in KV, not secrets store, because the worker needs to rotate/update it at runtime. Use `getNotebookLMCookieSigningKey()`.
- **NotebookLM notebook ID**: Set as a `wrangler.jsonc` var (`CAREER_NOTEBOOKLM_ID`), accessed via `getCareerNotebookLMId()`. Not a secret — it's a plain env var.
