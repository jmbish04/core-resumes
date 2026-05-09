import { z } from "zod";

export const ResumeRequestSchema = z.object({
  roleId: z.string().optional().openapi({ description: "Optional Role ID to link this document to." }),
  targetRole: z.string().openapi({ example: "Senior Product Manager - AI Tooling" }),
  summaryStatement: z.string().openapi({ example: "Product-minded data leader..." }),
  skillsProduct: z.string().openapi({ example: "Full Lifecycle Product Management, Cross-Functional Leadership..." }),
  skillsData: z.string().openapi({ example: "Data Engineering, ETL Pipeline Optimization..." }),
  skillsTech: z.string().openapi({ example: "SQL (BigQuery, Cloud SQL), Python, JavaScript..." }),
  skillsAI: z.string().openapi({ example: "Vertex AI, BigQuery ML, LLMs..." }),
  googleBullets: z.array(z.string()).openapi({ 
    example: [
      "<span class=\"metric\">$16M Annual ROI:</span> Pioneered the technical overhaul..."
    ],
    description: "Array of HTML formatted bullet points for Google experience."
  }),
  osdBullets: z.array(z.string()).openapi({
    example: [
      "<span class=\"metric\">0-to-1 Intrapreneurship:</span> Founded and scaled the company's e-discovery division..."
    ]
  })
}).openapi("ResumeRequest");

export const CoverLetterRequestSchema = z.object({
  roleId: z.string().optional().openapi({ description: "Optional Role ID to link this document to." }),
  targetRole: z.string().openapi({ example: "Head of Data" }),
  companyName: z.string().openapi({ example: "Anthropic" }),
  hiringManagerName: z.string().optional().openapi({ example: "Hiring Team" }),
  companyAlignmentParagraph: z.string().openapi({ 
    example: "I am particularly drawn to Anthropic because of your commitment to reliable AI..." 
  })
}).openapi("CoverLetterRequest");

export const DocumentResponseSchema = z.object({
  success: z.boolean(),
  documentId: z.string(),
  documentUrl: z.string()
}).openapi("DocumentResponse");

export function generateResumeHtml(data: z.infer<typeof ResumeRequestSchema>): string {
  const googleBulletsHtml = data.googleBullets.map((b: string) => `<li>${b}</li>`).join('\\n');
  const osdBulletsHtml = data.osdBullets.map((b: string) => `<li>${b}</li>`).join('\\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5; color: #2D3748; background-color: #ffffff; margin: 0; padding: 20px; }
        .header { text-align: center; border-bottom: 3px solid #1A365D; padding-bottom: 15px; margin-bottom: 20px; }
        .name { font-family: 'Georgia', serif; font-size: 38px; color: #1A365D; margin: 0 0 5px 0; letter-spacing: 1.5px; text-transform: uppercase; font-weight: bold; }
        .target-role { font-family: 'Arial', sans-serif; font-size: 18px; color: #0D9488; margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
        .contact-info { font-size: 13px; color: #4A5568; }
        .contact-info a { color: #1A365D; text-decoration: none; font-weight: bold; }
        .section-title { font-family: 'Georgia', serif; font-size: 18px; color: #1A365D; border-bottom: 1px solid #CBD5E0; padding-bottom: 4px; margin-top: 25px; margin-bottom: 12px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
        p { margin: 0 0 10px 0; font-size: 14px; text-align: justify; }
        .job-header { margin-bottom: 5px; }
        .job-title-row { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
        .job-title-row td { padding: 0; vertical-align: baseline; }
        .job-title { font-size: 16px; font-weight: bold; color: #1A365D; }
        .company { font-size: 15px; color: #0D9488; font-weight: bold; }
        .job-dates { font-size: 13px; color: #718096; text-align: right; font-weight: bold; }
        ul { margin: 0 0 15px 0; padding-left: 20px; }
        li { margin-bottom: 6px; font-size: 14px; color: #2D3748; }
        .metric { font-weight: bold; color: #1A365D; }
        .skills-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 10px; }
        .skills-table td { padding: 4px 8px 4px 0; vertical-align: top; }
        .skill-category { font-weight: bold; color: #1A365D; white-space: nowrap; width: 20%; }
        .skill-list { color: #4A5568; }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="name">JUSTIN BISHOP</h1>
        <div class="target-role">\${data.targetRole}</div>
        <div class="contact-info">
            San Francisco, CA &nbsp;|&nbsp; (415) 658-2389 &nbsp;|&nbsp; 
            <a href="mailto:justin@126colby.com">justin@126colby.com</a> &nbsp;|&nbsp; 
            <a href="https://linkedin.com/in/jmbishop04">linkedin.com/in/jmbishop04</a>
        </div>
    </div>
    <div class="section-title">Professional Summary</div>
    <p>\${data.summaryStatement}</p>
    <div class="section-title">Core Competencies & Technical Skills</div>
    <table class="skills-table">
        <tr><td class="skill-category">Product & Strategy:</td><td class="skill-list">\${data.skillsProduct}</td></tr>
        <tr><td class="skill-category">Data & Architecture:</td><td class="skill-list">\${data.skillsData}</td></tr>
        <tr><td class="skill-category">Technical Stack:</td><td class="skill-list">\${data.skillsTech}</td></tr>
        <tr><td class="skill-category">AI & Advanced Tools:</td><td class="skill-list">\${data.skillsAI}</td></tr>
    </table>
    <div class="section-title">Professional Experience</div>
    <div class="job-header">
        <table class="job-title-row">
            <tr>
                <td><span class="job-title">Business Program Manager / Systems Architect (L5)</span> | <span class="company">Google</span></td>
                <td class="job-dates">Jan 2013 – Present</td>
            </tr>
        </table>
    </div>
    <ul>\${googleBulletsHtml}</ul>
    <div class="job-header">
        <table class="job-title-row">
            <tr>
                <td><span class="job-title">Program Lead – Forensics Workflow & Reporting</span> | <span class="company">One Source Discovery</span></td>
                <td class="job-dates">Jan 2011 – Jan 2013</td>
            </tr>
        </table>
    </div>
    <ul>\${osdBulletsHtml}</ul>
    <div class="section-title">Education & Certifications</div>
    <ul style="list-style-type: none; padding-left: 0; margin-bottom: 0;">
        <li style="margin-bottom: 8px;"><strong>University of Louisville</strong> — B.S. in Computer Information Systems & Entrepreneurship (<em>Cum Laude</em>)</li>
        <li style="margin-bottom: 8px;"><strong>UC Berkeley Executive Education</strong> — Certification in Product Management</li>
        <li><strong>UC Berkeley Executive Education</strong> — Certification in Business Analysis</li>
    </ul>
</body>
</html>`;
}

export function generateCoverLetterHtml(data: z.infer<typeof CoverLetterRequestSchema>): string {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const salutationName = data.hiringManagerName || "Hiring Team";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #2D3748; background-color: #ffffff; margin: 0; padding: 20px; }
        .header { text-align: center; border-bottom: 3px solid #1A365D; padding-bottom: 15px; margin-bottom: 40px; }
        .name { font-family: 'Georgia', serif; font-size: 38px; color: #1A365D; margin: 0 0 5px 0; letter-spacing: 1.5px; text-transform: uppercase; font-weight: bold; }
        .target-role { font-family: 'Arial', sans-serif; font-size: 18px; color: #0D9488; margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
        .contact-info { font-size: 13px; color: #4A5568; }
        .contact-info a { color: #1A365D; text-decoration: none; font-weight: bold; }
        .date { margin-bottom: 25px; font-size: 15px; color: #2D3748; }
        .salutation { margin-bottom: 20px; font-size: 15px; font-weight: bold; color: #1A365D; }
        p { margin: 0 0 18px 0; font-size: 15px; text-align: justify; }
        .signature { margin-top: 40px; font-size: 15px; }
        .signature-name { font-family: 'Georgia', serif; font-size: 22px; color: #1A365D; font-weight: bold; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="name">JUSTIN BISHOP</h1>
        <div class="target-role">\${data.targetRole}</div>
        <div class="contact-info">
            San Francisco, CA &nbsp;|&nbsp; (650) 224-1638 &nbsp;|&nbsp; 
            <a href="mailto:justin@126colby.com">justin@126colby.com</a> &nbsp;|&nbsp; 
            <a href="https://linkedin.com/in/jmbishop04">linkedin.com/in/jmbishop04</a>
        </div>
    </div>
    <div class="date">\${dateStr}</div>
    <div class="salutation">Dear \${salutationName},</div>
    <p>I am writing to express my enthusiastic interest in the <strong>\${data.targetRole}</strong> position at <strong>\${data.companyName}</strong>. Over my 12+ year tenure at Google, I have built my career around a singular, non-negotiable truth: the highest-impact products and AI systems are only as effective as the data foundations they sit upon. I specialize in cutting through "rats nest" technical debt and ambiguity to architect scalable, user-driven solutions—a skill set I am eager to bring to your team.</p>
    <p>Throughout my four merit-based promotions (L2 to L5) within Google's Legal Operations, I have operated as an intrapreneur and a "Founding Builder." I am uniquely positioned at the intersection of complex legal requirements, data engineering, and product vision. When centralized enterprise systems failed to meet the nuanced needs of our global teams, I didn't wait for formal engineering resources. Instead, I architected and deployed lightweight, highly efficient data pipelines and internal applications. This hands-on approach allowed me to pioneer the technical overhaul of a legacy hardware preservation policy—delivering an automated solution that drastically reduced risk and generated an estimated <strong>$16 million in annual savings</strong>.</p>
    <p>Beyond immediate cost savings, I focus heavily on platform scalability and user adoption. By designing intake and workflow ecosystems that prioritize simplicity over academic over-engineering, I successfully reduced onboarding times by 70% and drove a <strong>300% increase in platform adoption</strong>. I am comfortable acting as the primary translator between highly specialized stakeholders (like attorneys or operations leads) and technical engineering teams, ensuring that we are building software that solves real pain points rather than hypothetical ones.</p>
    <p>\${data.companyAlignmentParagraph}</p>
    <p>Thank you for considering my application. I would welcome the opportunity to discuss how my hybrid background in product strategy, data architecture, and operational leadership aligns with the future of <strong>\${data.companyName}</strong>.</p>
    <div class="signature">Sincerely,<br><div class="signature-name">Justin Bishop</div></div>
</body>
</html>`;
}
