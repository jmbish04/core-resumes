/**
 * @fileoverview Top-level MCP tool registration — wires every domain
 * tool module onto the agent's `McpServer` instance.
 */
import { registerCompanyTools } from "./tools/companies";
import { registerConfigTools } from "./tools/config";
import { registerDocsTools } from "./tools/docs";
import { registerFreelanceTools } from "./tools/freelance";
import { registerHealthTools } from "./tools/health";
import { registerMemoryTools } from "./tools/memory";
import { registerNotebookTools } from "./tools/notebook";
import { registerPipelineTools } from "./tools/pipeline";
import { registerRoleDocumentTools } from "./tools/role-documents";
import { registerRoleTools } from "./tools/roles";
import { registerSalaryTools } from "./tools/salary";

import type { CoreResumesMcpAgent } from "../index";

export async function initMcpServer(agent: CoreResumesMcpAgent, env: Env) {
  registerRoleTools(agent, env);
  registerRoleDocumentTools(agent, env);
  registerPipelineTools(agent, env);
  registerCompanyTools(agent, env);
  registerFreelanceTools(agent, env);
  registerSalaryTools(agent, env);
  registerNotebookTools(agent, env);
  registerMemoryTools(agent, env);
  registerConfigTools(agent, env);
  registerHealthTools(agent, env);
  registerDocsTools(agent, env);
}
