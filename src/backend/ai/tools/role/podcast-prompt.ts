/**
 * @fileoverview Prompt builder for NotebookLM role-specific podcast requests.
 *
 * NotebookLM podcast creation is triggered via chat, not the SDK artifact
 * creation API. This module keeps the long-form prompt deterministic and tied
 * to the uploaded role source filename so artifact polling can remain separate.
 */

/** Inputs required to build a role-specific NotebookLM podcast prompt. */
export type RolePodcastPromptInput = {
  /** Markdown source filename uploaded to NotebookLM. */
  roleSourceFileName: string;
  /** Hiring company name for framing the episode. */
  companyName: string;
  /** Job title for framing the episode. */
  jobTitle: string;
};

/**
 * Build the NotebookLM chat prompt that asks NotebookLM to start podcast creation.
 *
 * The prompt intentionally references the uploaded markdown filename and asks
 * NotebookLM to combine that source with Justin's existing career notebook
 * material. It does not call `artifacts.createAudio`; NotebookLM decides how to
 * start the podcast from the chat instruction.
 */
export function buildRolePodcastPrompt(input: RolePodcastPromptInput): string {
  return `Use the uploaded job role source named "${input.roleSourceFileName}".
The role is "${input.jobTitle}" at "${input.companyName}".
This notebook already contains Justin's career information sources; incorporate them as evidence.

Please start creating a custom podcast episode for this role. The episode should:
1. Break down the role completely, including responsibilities, requirements, signals, risks, and red flags.
2. Discuss how the role relates to Justin's background, strengths, gaps, and likely positioning.
3. Role-play an interview session: one host acts as the hiring manager, and the other host acts as Justin responding to questions.
4. Follow the role-play with a hiring committee debrief covering real-world pros and cons of considering Justin for this role.
5. Coach Justin on how to prepare for harder questions, criticisms, and concerns, including stronger answer angles.
6. End with a practical assessment of whether Justin should apply, how likely he is to get it, and realistic salary expectations.

If podcast generation is available, begin the podcast creation now and reply with confirmation that it has started.`;
}
