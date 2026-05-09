import { getGoogleUserToImpersonate } from "@/backend/utils/secrets";

import { encodeBase64Url, hmacSign, toBase64Url } from "./crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function getServiceAccountAccessToken(env: Env, scopes: string[]): Promise<string> {
  const clientEmail = await env.GOOGLE_CREDS_SA_CLIENT_EMAIL.get();
  const userToImpersonate = await getGoogleUserToImpersonate(env);
  const cacheKey = await tokenCacheKey(clientEmail, userToImpersonate, scopes);
  const cached = await env.KV.get(cacheKey);

  if (cached) {
    return cached;
  }

  const assertion = await buildJwt(env, clientEmail, scopes);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Google service-account token exchange failed: ${response.status} ${await response.text()}`,
    );
  }

  const token = (await response.json()) as { access_token: string; expires_in: number };
  await env.KV.put(cacheKey, token.access_token, {
    expirationTtl: Math.max(60, token.expires_in - 60),
  });

  return token.access_token;
}

async function buildJwt(env: Env, clientEmail: string, scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const userToImpersonate = await getGoogleUserToImpersonate(env);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: clientEmail,
      sub: userToImpersonate, // Domain-Wide Delegation: impersonate this Workspace user
      scope: scopes.join(" "),
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(await getPrivateKey(env));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

async function getPrivateKey(env: Env): Promise<string> {
  const part1 = await env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1.get();
  const part2 = await env.GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2.get();

  return `${part1}${part2}`.replace(/\\n/g, "\n");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function tokenCacheKey(clientEmail: string, sub: string, scopes: string[]): Promise<string> {
  return `google:sa:${await hmacSign(clientEmail, `${sub}:${scopes.slice().sort().join(" ")}`)}`;
}
