import { AgentRulesEditor } from "@/components/config/AgentRulesEditor";
import { CareerStoriesEditor } from "@/components/config/CareerStoriesEditor";
import { CompensationEditor } from "@/components/config/CompensationEditor";
import { ApplicantProfileEditor } from "@/components/config/ApplicantProfileEditor";
import { NotebookLMPromptEditor } from "@/components/config/NotebookLMPromptEditor";
import { NotebookSessionManager } from "@/components/config/NotebookSessionManager";
import { PipelineConfigEditor } from "@/components/config/PipelineConfigEditor";
import { PipelineRulesEditor } from "@/components/config/PipelineRulesEditor";
import { PromoteCompaniesEditor } from "@/components/config/PromoteCompaniesEditor";
import { PromptEditor } from "@/components/config/PromptEditor";
import { ResumeBulletsEditor } from "@/components/config/ResumeBulletsEditor";
import { ScoringRubricsEditor } from "@/components/config/ScoringRubricsEditor";
import { TemplateIdsEditor } from "@/components/config/TemplateIdsEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParam } from "@/hooks/use-query-param";

/**
 * Full config page content rendered as a single React island.
 *
 * Previously Tabs/TabsTrigger/TabsContent were split across Astro and React,
 * causing SSR to crash with "Tabs components must be rendered inside <Tabs />"
 * because React Context from <Tabs> wasn't available to its children during
 * server-side rendering.
 */
export function ConfigTabs() {
  const [tab, setTab] = useQueryParam("tab", "prompts");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="prompts">Prompts &amp; Context</TabsTrigger>
        <TabsTrigger value="resume-data">Resume Data</TabsTrigger>
        <TabsTrigger value="agent-settings">Agent Settings</TabsTrigger>
        <TabsTrigger value="scoring-rubrics">Scoring Rubrics</TabsTrigger>
        <TabsTrigger value="doc-templates">Doc Templates</TabsTrigger>
        <TabsTrigger value="notebooklm">NotebookLM</TabsTrigger>
        <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
      </TabsList>

      <TabsContent value="prompts" className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <PromptEditor />
          <div className="space-y-5">
            <CompensationEditor />
            <ApplicantProfileEditor />
            <CareerStoriesEditor />
          </div>
        </div>
      </TabsContent>


      <TabsContent value="resume-data" className="space-y-5">
        <ResumeBulletsEditor />
      </TabsContent>

      <TabsContent value="agent-settings" className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <AgentRulesEditor />
        </div>
      </TabsContent>

      <TabsContent value="doc-templates" className="space-y-5">
        <TemplateIdsEditor />
      </TabsContent>

      <TabsContent value="scoring-rubrics" className="space-y-5">
        <ScoringRubricsEditor />
      </TabsContent>

      <TabsContent value="notebooklm" className="space-y-5">
        <NotebookSessionManager />
        <NotebookLMPromptEditor />
      </TabsContent>

      <TabsContent value="pipeline" className="space-y-5">
        <PipelineRulesEditor />
        <PromoteCompaniesEditor />
        <PipelineConfigEditor />
      </TabsContent>
    </Tabs>
  );
}
