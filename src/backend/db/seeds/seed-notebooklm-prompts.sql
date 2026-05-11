-- Seed NotebookLM prompt templates into global_config.
-- Uses INSERT OR IGNORE to avoid overwriting user-customized prompts on re-run.

INSERT OR IGNORE INTO global_config (key, value, updated_at) VALUES
(
  'notebooklm_prompt_podcast',
  '"Create a podcast episode discussing the role \"{{jobTitle}}\" at {{companyName}}. Cover the key responsibilities, required qualifications, and how my career background aligns with this opportunity. Make it conversational, insightful, and highlight both strengths and areas to prepare for.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_mind_map',
  '"Create a mind map that organizes the key aspects of the role \"{{jobTitle}}\" at {{companyName}}. Include branches for: core responsibilities, required skills, preferred qualifications, compensation factors, company culture, and career growth potential.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_report',
  '"Create a detailed analysis report for the role \"{{jobTitle}}\" at {{companyName}}. Include sections on: role overview, qualification alignment, skill gap analysis, compensation benchmarking, company research, and strategic recommendations for positioning.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_quiz',
  '"Create an interview preparation quiz for the \"{{jobTitle}}\" role at {{companyName}}. Include technical questions, behavioral questions (STAR format), and situational questions. For each question, provide a model answer drawing from my career evidence.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_flashcards',
  '"Create study flashcards for preparing for the \"{{jobTitle}}\" role at {{companyName}}. Cover key technical concepts, company-specific knowledge, role requirements, and behavioral interview talking points with evidence from my career history.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_infographic',
  '"Create a visual infographic summarizing the \"{{jobTitle}}\" role at {{companyName}}. Highlight key metrics: salary range, required experience, top skills, company size, and my qualification match percentage.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_slide_deck',
  '"Create a presentation about the \"{{jobTitle}}\" role at {{companyName}}. Structure it as: 1) Role Overview, 2) Company Background, 3) My Qualification Alignment, 4) Key Strengths, 5) Areas to Address, 6) Interview Strategy, 7) Next Steps.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_data_table',
  '"Create a comparative data table analyzing the \"{{jobTitle}}\" role at {{companyName}}. Include columns for: requirement, my evidence, strength level (1-5), gap analysis, and preparation notes.{{instruction}}"',
  unixepoch()
),
(
  'notebooklm_prompt_deep_research',
  '"Research the company {{companyName}} and the role \"{{jobTitle}}\". Focus on: company culture, recent news and developments, hiring manager background, interview tips from employee reviews, competitive landscape, and any insider knowledge that would help with the application.{{instruction}}"',
  unixepoch()
);
