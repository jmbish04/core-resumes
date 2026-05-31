-- Seed companies from hiring-without-whiteboards into api_companies and board_tokens

-- 1. Insert into api_companies (Discovery List)
INSERT INTO api_companies (name, job_board_token, system, source, timestamp_added, is_active, is_recommended, recommendation_reason) VALUES
('Anthropic', 'anthropic', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Remote - AI safety public benefit corporation building reliable, steerable systems. The Legal Operations role involves managing internal tooling roadmaps, triaging custom tech requests, and building low-code/automated solutions to scale the legal team''s capacity.'),
('Harvey', 'harvey', 'ashby', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Hybrid / Remote - Generational AI startup focusing on automating and transforming legal and professional services end-to-end through frontier agentic architectures.'),
('Headway', 'headway', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / New York, NY / Seattle, WA / Remote US - Tech-enabled mental healthcare network building software to facilitate insurance tracking, billing automation, and provider scaling workflows.'),
('Airtable', 'airtable', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Mountain View, CA / Remote - No-code and low-code relational database and app-building platform. Interview involves a practical problem project matching real platform constraints, architectural tradeoff discussions, and debugging loops.'),
('BRYTER', 'bryter', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'Remote - No-code enterprise automation platform engineered specifically for corporate legal, compliance, and regulatory departments to automate administrative workflows.'),
('Checkr', 'checkr', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Remote - API-driven background check and automated compliance workflow platform. Process screens via CoderPad followed by architectural design and refactoring components.'),
('Aalyria', 'aalyria-careers', 'rippling', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'Remote - Spun out of advanced network orchestration protocols. The hiring pipeline uses timeboxed design architecture and coding assessments followed by programmatic systems roundtables.'),
('Brooklyn Data Co', 'brooklyndata', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'Remote - Data analytics and data engineering consulting firm focusing on building modern data pipelines, ETL infrastructure, and automated dashboards.'),
('Abstract', 'abstract', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA - Collaboration and version control platform for product design and engineering workflows.'),
('Accenture', 'accenture', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Remote - Global enterprise solutions, digital transformation, and professional systems consulting. Involves conversational technical screenings with architecture leads focused on large-scale infrastructure deployments.'),
('Accredible', 'accredible', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 0, 1, 'San Francisco, CA / Remote - Digital credentialing infrastructure platform. Process features a practical take-home project followed by live pair programming and architectural reviews.'),
('AgileMD', 'agilemd', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA - Clinical decision support pipelines and data-driven healthcare workflow platforms requiring robust internal pipeline engineering.'),
('Airbase', 'airbase', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Remote - Fintech spend management platform incorporating enterprise policy compliance, finance rules engines, and automated data entry integrations.'),
('Angaza', 'angaza', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA - B2B platform infrastructure scaling utility grid networks and financial tools. Interview processes prioritize worksamples mirroring day-to-day product operations.'),
('Bustle', 'BDG', 'lever', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'Remote - Digital media platform infrastructure. Process includes a half-day pairing session targeting actual backlog tickets or open-source infrastructure modifications.'),
('CircleCI', 'circleci', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Remote - Continuous integration and delivery automation platform. Process involves an initial take-home assignment followed by collaborative pairing to resolve live system bugs and user escalations.'),
('DroneDeploy', 'dronedeploy', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA - Cloud-based visual data and reality capture platform that optimizes spatial analysis. Process utilizes collaborative product modeling and live systems testing.'),
('Goalbook', 'goalbook', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'Remote - EdTech platform that empowers educators to scale student learning objectives and track performance metrics via custom curriculum planning dashboards.'),
('Graphistry', 'graphistry', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Remote - Visual analytics and data engineering pipeline platform optimized for complex technical investigations and large-scale graph visualizations.'),
('Upwave', 'upwave', 'greenhouse', 'https://github.com/poteto/hiring-without-whiteboards/', strftime('%s', 'now'), 1, 1, 'San Francisco, CA / Remote - Analytics platform providing automated data attribution engines. Process includes take-home solution architectures and systems design review boards.');

-- 2. Insert into board_tokens (Active Scanning Queue for Greenhouse companies)
INSERT OR IGNORE INTO board_tokens (token, company_name, company_url, is_active, created_at, updated_at) VALUES
('anthropic', 'Anthropic', 'https://job-boards.greenhouse.io/anthropic/jobs/5142374008', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('headway', 'Headway', 'https://job-boards.greenhouse.io/headway/jobs/5532517004', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('airtable', 'Airtable', 'https://airtable.com/careers', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('bryter', 'BRYTER', 'https://www.bryter.com/careers', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('checkr', 'Checkr', 'https://checkr.com/company/careers', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('brooklyndata', 'Brooklyn Data Co', 'https://www.brooklyndata.co', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('abstract', 'Abstract', 'https://www.abstract.com', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('accenture', 'Accenture', 'https://www.accenture.com/us-en/careers', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('accredible', 'Accredible', 'https://www.accredible.com/careers', 0, strftime('%s', 'now'), strftime('%s', 'now')),
('agilemd', 'AgileMD', 'https://www.agilemd.com', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('airbase', 'Airbase', 'https://www.airbase.com/careers', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('angaza', 'Angaza', 'https://www.angaza.com/careers/', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('circleci', 'CircleCI', 'https://circleci.com', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('dronedeploy', 'DroneDeploy', 'https://www.dronedeploy.com/careers.html', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('goalbook', 'Goalbook', 'https://goalbookapp.com/careers/', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('graphistry', 'Graphistry', 'https://www.graphistry.com', 1, strftime('%s', 'now'), strftime('%s', 'now')),
('upwave', 'Upwave', 'https://www.upwave.com/careers', 1, strftime('%s', 'now'), strftime('%s', 'now'));
