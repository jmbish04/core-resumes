CREATE TABLE IF NOT EXISTS  `health_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`trigger` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `health_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`details` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`ai_suggestion` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `health_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `health_test_definitions` (
	`name` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`timeout_ms` integer,
	`created_at` integer NOT NULL
);
