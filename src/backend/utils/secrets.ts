/**
 * Generic helper to fetch a secret value.
 *
 * Precedence:
 * 1. KV Config (Metadata/Pointer) -> Secret Store (Value)
 * 2. Secrets Store (Direct Binding fallback)
 * 3. Environment Variable (Legacy/Local)
 *
 * CAUTION: This should ONLY be used for operations where the worker is retrieving a secret
 * from the secret-store in order to set the value inside of a GitHub repo, or other external provisioning.
 *
 * For standard Worker operations (using the key itself), use `env.{SECRET_BINDING_NAME}.get()` directly.
 */
export async function getSecret(env: Env, key: string): Promise<string | undefined> {
  // Check Secrets Store or Env Var Binding (Legacy behavior compliance)
  const envVal = (env as any)[key];
  if (envVal && typeof envVal?.get === "function") {
    const val = await envVal.get();
    return val;
  }
  return envVal;
}

/**
 * Helper to fetch the WORKER_API_KEY from the Secrets Store.
 * This key is exclusively for agent/automation access to the frontend.
 * It supports the ?AGENT_AUTH= URL query param auth path, which is NOT
 * available to the regular WORKER_API_KEY.
 */
export async function getWorkerApiKey(env: Env): Promise<string | undefined> {
  if (env.WORKER_API_KEY) {
    return typeof env.WORKER_API_KEY === "string"
      ? env.WORKER_API_KEY
      : await (env.WORKER_API_KEY as any).get();
  }
  return getSecret(env, "WORKER_API_KEY");
}

/**
 * Helper to fetch the AGENTIC_WORKER_API_KEY from the Secrets Store.
 * This key is exclusively for agent/automation access to the frontend.
 * It supports the ?AGENT_AUTH= URL query param auth path, which is NOT
 * available to the regular WORKER_API_KEY.
 */
export async function getAgenticWorkerApiKey(env: Env): Promise<string | undefined> {
  if (env.AGENTIC_WORKER_API_KEY) {
    return typeof env.AGENTIC_WORKER_API_KEY === "string"
      ? env.AGENTIC_WORKER_API_KEY
      : await env.AGENTIC_WORKER_API_KEY.get();
  }
  return getSecret(env, "AGENTIC_WORKER_API_KEY");
}

// export async function getGithubToken(env: Env): Promise<string | undefined> {
//     if (env.GITHUB_PERSONAL_ACCESS_TOKEN) {
//         return typeof env.GITHUB_PERSONAL_ACCESS_TOKEN === 'string'
//             ? env.GITHUB_PERSONAL_ACCESS_TOKEN
//             : await (env.GITHUB_PERSONAL_ACCESS_TOKEN as any).get();
//     }
//     return getSecret(env, "GITHUB_PERSONAL_ACCESS_TOKEN");
// }

/**
 * Helper to fetch the CLOUDFLARE_WRANGLER_API_TOKEN from the Secrets Store.
 */
export async function getCloudflareApiToken(env: Env): Promise<string | undefined> {
  if (env.CLOUDFLARE_WRANGLER_API_TOKEN) {
    return typeof env.CLOUDFLARE_WRANGLER_API_TOKEN === "string"
      ? env.CLOUDFLARE_WRANGLER_API_TOKEN
      : await (env.CLOUDFLARE_WRANGLER_API_TOKEN as any).get();
  }
  return getSecret(env, "CLOUDFLARE_WRANGLER_API_TOKEN");
}

/**
 * Helper to fetch the CLOUDFLARE_ACCOUNT_ID from the Secrets Store.
 */
export async function getCloudflareAccountId(env: Env): Promise<string | undefined> {
  if (env.CLOUDFLARE_ACCOUNT_ID) {
    return typeof env.CLOUDFLARE_ACCOUNT_ID === "string"
      ? env.CLOUDFLARE_ACCOUNT_ID
      : await (env.CLOUDFLARE_ACCOUNT_ID as any).get();
  }
  return getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
}

/**
 * NotebookLM Notebook ID
 * Helper to fetch the CAREER_NOTEBOOKLM_ID from wrangler.jsonc env vars.
 */
export async function getCareerNotebookLMId(env: Env): Promise<string> {
  if (env.CAREER_NOTEBOOKLM_ID) {
    return env.CAREER_NOTEBOOKLM_ID;
  }
  throw new Error("Missing env.CAREER_NOTEBOOKLM_ID in Environment Variables");
}

/**
 * NotebookLM Cookie Signing Key
 * Reads the COOKIE_SIGNING_KEY from KV (not Secrets Store) because this value
 * must be mutable at runtime for cookie rotation and re-authentication flows.
 */
export async function getNotebookLMCookieSigningKey(env: Env): Promise<string> {
  try {
    let key = await env.KV.get("NOTEBOOKLM_COOKIE_SIGNING_KEY");
    if (key) return key;

    // Auto-provision a new key if not found
    key = crypto.randomUUID();
    await env.KV.put("NOTEBOOKLM_COOKIE_SIGNING_KEY", key);
    return key;
  } catch (e) {
    console.warn("Failed to read/write NOTEBOOKLM_COOKIE_SIGNING_KEY from KV", e);
    return "default_dev_key_fallback";
  }
}

/**
 * NotebookLM Auth Token
 * Helper to fetch the NOTEBOOKLM_AUTH_TOKEN from the Secret Store.
 */
export async function getNotebookLMAuthToken(env: Env): Promise<string> {
  if (env.NOTEBOOKLM_AUTH_TOKEN) {
    return (await env.NOTEBOOKLM_AUTH_TOKEN.get()).trim();
  }
  throw new Error("Missing env.NOTEBOOKLM_AUTH_TOKEN in Environment Variables");
}

/**
 * NotebookLM Cookies — KV-Only Session Model
 *
 * Reads from KV `ACTIVE_NOTEBOOKLM_SESSION` — can be updated instantly at
 * runtime via the Config → NotebookLM Session UI or `pnpm run session:sync`.
 *
 * The Worker Secret `NOTEBOOKLM_COOKIES` fallback has been removed. It was
 * never updated and caused confusion in the credential resolution chain.
 */
export async function getNotebookLMCookies(env: Env): Promise<string> {
  try {
    const kvSession = await env.KV.get("ACTIVE_NOTEBOOKLM_SESSION");
    if (kvSession && kvSession.trim().length > 10) {
      return kvSession;
    }
  } catch {
    // KV read failed
  }

  throw new Error(
    `Missing NotebookLM session in KV (ACTIVE_NOTEBOOKLM_SESSION). 
        Update from Config → NotebookLM Session, or run: pnpm run session:sync`,
  );
}

/**
 * Google Workspace Service Account with Domain Wide Delegation Private Key
 * Helper to fetch the GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1 and GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2 from the Secret Store.
 *
 * Removes header/footer and newlines from PEM string for Web Crypto API compatibility
 */
export async function getGoogleServiceAccountPrivateKey(env: Env): Promise<string> {
  if (env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1 && env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2) {
    const rawKey =
      (await (env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1 as any).get()) +
      (await (env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2 as any).get());
    return rawKey
      .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, "")
      .replace(/-----END (RSA )?PRIVATE KEY-----/, "")
      .replace(/\s/g, "");
  }
  throw new Error(
    `Missing env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1 
        and/or env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2 in Secret Store Bindings`,
  );
}

/**
 * Google Workspace Service Account with Domain Wide Delegation Client Email
 * Helper to fetch the GOOGLE_CREDS_SA_CLIENT_EMAIL from the Secret Store.
 */
export async function getGoogleServiceAccountClientEmail(env: Env): Promise<string> {
  if (env.GOOGLE_CREDS_SA_CLIENT_EMAIL) {
    return typeof env.GOOGLE_CREDS_SA_CLIENT_EMAIL === "string"
      ? env.GOOGLE_CREDS_SA_CLIENT_EMAIL
      : await (env.GOOGLE_CREDS_SA_CLIENT_EMAIL as any).get();
  }
  throw new Error("Missing env.GOOGLE_CREDS_SA_CLIENT_EMAIL in Secret Store Bindings");
}

/**
 * Google Workspace User to Impersonate
 * Helper to fetch the GOOGLE_USER_TO_IMPERSONATE from worker secret (env binding that is a string, not a secret store binding).
 */
export async function getGoogleUserToImpersonate(env: Env): Promise<string> {
  if (env.GOOGLE_USER_TO_IMPERSONATE) {
    return env.GOOGLE_USER_TO_IMPERSONATE;
  }
  throw new Error(`
        Missing env.GOOGLE_USER_TO_IMPERSONATE in worker secret
        (e.g. via 'wrangler secret put GOOGLE_USER_TO_IMPERSONATE').
        Must be a string, not a secret store binding.
    `);
}

// ---------------------------------------------------------------------------
// COMMENTED OUT: getGoogleWorkspaceAccessToken
// ---------------------------------------------------------------------------
// This implementation is NOT cached and performs a fresh JWT → token exchange
// on every call. The production codebase uses `getServiceAccountAccessToken`
// from `src/backend/lib/google-auth.ts` instead, which caches tokens in KV
// with a TTL of (expires_in - 60) seconds.
//
// Keeping this code for reference in case Domain-Wide Delegation needs to
// be re-implemented with a different signing approach (PKCS#1 → PKCS#8 wrapping).
// ---------------------------------------------------------------------------

// /**
//  * Generates a Google OAuth2 Access Token using a Service Account with Domain-Wide Delegation.
//  * Optimized for Cloudflare Workers (Web Crypto API).
//  */
// export async function getGoogleWorkspaceAccessToken(env: Env, scope: string): Promise<string> {
//
//   const serviceAccountEmail = await getGoogleServiceAccountClientEmail(env);
//   const userToImpersonate = await getGoogleUserToImpersonate(env);
//   if (!serviceAccountEmail || !userToImpersonate) {
//     throw new Error(`
//       Missing Google Workspace credentials;
//       Service account email: ${serviceAccountEmail};
//       User to impersonate: ${userToImpersonate}
//     `);
//   }
//   // 1. Prepare the RSA Key for Web Crypto
//   const pemContents = await getGoogleServiceAccountPrivateKey(env);
//
//   const binaryString = atob(pemContents);
//   const pkcs1Der = new Uint8Array(binaryString.length);
//   for (let i = 0; i < binaryString.length; i++) {
//     pkcs1Der[i] = binaryString.charCodeAt(i);
//   }
//
//   // This ensures the key is in the PKCS#8 format required by Web Crypto
//   const pkcs8Buffer = wrapPkcs1InPkcs8(pkcs1Der);
//
//   const cryptoKey = await crypto.subtle.importKey(
//     "pkcs8",
//     pkcs8Buffer, // Using your wrapped buffer
//     {
//       name: "RSASSA-PKCS1-v1_5",
//       hash: { name: "SHA-256" },
//     },
//     false,
//     ["sign"]
//   );
//
//   // 2. Create the JWT Header and Claims
//   const now = Math.floor(Date.now() / 1000);
//   const header = { alg: "RS256", typ: "JWT" };
//   const payload = {
//     iss: serviceAccountEmail,
//     sub: userToImpersonate, // Domain-Wide Delegation target
//     scope: scope,           // e.g., "https://googleapis.com"
//     aud: "https://googleapis.com",
//     exp: now + 3600,
//     iat: now,
//   };
//
//   // Helper for Base64Url
//   const b64 = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
//
//   const encodedHeader = b64(header);
//   const encodedPayload = b64(payload);
//   const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
//
//   const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, dataToSign);
//   const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
//     .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
//
//   const response = await fetch("https://googleapis.com", {
//     method: "POST",
//     headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     body: new URLSearchParams({
//       grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
//       assertion: `${encodedHeader}.${encodedPayload}.${encodedSignature}`,
//     }),
//   });
//
//   const data = (await response.json()) as { access_token: string };
//   return data.access_token;
// }

/**
 * R2 Access Key ID
 * Helper to fetch the R2_ACCESS_KEY_ID from worker secret
 */
export async function getR2AccessKeyId(env: Env): Promise<string> {
  if (env.R2_ACCESS_KEY_ID) {
    return env.R2_ACCESS_KEY_ID;
  }
  throw new Error("Missing env.R2_ACCESS_KEY_ID in worker secret");
}

/**
 * R2 Secret Access Key
 * Helper to fetch the R2_SECRET_ACCESS_KEY from worker secret
 */
export async function getR2SecretAccessKey(env: Env): Promise<string> {
  if (env.R2_SECRET_ACCESS_KEY) {
    return env.R2_SECRET_ACCESS_KEY;
  }
  throw new Error("Missing env.R2_SECRET_ACCESS_KEY in worker secret");
}

// ---------------------------------------------------------------------------
// COMMENTED OUT: PKCS#1 → PKCS#8 wrapping helpers
// ---------------------------------------------------------------------------
// These were used by getGoogleWorkspaceAccessToken above. The production
// auth path in google-auth.ts uses PKCS#8 keys directly (standard PEM format).
// ---------------------------------------------------------------------------

// /**
//  * Wraps a raw PKCS#1 RSAPrivateKey DER byte array into a PKCS#8 PrivateKeyInfo DER envelope.
//  */
// export function wrapPkcs1InPkcs8(pkcs1Der: Uint8Array): ArrayBuffer {
//     const version = new Uint8Array([0x02, 0x01, 0x00]);
//     const rsaOidBytes = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
//     const algorithmIdentifier = encodeSequence(rsaOidBytes);
//     const privateKeyOctet = encodeTag(0x04, pkcs1Der);
//     const privateKeyInfo = encodeSequence(concatBytes(version, algorithmIdentifier, privateKeyOctet));
//     return privateKeyInfo.buffer.slice(privateKeyInfo.byteOffset, privateKeyInfo.byteOffset + privateKeyInfo.byteLength) as ArrayBuffer;
// }
//
// function encodeLength(len: number): Uint8Array {
//     if (len < 128) return new Uint8Array([len]);
//     if (len < 256) return new Uint8Array([0x81, len]);
//     return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
// }
//
// function encodeTag(tag: number, data: Uint8Array): Uint8Array {
//     return concatBytes(new Uint8Array([tag]), encodeLength(data.length), data);
// }
//
// function encodeSequence(data: Uint8Array): Uint8Array {
//     return encodeTag(0x30, data);
// }
//
// function concatBytes(...arrays: Uint8Array[]): Uint8Array {
//     const total = arrays.reduce((n, a) => n + a.length, 0);
//     const out = new Uint8Array(total);
//     let offset = 0;
//     for (const arr of arrays) { out.set(arr, offset); offset += arr.length; }
//     return out;
// }

/**
 * Helper to fetch the GitHub Webhook Secret.
 * Maps to WORKER_API_KEY in this project.
 */
export async function getGitHubWebhookSecret(env: Env): Promise<string> {
  if (env.WORKER_API_KEY) {
    const secret =
      typeof env.WORKER_API_KEY === "string"
        ? env.WORKER_API_KEY
        : await (env.WORKER_API_KEY as any).get();
    if (secret) return secret;
  }

  const secret = await getSecret(env, "WORKER_API_KEY");
  if (!secret) {
    throw new Error("Missing WORKER_API_KEY in Secrets Store");
  }
  return secret;
}

/**
 * Helper to fetch the Cloudflare Images Token.
 * Maps to CLOUDFLARE_IMAGES_STREAM_TOKEN in this project.
 */
export async function getCloudflareImagesToken(env: Env): Promise<string> {
  if (env.CLOUDFLARE_IMAGES_STREAM_TOKEN) {
    return typeof env.CLOUDFLARE_IMAGES_STREAM_TOKEN === "string"
      ? env.CLOUDFLARE_IMAGES_STREAM_TOKEN
      : await (env.CLOUDFLARE_IMAGES_STREAM_TOKEN as any).get();
  }
  throw new Error("Missing env.CLOUDFLARE_IMAGES_STREAM_TOKEN in Secret Store Bindings");
}

/**
 * Helper to fetch the OpenRoute API Key.
 * Maps to OPENROUTE_API_KEY in this worker secret binding.
 */
export async function getOpenRouteApiKey(env: Env): Promise<string> {
  if (env.OPENROUTE_API_KEY) {
    return typeof env.OPENROUTE_API_KEY === "string"
      ? env.OPENROUTE_API_KEY
      : await (env.OPENROUTE_API_KEY as any).get();
  }
  throw new Error("Missing env.OPENROUTE_API_KEY in Worker Secret Bindings");
}

/**
 * Helper to fetch the Google Maps API Key.
 * Maps to GOOGLE_MAPS_API in this worker secret binding.
 */
export async function getGoogleMapsApiKey(env: Env): Promise<string> {
  if (env.GOOGLE_MAPS_API) {
    return typeof env.GOOGLE_MAPS_API === "string"
      ? env.GOOGLE_MAPS_API
      : await (env.GOOGLE_MAPS_API as any).get();
  }
  throw new Error("Missing env.GOOGLE_MAPS_API in Worker Secret Bindings");
}

export async function getCloudflareAiGatewayUrl(env: Env): Promise<string> {
  const accountId = await getCloudflareAccountId(env);
  const gatewayId = env.AI_GATEWAY_ID;
  if (!accountId || !gatewayId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or AI_GATEWAY_ID for AI Gateway integration");
  }
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`;
}

/**
 * Helper to fetch the CLOUDFLARE_AI_GATEWAY_TOKEN from the Secrets Store.
 * Used by the AI Gateway /compat endpoint for authentication.
 */
export async function getCloudflareAiGatewayToken(env: Env): Promise<string> {
  if (env.CLOUDFLARE_AI_GATEWAY_TOKEN) {
    return typeof env.CLOUDFLARE_AI_GATEWAY_TOKEN === "string"
      ? env.CLOUDFLARE_AI_GATEWAY_TOKEN
      : await (env.CLOUDFLARE_AI_GATEWAY_TOKEN as any).get();
  }
  throw new Error("Missing env.CLOUDFLARE_AI_GATEWAY_TOKEN in Secret Store Bindings");
}
