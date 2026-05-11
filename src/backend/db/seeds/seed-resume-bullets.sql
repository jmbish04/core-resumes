-- Seed data for Resume Builder context
-- These are verified career accomplishments ("Historical Performance Truths")
-- used by the AI agent when drafting resumes, cover letters, and applications.
--
-- Note: created_at and updated_at use Unix epoch seconds (integer timestamps)
-- to match the Drizzle schema's { mode: "timestamp" } configuration.

INSERT INTO resume_bullets (content, category, impact_metric, tags, notes, created_at, updated_at) VALUES
-- Strategic Leadership
('Earned 4 merit-based promotions (L2 to L5) within Google''s Legal Operations by consistently delivering technical and strategic value.', 'Strategic', '4 Promotions', 'Leadership, Growth, Google', 'Highlights rapid trajectory and internal trust.', unixepoch(), unixepoch()),
('Led a grassroots movement to transform legal matter management into a scalable ecosystem, securing executive funding for a full system rebuild supported by 55 engineers.', 'Strategic', '55 Engineers', 'Product, 0-to-1, Scale', 'The "Founding Builder" flagship project.', unixepoch(), unixepoch()),
('Served as Product Manager for MatterSpace, co-developing a 2-year strategic roadmap and authoring PRDs for critical intake and workflow features.', 'Strategic', '2-Year Roadmap', 'Roadmap, PRD, Product', 'Core PM experience.', unixepoch(), unixepoch()),
('Facilitated 165+ design discussions with global stakeholders to ensure product-market fit and feature parity during high-stakes migrations.', 'Strategic', '165+ Discussions', 'Stakeholders, Design, UX', 'High-volume cross-functional alignment.', unixepoch(), unixepoch()),

-- Technical & Data
('Re-architected a 12+ year-old legacy data pipeline using modern AI-driven tools (Dreampipe, Flume) to achieve near real-time processing.', 'Technical', 'Real-time', 'Data Engineering, Pipeline, AI', 'Modernizing aging infrastructure.', unixepoch(), unixepoch()),
('Shipped platform-critical tools—including BumbleBee, DOTS, and Locker integrations—without formal engineering support.', 'Technical', 'Critical Tools', 'Shadow Engineering, Tooling', 'Building when centralized systems failed.', unixepoch(), unixepoch()),
('Engineered automated ETL pipelines using Python and SQL (BigQuery) to extract and load validated billing data into unified dashboards.', 'Technical', 'Automated', 'Python, SQL, ETL, BigQuery', 'Standard technical data stack.', unixepoch(), unixepoch()),
('Designed data governance systems and automated QC processes using intelligent anomaly detection to ensure high data integrity.', 'Technical', 'Integrity', 'Governance, QC, AI', 'Data quality and governance focus.', unixepoch(), unixepoch()),

-- Innovation & Impact
('Overhauled hardware preservation operations by synthesizing complex technical requirements, delivering an estimated $16M in annual savings.', 'Impact', '$16M Savings', 'ROI, Legal Hold, Process', 'Massive quantifiable ROI.', unixepoch(), unixepoch()),
('Pioneered the integration of Vertex AI and SQLMiner to develop predictive cost modeling and intelligent anomaly detection solutions.', 'Impact', 'Predictive', 'AI, Vertex AI, Innovation', 'Cutting-edge AI implementation.', unixepoch(), unixepoch()),
('Scaled internal platforms that reduced onboarding time by 70% and increased usage by 300% within 18 months.', 'Impact', '70% Reduction', 'Scale, Adoption, UX', 'Proven platform growth metrics.', unixepoch(), unixepoch()),
('Automated 95% of SOW DocuSign workflows and quarterly reporting, saving 120+ hours annually per practice group.', 'Impact', '95% Automation', 'Automation, Workflow, Time', 'Operational efficiency win.', unixepoch(), unixepoch()),

-- Collaboration
('Acted as the primary liaison between legal, engineering, and finance to translate ambiguous business needs into technical specifications.', 'Collaboration', 'Liaison', 'Communication, Requirements', 'Bridging the legal-technical gap.', unixepoch(), unixepoch()),
('Mentored junior engineers and PMs on agile methodologies, SQL, and JavaScript, positioning team members for senior product roles.', 'Collaboration', 'Mentorship', 'Mentoring, Agile, SQL', 'Team building and leadership.', unixepoch(), unixepoch()),
('Earned 40+ Peer and Spot bonuses for unwavering support and streamlining processes across Litigation and Regulatory groups.', 'Collaboration', '40+ Bonuses', 'Trust, Culture, Recognition', 'Validation of stakeholder trust.', unixepoch(), unixepoch());
