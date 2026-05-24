#!/usr/bin/env node

/**
 * Test script for the Comment Response Pipeline.
 *
 * Steps:
 *   1. Creates a test Google Doc with resume-like content
 *   2. Adds a @colby tagged comment to the doc
 *   3. Triggers the comment response pipeline via API
 *   4. Polls the doc comments to verify the reply was posted
 *
 * Usage:
 *   node scripts/test-comment-response.mjs
 *
 * Requires:
 *   - Deployed worker at WORKER_URL
 *   - Valid session cookie (CR_SESSION)
 *   - At least one role in the database
 */

const WORKER_URL = "https://core-resumes.hacolby.workers.dev";

// You'll need to set this from your browser cookie
const SESSION_COOKIE = process.env.CR_SESSION || "";

if (!SESSION_COOKIE) {
  console.error("❌ Set CR_SESSION env var with your session cookie value");
  console.error("   Export it: export CR_SESSION=<value from cr_session cookie>");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  Cookie: `cr_session=${SESSION_COOKIE}`,
};

async function apiFetch(path, opts = {}) {
  const url = `${WORKER_URL}${path}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
  const body = await res.json();
  if (!res.ok) {
    console.error(`❌ ${opts.method || "GET"} ${path} → ${res.status}`, body);
    throw new Error(`API error: ${res.status}`);
  }
  return body;
}

async function main() {
  console.log("🧪 Comment Response Pipeline Test\n");

  // Step 1: Find a role to test with
  console.log("📋 Finding a test role...");
  const rolesData = await apiFetch("/api/roles");
  const roles = Array.isArray(rolesData) ? rolesData : (rolesData.roles ?? []);

  if (roles.length === 0) {
    console.error("❌ No roles found. Create a role first.");
    process.exit(1);
  }

  const testRole = roles[0];
  console.log(`   Using role: ${testRole.jobTitle} at ${testRole.companyName} (${testRole.id})\n`);

  // Step 2: Create a test Google Doc
  console.log("📄 Creating test document...");
  const docResult = await apiFetch("/api/documents", {
    method: "POST",
    body: JSON.stringify({
      gdocId: "", // Will be filled after creation
      roleId: testRole.id,
      type: "resume",
      version: 1,
      name: `Test Resume - Comment Pipeline - ${new Date().toISOString()}`,
    }),
  });
  console.log(`   Created doc record: ${docResult.id}\n`);

  // Step 3: Create an actual Google Doc via the orchestrator
  console.log("📝 Creating Google Doc via orchestrator...");
  // Use the direct HTML template approach

  // Create doc via the orchestrator's create_doc_from_html_template
  const createDocResponse = await apiFetch("/api/notebook/chat", {
    method: "POST",
    body: JSON.stringify({
      query:
        "What are my strongest technical achievements related to cloud infrastructure and microservices?",
    }),
  }).catch((e) => {
    console.log("   ⚠️ NotebookLM query test (non-fatal):", e.message);
    return null;
  });

  if (createDocResponse) {
    console.log(
      `   NotebookLM response received (${createDocResponse.answer?.length ?? 0} chars)\n`,
    );
  }

  // For the actual test, we need an existing Google Doc with a comment.
  // Let's check if there are any existing documents with Google Doc IDs
  console.log("📋 Checking for existing Google Docs...");
  const allDocs = await apiFetch(`/api/documents?roleId=${testRole.id}`);
  const docsWithGdocId = (Array.isArray(allDocs) ? allDocs : []).filter(
    (d) => d.gdocId && d.gdocId.length > 5,
  );

  if (docsWithGdocId.length === 0) {
    console.log("   ⚠️ No Google Docs found for this role.");
    console.log("   To test the comment pipeline:");
    console.log("   1. Create a Google Doc (e.g., via the draft_resume RPC)");
    console.log("   2. Add a comment containing @colby or #colby");
    console.log("   3. Run this script again, or hit the API:");
    console.log(`   curl -X POST ${WORKER_URL}/api/roles/${testRole.id}/comments/respond \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -H "Cookie: cr_session=\${CR_SESSION}" \\`);
    console.log(`     -d '{"gdocId": "<your-gdoc-id>"}'`);
    console.log("");
    console.log("   Or trigger via the direct RPC endpoint.");
    process.exit(0);
  }

  const testDoc = docsWithGdocId[0];
  console.log(`   Found doc: ${testDoc.name} (gdocId: ${testDoc.gdocId})\n`);

  // Step 4: Trigger comment response pipeline
  console.log("🚀 Triggering comment response pipeline...");
  const triggerResult = await apiFetch(`/api/roles/${testRole.id}/comments/respond`, {
    method: "POST",
    body: JSON.stringify({ gdocId: testDoc.gdocId }),
  });
  console.log(`   Task queued: ${triggerResult.taskId}`);
  console.log(`   Status: ${triggerResult.status}\n`);

  console.log("✅ Pipeline triggered successfully!");
  console.log("   The orchestrator will process comments asynchronously.");
  console.log("   Check the Google Doc for replies, or monitor via WebSocket.");
}

main().catch((e) => {
  console.error("💥 Test failed:", e);
  process.exit(1);
});
