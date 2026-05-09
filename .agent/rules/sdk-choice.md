# SDK Choice Rule

NotebookLM integration uses `notebooklm-sdk` by agmmnn. Do not replace it with the official Google API client.

## Credential sources

| Credential         | Tier                                  | Access                                              |
| ------------------ | ------------------------------------- | --------------------------------------------------- |
| Auth token         | Secrets Store                         | `await env.NOTEBOOKLM_AUTH_TOKEN.get()`             |
| Cookies content    | Worker Secret (`wrangler secret put`) | `env.NOTEBOOKLM_COOKIES` (string)                   |
| Cookie signing key | KV (runtime-mutable)                  | `await env.KV.get("NOTEBOOKLM_COOKIE_SIGNING_KEY")` |
| Notebook ID        | Env var (`wrangler.jsonc` vars)       | `env.CAREER_NOTEBOOKLM_ID` (string)                 |

## Rules

- Keep NotebookLM calls isolated in `src/backend/ai/tools/notebooklm.ts`.
- Use typed accessors from `src/backend/utils/secrets.ts` when available.
- Do not store the cookie signing key in the Secrets Store — it is read-only. Use KV because this value may need to be refreshed at runtime.
- Verify isolate compatibility through `wrangler dev` before production deploy because the SDK imports Node built-ins.
