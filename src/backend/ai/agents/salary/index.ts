/**
 * @fileoverview SalaryAgent — Cloudflare Agents SDK stateful Durable Object
 * designed for deep market salary trend analytics and custom Python-based simulations.
 *
 * ## Purpose
 * This agent manages statistical compensation operations:
 * 1. Broad trends analysis: Synthesizes entire market stats snapshots into rich markdown insights.
 * 2. Role-specific evaluation: Performs on-the-fly comparisons of role pay vs local, remote, and national percentiles.
 * 3. Dynamic Python Sandbox Execution: Uses Cloudflare Sandbox containers to safely run heavy data analysis,
 *    pre-loaded python scripts, and custom LLM-generated code simulations on-demand.
 *
 * ## Cost Management
 * To minimize usage fees, the sandbox container is immediately destroyed via
 * `await sandbox.destroy()` inside a strict `finally` block on every method invocation.
 *
 * @module salary-agent
 * @see {@link https://developers.cloudflare.com/agents/} Cloudflare Agents SDK
 * @see {@link https://developers.cloudflare.com/sandbox/} Cloudflare Sandbox SDK
 */

import { Agent, type Connection, callable } from "agents";
import { getSandbox, collectFile } from "@cloudflare/sandbox";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/backend/db";
import {
  marketSalarySnapshots,
  marketSalaryStats,
  marketCompanySalaries,
  marketSalaryInsights,
  marketSandboxRuns,
  globalConfig,
  roles,
} from "@/backend/db/schema";
import { AiProvider } from "@/backend/ai/providers";
import { checkHealth as healthProbeImpl } from "./health";

export class SalaryAgent extends Agent<Env, Record<string, never>> {
  // -------------------------------------------------------------------------
  // DO Lifecycle Hooks
  // -------------------------------------------------------------------------

  onConnect(connection: Connection): void {
    console.log(`[SalaryAgent] Client connected – id=${connection.id}`);
  }

  onClose(connection: Connection): void {
    console.log(`[SalaryAgent] Client disconnected – id=${connection.id}`);
  }

  @callable()
  async healthProbe() {
    return healthProbeImpl(this, this.env);
  }

  // -------------------------------------------------------------------------
  // Agent Methods
  // -------------------------------------------------------------------------

  /**
   * Run broad trend analysis over the latest ingested snapshot.
   * Leverages the Sandbox Python container for stats calculations,
   * then uses Workers AI to generate a detailed trend overview report.
   */
  async analyzeBroadTrends(): Promise<string> {
    const db = getDb(this.env);

    // 1. Fetch latest successful snapshot
    const [snapshot] = await db
      .select()
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    if (!snapshot) {
      throw new Error("No successful market salary snapshots available in D1.");
    }

    // 2. Retrieve statistics for the snapshot
    const stats = await db
      .select()
      .from(marketSalaryStats)
      .where(eq(marketSalaryStats.snapshotId, snapshot.id));

    const companySalaries = await db
      .select()
      .from(marketCompanySalaries)
      .where(eq(marketCompanySalaries.snapshotId, snapshot.id))
      .limit(100); // Sample top 100 entries for broad trends

    // 3. Spin up Cloudflare Sandbox container
    const sandboxId = `salary-broad-${Date.now()}`;
    const sandbox = getSandbox(this.env.SANDBOX, sandboxId, { sleepAfter: "5m" });

    try {
      // 4. Write inputs & execute pre-loaded analytics script
      await sandbox.writeFile(
        "/workspace/input_data.json",
        JSON.stringify({ stats, companySalaries, roleContext: { jobTitle: "Global Trends", companyName: "All Companies" } })
      );

      const runResult = await sandbox.exec("python3 /workspace/salary_analysis.py");
      if (!runResult.success) {
        throw new Error(`Sandbox python analysis failed: ${runResult.stderr}`);
      }

      // 5. Read computed metrics and validate output
      let results: any;
      try {
        const resultsText = await sandbox.readFile("/workspace/output_results.json");
        results = JSON.parse(resultsText);
        if (!results || typeof results !== "object") {
          throw new Error("Sandbox output is not a valid JSON object.");
        }
        if (!results.metrics) {
          throw new Error("Sandbox output is missing required 'metrics' property.");
        }
      } catch (fileOrJsonErr) {
        throw new Error(
          `Failed to read or parse broad trends sandbox output results. Raw stdout was: ${runResult.stdout}. Error: ${String(fileOrJsonErr)}`
        );
      }

      // Save raw sandbox run in D1
      await db.insert(marketSandboxRuns).values({
        snapshotId: snapshot.id,
        roleId: null,
        scriptType: "broad_trends",
        pythonScript: "Preloaded: /workspace/salary_analysis.py",
        rawOutput: results,
        status: "success",
      });

      // 6. Synthesis using Workers AI for high-fidelity markdown presentation
      const prompt = `You are a Senior Compensation Specialist and Career Coach.
Review the following aggregated market salary metrics and H1B company filing summaries computed inside our secure sandbox:

<SANDBOX_COMPUTED_METRICS>
${JSON.stringify(results.metrics, null, 2)}
</SANDBOX_COMPUTED_METRICS>

<SANDBOX_COMPANY_FILINGS_SAMPLE>
${JSON.stringify(results.companyFilings, null, 2)}
</SANDBOX_COMPANY_FILINGS_SAMPLE>

Your task: Fulfill the role of a data analyst. Synthesize these inputs into a premium, beautifully-structured markdown report on market-wide technology salary trends.
Include the following exact headings:
1. # Market Technology Salary Trends & Insights
2. ## Overview of Remote vs. Location Premia (Compute typical remote discount delta)
3. ## Geographical Benchmark Analysis (San Francisco Premiums vs. National averages)
4. ## Key H1B Corporate Filing Insights (Trends among top hiring companies)
5. ## Strategic Negotiation Action Plan (Actionable anchor limits and advice)

Be highly factual and professional. Avoid fluffy adjectives or hype. Include markdown tables where appropriate.`;

      const provider = new AiProvider(this.env);
      const output = await provider.generateStructuredOutput({
        messages: [
          { role: "system", content: "You are a precise, data-driven career agent. Output a valid JSON report." },
          { role: "user", content: prompt },
        ],
        schema: z.object({
          markdownReport: z.string().describe("The synthesized markdown report."),
        }),
        schemaName: "SalaryTrendsReport",
        temperature: 0.2,
      });

      const reportMarkdown = output.markdownReport;

      // 7. Persist insights into D1
      await db.insert(marketSalaryInsights).values({
        snapshotId: snapshot.id,
        insightText: reportMarkdown,
        metadata: {
          generatedAt: new Date().toISOString(),
          sampleStatsSize: stats.length,
          sampleCompanySize: companySalaries.length,
        },
      });

      return reportMarkdown;
    } catch (error) {
      try {
        await db.insert(marketSandboxRuns).values({
          snapshotId: snapshot?.id || null,
          roleId: null,
          scriptType: "broad_trends",
          pythonScript: "Preloaded: /workspace/salary_analysis.py",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (dbErr) {
        console.error("Failed to log failed broad trends sandbox run:", dbErr);
      }
      throw error;
    } finally {
      // 8. Crucial: Destroy Sandbox to prevent lingering container costs
      await sandbox.destroy();
      console.log(`[SalaryAgent] Cleaned up broad trends sandbox: ${sandboxId}`);
    }
  }

  /**
   * Run an on-the-fly detailed compensation assessment for a specific job role.
   * Offloads analysis computations directly to the pre-loaded python container.
   */
  async analyzeRoleCompensation(roleId: string): Promise<any> {
    const db = getDb(this.env);

    // 1. Fetch role record
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) {
      throw new Error(`Role with ID ${roleId} not found.`);
    }

    // 2. Fetch target profile configurations
    const [configRow] = await db
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);

    const profile = (configRow?.value as any) || {
      location: "San Francisco Bay Area",
      locations: ["san francisco", "sf", "bay area"],
      hubs: ["San Francisco", "New York", "Seattle", "Austin"],
      target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"],
    };

    // 3. Resolve role type match
    const jobTitleLower = role.jobTitle.toLowerCase();
    let matchingRoleType = profile.target_roles[0] || "software engineer";
    for (const type of profile.target_roles) {
      if (jobTitleLower.includes(type.toLowerCase())) {
        matchingRoleType = type;
        break;
      }
    }

    // 4. Fetch latest successful snapshot
    const [snapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    let stats: typeof marketSalaryStats.$inferSelect[] = [];
    let companySalaries: typeof marketCompanySalaries.$inferSelect[] = [];

    if (snapshot) {
      stats = await db
        .select()
        .from(marketSalaryStats)
        .where(
          sql`${marketSalaryStats.snapshotId} = ${snapshot.id} AND LOWER(${marketSalaryStats.roleType}) = ${matchingRoleType.toLowerCase()}`
        );

      if (role.companyName) {
        const cleanCompany = role.companyName.toLowerCase().replace(/, inc\.?| inc\.?| l\.?l\.?c\.?/g, "").trim();
        companySalaries = await db
          .select()
          .from(marketCompanySalaries)
          .where(
            sql`${marketCompanySalaries.snapshotId} = ${snapshot.id} AND LOWER(${marketCompanySalaries.companyName}) LIKE ${"%" + cleanCompany + "%"}`
          );
      }
    }

    // 5. Spin up container sandbox
    const sandboxId = `salary-role-${roleId}-${Date.now()}`;
    const sandbox = getSandbox(this.env.SANDBOX, sandboxId, { sleepAfter: "5m" });

    try {
      // 6. Write inputs and execute pre-loaded script
      await sandbox.writeFile(
        "/workspace/input_data.json",
        JSON.stringify({
          stats,
          companySalaries,
          roleContext: {
            jobTitle: role.jobTitle,
            companyName: role.companyName,
            salaryMin: role.salaryMin,
            salaryMax: role.salaryMax,
          },
        })
      );

      const execResult = await sandbox.exec("python3 /workspace/salary_analysis.py");
      if (!execResult.success) {
        throw new Error(`Role salary analysis container execution failed: ${execResult.stderr}`);
      }

      // 7. Parse and validate results
      let results: any;
      try {
        const resultsText = await sandbox.readFile("/workspace/output_results.json");
        results = JSON.parse(resultsText);
        if (!results || typeof results !== "object") {
          throw new Error("Sandbox output is not a valid JSON object.");
        }
      } catch (fileOrJsonErr) {
        throw new Error(
          `Failed to read or parse role compensation sandbox output. Raw stdout was: ${execResult.stdout}. Error: ${String(fileOrJsonErr)}`
        );
      }

      // Save raw sandbox run in D1
      await db.insert(marketSandboxRuns).values({
        snapshotId: snapshot?.id || null,
        roleId: roleId,
        scriptType: "role_compensation",
        pythonScript: "Preloaded: /workspace/salary_analysis.py",
        rawOutput: results,
        status: "success",
      });

      // Synthesis using Workers AI to interpret the raw results and draw observations
      const interpretPrompt = `You are a Senior Executive Compensation Coach.
Review the following raw statistical salary calculations and H1B matching data computed inside our Sandbox for the job title "${role.jobTitle}" at "${role.companyName}":

<RAW_COMPUTATION_RESULTS>
${JSON.stringify(results, null, 2)}
</RAW_COMPUTATION_RESULTS>

Analyze these results and generate deep AI insights, observations, and context-aware advice for the candidate. Focus on:
1. Is the advertised range competitive compared to remote and local SF Bay Area percentiles?
2. What are the key negotiation anchors (floor, target, ceiling) backed by H1B filings for "${role.companyName}"?
3. What strategic advice would you give Justin to maximize his total compensation for this specific role?

Provide a concise, direct, and premium markdown summary. Do NOT repeat the raw statistics — focus on the strategic "observations" and "negotiation advice".`;

      const provider = new AiProvider(this.env);
      const interpretOutput = await provider.generateStructuredOutput({
        messages: [
          { role: "system", content: "You are a professional compensation analyst. Output JSON." },
          { role: "user", content: interpretPrompt },
        ],
        schema: z.object({
          aiInsights: z.string().describe("Synthesized executive compensation observations & advice."),
        }),
        schemaName: "RoleCompensationInsights",
        temperature: 0.3,
      });

      // Enrich the results with the AI observations
      results.aiInsights = interpretOutput.aiInsights;
      return results;
    } catch (error) {
      try {
        await db.insert(marketSandboxRuns).values({
          snapshotId: snapshot?.id || null,
          roleId: roleId,
          scriptType: "role_compensation",
          pythonScript: "Preloaded: /workspace/salary_analysis.py",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (dbErr) {
        console.error("Failed to log failed role sandbox run:", dbErr);
      }
      throw error;
    } finally {
      // 8. Crucial: Clean up Sandbox
      await sandbox.destroy();
      console.log(`[SalaryAgent] Cleaned up role sandbox: ${sandboxId}`);
    }
  }

  /**
   * Conduct interactive context-aware salary Q&A for chat clients.
   * If a complex simulation or customized script calculation is required,
   * the agent automatically compiles a custom python script, runs it inside the container,
   * reads output, and responds with backed findings.
   */
  async answerSalaryQuestion(query: string, roleId?: string): Promise<string> {
    const db = getDb(this.env);
    const logger = new AiProvider(this.env);

    // 1. Fetch role context if scoped
    let roleRecord: typeof roles.$inferSelect | undefined;
    if (roleId) {
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      roleRecord = role ?? undefined;
    }

    // 2. Fetch latest stats snapshots
    const [snapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    let statsSample: typeof marketSalaryStats.$inferSelect[] = [];
    if (snapshot) {
      statsSample = await db
        .select()
        .from(marketSalaryStats)
        .where(eq(marketSalaryStats.snapshotId, snapshot.id))
        .limit(20);
    }

    // 3. Prompt Workers AI to determine if a custom Python simulation script is needed to resolve the query.
    // For queries like: "simulate compound growth of SF median vs national median over 15 years", a python script is best.
    const triagePrompt = `User question: "${query}"
Context role: ${JSON.stringify(roleRecord || "No active role")}
Available stats sample: ${JSON.stringify(statsSample)}

Does answering this question accurately and with heavy-duty statistics require generating and executing a custom Python script inside our isolated sandbox?
(e.g., compound calculations, multi-year forecasts, complex inflation indices, monte carlo negotiation scenarios).
Reply with a valid JSON schema containing 'requiresCustomScript' (boolean) and 'rationale' (string).`;

    const triage = await logger.generateStructuredOutput({
      messages: [
        { role: "system", content: "You are a triaging router. Output JSON." },
        { role: "user", content: triagePrompt },
      ],
      schema: z.object({
        requiresCustomScript: z.boolean(),
        rationale: z.string(),
      }),
      schemaName: "SandboxTriage",
      temperature: 0.1,
    });

    if (triage.requiresCustomScript) {
      console.log(`[SalaryAgent] Routing query to custom Python sandbox. Rationale: ${triage.rationale}`);
      const sandboxId = `salary-custom-${Date.now()}`;
      const sandbox = getSandbox(this.env.SANDBOX, sandboxId, { sleepAfter: "5m" });

      try {
        // Formulate custom python script via Workers AI
        const pythonGeneratorPrompt = `User question: "${query}"
Context role: ${JSON.stringify(roleRecord || "No active role")}
D1 stats sample: ${JSON.stringify(statsSample)}

Your task: Generate a complete, standalone Python 3 script that computes the necessary calculations and performs data analysis to perfectly answer the user's question.
The script has access to:
- Standard Python libraries (math, json, os, sys)
- Data science packages: pandas, numpy, matplotlib.pyplot

The script MUST:
1. Load the inputs from the JSON file "/workspace/custom_inputs.json" (specifically under keys 'statsSample', 'roleRecord', and 'query').
2. Compute the exact statistics requested (e.g. multi-year projections, compound growth curves, percentile deciles) using pandas/numpy if helpful.
3. Save a beautiful, highly polished data visualization chart to "/workspace/chart.png" if the presentation would benefit from a graphical representation (e.g. trend curves, comparison bar charts, salary distributions). Use a modern aesthetic style for the chart.
4. Print a beautifully-structured JSON dictionary to stdout containing all variables, final computed stats, and success flag, formatted exactly as:
   \`{"success": true, "result": {...}, "markdownSummary": "..."}\`
5. Avoid any raw explanatory text on stdout other than the JSON output.

Generate only the executable Python script. Do NOT wrap in markdown fences.`;

        const scriptResponse = await logger.generateStructuredOutput({
          messages: [
            { role: "system", content: "You are a software engineer. Output JSON with a single key 'pythonScript'." },
            { role: "user", content: pythonGeneratorPrompt },
          ],
          schema: z.object({
            pythonScript: z.string().describe("Standalone executable Python script."),
          }),
          schemaName: "PythonGenerator",
          temperature: 0.1,
        });

        // Write the custom generated script to the sandbox and run it
        await sandbox.writeFile("/workspace/custom_analysis.py", scriptResponse.pythonScript);
        
        // Write the inputs to `/workspace/custom_inputs.json` for reference
        await sandbox.writeFile("/workspace/custom_inputs.json", JSON.stringify({ statsSample, roleRecord, query }));

        const execResult = await sandbox.exec("python3 /workspace/custom_analysis.py");
        if (!execResult.success) {
          // Save failed custom run
          await db.insert(marketSandboxRuns).values({
            snapshotId: snapshot?.id || null,
            roleId: roleId || null,
            scriptType: "custom_qa",
            pythonScript: scriptResponse.pythonScript,
            status: "failed",
            errorMessage: execResult.stderr,
          });

          return `I attempted to simulate your scenario in our Python container, but the script hit an execution error:
\`\`\`
${execResult.stderr}
\`\`\`
Please try rephrasing your calculation request.`;
        }

        let parsedOutput: any = { rawStdout: execResult.stdout };
        try {
          const trimmedStdout = execResult.stdout.trim();
          // Find first JSON boundaries in case there is trailing/leading debug info
          const jsonStartIndex = trimmedStdout.indexOf("{");
          const jsonEndIndex = trimmedStdout.lastIndexOf("}");
          if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
            const jsonSubstring = trimmedStdout.substring(jsonStartIndex, jsonEndIndex + 1);
            parsedOutput = JSON.parse(jsonSubstring);
          } else {
            parsedOutput = JSON.parse(trimmedStdout);
          }
          if (!parsedOutput || typeof parsedOutput !== "object") {
            parsedOutput = { rawStdout: execResult.stdout };
          }
        } catch (jsonErr) {
          console.warn("[SalaryAgent] Custom Q&A sandbox output was not valid JSON, using raw fallback:", jsonErr);
        }

        // Check if a visualization chart was saved to /workspace/chart.png
        let chartUrl: string | undefined;
        try {
          const stream = await sandbox.readFileStream("/workspace/chart.png");
          const { content } = await collectFile(stream);
          if (content instanceof Uint8Array && content.length > 0) {
            const fileKey = `salary-charts/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;
            await this.env.R2_FILES_BUCKET.put(fileKey, content, {
              httpMetadata: { contentType: "image/png" },
            });
            chartUrl = `/api/files/${fileKey}`;
            console.log(`[SalaryAgent] Custom chart uploaded successfully: ${chartUrl}`);
          }
        } catch (err) {
          // No chart generated or read failed — no problem, visual presentation is optional
          console.log("[SalaryAgent] Optional sandbox custom chart not generated or read failed:", err);
        }

        // Save raw sandbox run in D1
        await db.insert(marketSandboxRuns).values({
          snapshotId: snapshot?.id || null,
          roleId: roleId || null,
          scriptType: "custom_qa",
          pythonScript: scriptResponse.pythonScript,
          rawOutput: { ...parsedOutput, chartUrl },
          status: "success",
        });

        // Workers AI interprets the python script results to draw out AI insights and observations!
        const interpretQAPrompt = `User question: "${query}"
The agent generated a custom Python script to calculate the mathematical and statistical benchmarks.
Here is the raw output from executing that script:

<RAW_SANDBOX_OUTPUT>
${execResult.stdout}
</RAW_SANDBOX_OUTPUT>
${chartUrl ? `\n<CUSTOM_VISUALIZATION_CHART_URL>\n${chartUrl}\n</CUSTOM_VISUALIZATION_CHART_URL>\n` : ""}

Your task: Fulfill the role of a data analyst. Interpret the raw calculations, draw out key observations and AI insights, and construct a premium, context-aware answer that resolves the user's question perfectly.
${chartUrl ? `IMPORTANT: You must embed the custom visualization chart in your final markdown answer exactly as: ![Salary Analysis Chart](${chartUrl})` : ""}
Focus on explaining the numbers and providing strategic observations.`;

        const qaInterpret = await logger.generateStructuredOutput({
          messages: [
            { role: "system", content: "You are Colby's Salary Intelligence Agent. Output JSON." },
            { role: "user", content: interpretQAPrompt },
          ],
          schema: z.object({
            markdownAnswer: z.string().describe("The interpreted answer explaining results and observations."),
          }),
          schemaName: "CustomQAInterpretation",
          temperature: 0.3,
        });

        return qaInterpret.markdownAnswer;
      } finally {
        await sandbox.destroy();
        console.log(`[SalaryAgent] Cleaned up custom Q&A sandbox: ${sandboxId}`);
      }
    } else {
      // 4. Standard semantic Q&A using Workers AI directly without sandbox execution
      const answerPrompt = `User question: "${query}"
Context role: ${JSON.stringify(roleRecord || "No active role")}
Available stats sample: ${JSON.stringify(statsSample)}

Provide a direct, factual, and extremely professional answer to the user's question backed by the available market statistics. Use markdown lists and clean numbers.`;

      const response = await logger.generateStructuredOutput({
        messages: [
          { role: "system", content: "You are Colby's Salary Intelligence Agent. Answer concisely." },
          { role: "user", content: answerPrompt },
        ],
        schema: z.object({
          markdownAnswer: z.string(),
        }),
        schemaName: "SalaryAgentAnswer",
        temperature: 0.3,
      });

      return response.markdownAnswer;
    }
  }

  // -------------------------------------------------------------------------
  // Docs Metadata for /api/docs/agents
  // -------------------------------------------------------------------------

  static docsMetadata() {
    return {
      name: "Salary Intelligence",
      className: "SalaryAgent",
      description:
        "Autonomous compensation agent. Utilizes secure Cloudflare Sandbox containers to safely run heavy data analysis, " +
        "pre-loaded python scripts, and custom LLM-generated code simulations on-demand to deliver salary trends & negotiation advice.",
      docsPath: "/docs/agents/salary",
      invocationPattern: "Worker → Agent DO RPC via getAgentByName. Sandbox isolated execution.",
      methods: [
        {
          name: "analyzeBroadTrends",
          description: "Synthesizes recent snapshots into D1 markdown insight reports using python calculations & Workers AI.",
          params: "",
          returns: "Promise<string>",
        },
        {
          name: "analyzeRoleCompensation",
          description: "Runs role-specific pay assessment on-the-fly inside the Sandbox environment.",
          params: "roleId: string",
          returns: "Promise<any>",
        },
        {
          name: "answerSalaryQuestion",
          description: "Performs Q&A with dynamic LLM-to-python script sandbox simulation fallbacks.",
          params: "query: string, roleId?: string",
          returns: "Promise<string>",
        },
      ],
    };
  }
}
