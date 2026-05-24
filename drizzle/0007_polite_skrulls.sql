CREATE TABLE IF NOT EXISTS  `transcription_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`role_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`phase` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`total_chunks` integer,
	`completed_chunks` integer DEFAULT 0 NOT NULL,
	`full_text` text,
	`error` text,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `interview_recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transcription_jobs_recording_id_idx` ON `transcription_jobs` (`recording_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transcription_jobs_role_id_idx` ON `transcription_jobs` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transcription_jobs_status_idx` ON `transcription_jobs` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `transcription_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`r2_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`transcription` text,
	`duration_seconds` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `transcription_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transcription_chunks_job_chunk_idx` ON `transcription_chunks` (`job_id`,`chunk_index`);