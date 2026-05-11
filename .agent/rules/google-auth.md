# Google Auth Rule

Workspace API calls use Service Account domain-wide delegation through `src/backend/lib/google-auth.ts`.

## Credential storage

All Google SA credentials live in the **Secrets Store** (immutable, read-only bindings in `wrangler.jsonc`).

| Credential   | Binding(s)                                   | Notes                                                                                   |
| ------------ | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Private key  | `GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1` + `_PT_2` | Split across two bindings due to 1024-byte secret store limit. Concatenated at runtime. |
| Client email | `GOOGLE_CREDS_SA_CLIENT_EMAIL`               |                                                                                         |

## Access pattern

- Use `getGoogleServiceAccountPrivateKey(env)` from `src/backend/utils/secrets.ts` — it concatenates both key parts.
- Use `getGoogleServiceAccountClientEmail(env)` from `src/backend/utils/secrets.ts`.
- Do not call `env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1.get()` directly in route or agent code.

## Rules

- Do not add `googleapis`; use bare `fetch`.
- Access tokens are cached in KV with expiration `expires_in - 60s`.
- Drive and Docs helpers live in `src/backend/ai/tools/google-docs.ts`.
- The PKCS#1→PKCS#8 wrapper (`wrapPkcs1InPkcs8`) is exported from `src/backend/utils/secrets.ts` for Web Crypto API compatibility.

## Local Authentication Standards

- For Google/Passkey authentication tasks, ALWAYS prefer the branded `chrome` channel in Playwright over generic Chromium.
- Use `launchPersistentContext` to provide a stable environment for hardware-based authentication.
- Scripts must explicitly wait for user confirmation (`readline`) before extracting cookies from a manual login flow.
