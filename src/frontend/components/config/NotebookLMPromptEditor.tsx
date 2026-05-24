/**
 * @fileoverview NotebookLM Prompt Template Editor — accordion-based editor for
 * all artifact prompt templates stored in global_config. Displayed on the
 * Config page under the "NotebookLM Prompts" tab.
 */

import { InfoIcon, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiPut, toast } from "@/lib/api-client";

import { readConfig } from "./config-types";

type PromptConfig = {
  key: string;
  label: string;
  description: string;
};

const PROMPT_CONFIGS: PromptConfig[] = [
  {
    key: "notebooklm_prompt_podcast",
    label: "Podcast",
    description: "Instructions for generating NotebookLM podcast episodes about a role.",
  },
  {
    key: "notebooklm_prompt_mind_map",
    label: "Mind Map",
    description: "Instructions for generating visual mind maps of role aspects.",
  },
  {
    key: "notebooklm_prompt_report",
    label: "Report",
    description: "Instructions for generating detailed analysis reports.",
  },
  {
    key: "notebooklm_prompt_quiz",
    label: "Quiz",
    description: "Instructions for generating interview preparation quizzes.",
  },
  {
    key: "notebooklm_prompt_flashcards",
    label: "Flashcards",
    description: "Instructions for generating study flashcards.",
  },
  {
    key: "notebooklm_prompt_infographic",
    label: "Infographic",
    description: "Instructions for generating visual infographic summaries.",
  },
  {
    key: "notebooklm_prompt_slide_deck",
    label: "Slide Deck",
    description: "Instructions for generating presentation slide decks.",
  },
  {
    key: "notebooklm_prompt_data_table",
    label: "Data Table",
    description: "Instructions for generating comparative data tables.",
  },
  {
    key: "notebooklm_prompt_deep_research",
    label: "Deep Research",
    description: "Instructions for deep web research queries about a company and role.",
  },
];

const TEMPLATE_TAGS = [
  { tag: "{{jobTitle}}", description: 'The role\'s job title (e.g., "Senior Software Engineer")' },
  { tag: "{{companyName}}", description: 'The company name (e.g., "Google")' },
  {
    tag: "{{instruction}}",
    description:
      "User-provided instructions appended at runtime. Replaced with input or removed if empty.",
  },
];

export function NotebookLMPromptEditor() {
  return (
    <div className="grid gap-5">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Artifact Prompts</CardTitle>
          <CardDescription>
            Customize the default prompts used when generating artifacts. When generating an
            artifact from a role profile, you'll optionally be able to review and modify these
            prompts before they are sent to NotebookLM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Template tag reference */}
          <div className="mb-4 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Available Template Tags
            </div>
            <div className="grid gap-1.5">
              {TEMPLATE_TAGS.map((t) => (
                <div key={t.tag} className="flex items-baseline gap-2 text-sm">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                    {t.tag}
                  </code>
                  <span className="text-muted-foreground">{t.description}</span>
                </div>
              ))}
            </div>
          </div>

          <Accordion type="multiple" className="w-full">
            {PROMPT_CONFIGS.map((config) => (
              <PromptTemplateItem key={config.key} config={config} />
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

function PromptTemplateItem({ config }: { config: PromptConfig }) {
  const [value, setValue] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readConfig<string>(config.key, "").then((result) => {
      setValue(result.value);
      setIsDefault(result.isDefault);
      setLoading(false);
    });
  }, [config.key]);

  async function save() {
    setSaving(true);
    try {
      await apiPut(`/api/config/${config.key}`, { value });
      toast({ title: `${config.label} prompt saved` });
      setIsDefault(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccordionItem value={config.key}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <span>{config.label}</span>
          {isDefault && (
            <Badge variant="outline" className="text-[10px]">
              Default
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid gap-3 pt-1">
          <p className="text-sm text-muted-foreground">{config.description}</p>

          {isDefault && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
              <InfoIcon className="mt-0.5 size-4 shrink-0" />
              <span>Using default fallback value. Save a custom prompt to override.</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading template...
            </div>
          ) : (
            <>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={5}
                className="font-mono text-sm"
                placeholder="Enter your prompt template..."
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => void save()}
                  className="gap-1.5"
                >
                  <Save className="size-3.5" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
