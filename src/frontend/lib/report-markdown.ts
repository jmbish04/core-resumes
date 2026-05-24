export function generateRoleReportMarkdown(
  payload: any,
  fetchedDocs: Record<string, string>,
): string {
  const {
    role,
    analysis,
    alignmentScores,
    bullets,
    bulletAnalyses,
    mockInterviews,
    careerMemory,
    documents,
  } = payload;

  let md = `# Role Analysis Report: ${role.companyName} - ${role.jobTitle}\n\n`;

  // Role details
  md += `## Role Details\n`;
  if (role.salaryMin || role.salaryMax) {
    md += `- **Compensation**: ${role.salaryCurrency ?? "USD"} ${role.salaryMin ?? 0} - ${role.salaryMax ?? 0}\n`;
  }
  if (role.jobUrl) md += `- **URL**: [Job Posting](${role.jobUrl})\n`;
  if (role.status) md += `- **Status**: ${role.status}\n`;
  md += `\n`;

  // Overall Analysis
  if (analysis) {
    md += `## Overall Analysis\n`;
    md += `- **Total Score**: ${analysis.hireScore}/100\n\n`;
    md += `### The Hook\n${analysis.theHook || "N/A"}\n\n`;
    md += `### Counter Positioning\n${analysis.counterPositioning || "N/A"}\n\n`;
    md += `### Strategic Recommendation\n${analysis.strategicRecommendation || "N/A"}\n\n`;
  }

  // Alignment Scores
  if (alignmentScores && alignmentScores.length > 0) {
    md += `## Alignment Scores\n`;
    alignmentScores.forEach((score: any) => {
      md += `- **${score.type ? score.type.replace(/_/g, " ").toLowerCase() : "Unknown"}**: ${score.score}/100\n`;
      md += `  *Rationale*: ${score.rationale}\n`;
    });
    md += `\n`;
  }

  // Bullet Breakdown
  if (bullets && bullets.length > 0) {
    md += `## Bullet Breakdown\n\n`;

    // Group analyses by bullet
    const analysesByBullet = (bulletAnalyses || []).reduce((acc: any, curr: any) => {
      if (!acc[curr.bulletId]) acc[curr.bulletId] = [];
      acc[curr.bulletId].push(curr);
      return acc;
    }, {});

    bullets.forEach((bullet: any) => {
      md += `### Requirement: ${bullet.content}\n`;
      md += `- **Category**: ${bullet.type ? bullet.type.replace(/_/g, " ").toLowerCase() : "Unknown"}\n`;
      if (bullet.isCritical) md += `- **Critical**: Yes\n`;

      const revisions = analysesByBullet[bullet.id] || [];
      revisions.sort((a: any, b: any) => a.revisionNumber - b.revisionNumber);

      revisions.forEach((rev: any) => {
        md += `\n**Revision ${rev.revisionNumber}** (Score: ${rev.aiScore}/100)\n`;
        md += `*Rationale*: ${rev.aiRationale}\n`;
      });
      md += `\n---\n\n`;
    });
  }

  // Mock Interviews
  if (mockInterviews && mockInterviews.length > 0) {
    md += `## Mock Interviews\n\n`;
    mockInterviews.forEach((interview: any, _i: number) => {
      md += `### Mock Interview (v${interview.version})\n`;
      if (Array.isArray(interview.qaPairs)) {
        interview.qaPairs.forEach((qa: any, j: number) => {
          md += `**Q${j + 1}: ${qa.interviewer}**\n\n`;
          md += `*Candidate*: ${qa.candidate}\n\n`;
          md += `*Coach's Insight*: ${qa.insight}\n\n`;
        });
      }
      md += `\n`;
    });
  }

  // Generated Documents
  if (documents && documents.length > 0) {
    md += `## Generated Documents\n\n`;
    documents.forEach((doc: any) => {
      md += `### ${doc.name} (v${doc.version})\n`;
      md += `- **Type**: ${doc.type}\n`;
      md += `- **Google Doc ID**: ${doc.gdocId}\n`;
      md += `- **Link**: [Open Document](${doc.type === "resume" || doc.type === "cover_letter" ? `https://docs.google.com/document/d/${doc.gdocId}/edit` : `https://drive.google.com/file/d/${doc.gdocId}/view`})\n\n`;

      if (fetchedDocs[doc.id]) {
        md += `#### Content:\n\n${fetchedDocs[doc.id]}\n\n`;
      }
    });
  }

  // Career Memory
  if (careerMemory && careerMemory.length > 0) {
    md += `## Career Memory (Role Specific)\n\n`;
    careerMemory.forEach((mem: any) => {
      if (!mem.isActive) return;
      md += `### ${mem.category} (${mem.source})\n`;
      md += `**Query**: ${mem.query}\n\n`;
      md += `**Answer**: ${mem.answer}\n\n`;
      md += `---\n\n`;
    });
  }

  return md;
}
