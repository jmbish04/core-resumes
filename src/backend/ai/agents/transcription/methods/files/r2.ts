import type { getSandbox } from "@cloudflare/sandbox";

import { getCloudflareAccountId } from "@/utils/secrets";

export async function mountR2Bucket(env: Env, sandbox: Awaited<ReturnType<typeof getSandbox>>) {
  const accountId = await getCloudflareAccountId(env);
  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID — required for R2 S3 endpoint");
  }
  await sandbox.mountBucket(env.BUCKET_NAME_AUDIO, "/mnt/r2", {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  });
}

export async function cleanupR2Chunks(env: Env, chunksDir: string, chunkFiles: string[]) {
  for (const chunkFile of chunkFiles) {
    await env.R2_AUDIO_BUCKET.delete(`${chunksDir}/${chunkFile}`).catch(() => {});
  }
}
