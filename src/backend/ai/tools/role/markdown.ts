/**
 * @fileoverview Markdown serialization for role intake records.
 *
 * This helper creates a stable NotebookLM-friendly source when scraping failed
 * or only structured/manual intake fields are available.
 */

/** Structured fields used to serialize a role into markdown. */
export type RoleMarkdownInput = {
  companyName: string;
  jobTitle: string;
  jobUrl?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  roleInstructions?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Build a deterministic markdown document from role fields and metadata.
 *
 * NotebookLM source uploads benefit from clear headings and list-shaped fields.
 * Unknown metadata is serialized as JSON only at the end to avoid hiding the
 * most important user-entered role fields in a raw object dump.
 */
export function buildRoleMarkdown(input: RoleMarkdownInput): string {
  const lines: string[] = [`# ${input.jobTitle}`, "", `**Company:** ${input.companyName}`];

  if (input.jobUrl) lines.push(`**Job URL:** ${input.jobUrl}`);
  const salary = formatSalary(input.salaryMin, input.salaryMax, input.salaryCurrency ?? undefined);
  if (salary) lines.push(`**Salary:** ${salary}`);
  if (input.roleInstructions) {
    lines.push("", "## Role-specific Instructions", input.roleInstructions);
  }

  const metadata = input.metadata ?? {};
  appendString(lines, "Location", metadata.location);
  appendString(lines, "Workplace Type", metadata.workplaceType);
  appendString(lines, "Department", metadata.department);
  appendString(lines, "Reporting To", metadata.reportingTo);
  appendString(lines, "RTO / Schedule Policy", metadata.rtoPolicy);
  appendString(lines, "Travel Requirements", metadata.travelRequirements);
  appendString(lines, "Security Clearance", metadata.securityClearance);
  appendString(lines, "Visa Sponsorship", metadata.visaSponsorship);
  appendList(lines, "Responsibilities", metadata.responsibilities);
  appendList(lines, "Required Qualifications", metadata.requiredQualifications);
  appendList(lines, "Preferred Qualifications", metadata.preferredQualifications);
  appendList(lines, "Required Skills", metadata.requiredSkills);
  appendList(lines, "Preferred Skills", metadata.preferredSkills);
  appendList(lines, "Education Requirements", metadata.educationRequirements);
  appendList(lines, "Benefits", metadata.benefits);
  appendString(lines, "Additional Notes", metadata.additionalNotes);

  lines.push("", "## Raw Metadata", "```json", JSON.stringify(metadata, null, 2), "```");
  return lines.join("\n").trim() + "\n";
}

/** Format the optional salary range into a compact display string. */
function formatSalary(min?: number | null, max?: number | null, currency = "USD"): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null)
    return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`;
  if (min != null) return `${currency} ${min.toLocaleString()}+`;
  return `${currency} up to ${max!.toLocaleString()}`;
}

/** Append a scalar metadata section when the value is a non-empty string. */
function appendString(lines: string[], title: string, value: unknown): void {
  if (typeof value !== "string" || !value.trim()) return;
  lines.push("", `## ${title}`, value.trim());
}

/** Append a list metadata section when the value contains strings. */
function appendList(lines: string[], title: string, value: unknown): void {
  if (!Array.isArray(value)) return;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  if (items.length === 0) return;
  lines.push("", `## ${title}`, ...items.map((item) => `- ${item.trim()}`));
}
