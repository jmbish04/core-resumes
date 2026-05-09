CREATE TABLE IF NOT EXISTS  `email_parties` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`address` text NOT NULL,
	`domain` text NOT NULL,
	`is_self` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_parties_email_id_idx` ON `email_parties` (`email_id`);--> statement-breakpoint
CREATE INDEX `email_parties_domain_idx` ON `email_parties` (`domain`);--> statement-breakpoint
CREATE INDEX `email_parties_is_self_idx` ON `email_parties` (`is_self`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `email_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer,
	`extracted_text` text,
	`metadata_json` text,
	`drive_folder_id` text,
	`drive_file_id` text,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_attachments_email_id_idx` ON `email_attachments` (`email_id`);--> statement-breakpoint
ALTER TABLE `emails` ADD `message_id` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `sender_domain` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `in_reply_to` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `parent_email_id` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `drive_folder_id` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `drive_pdf_file_id` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `classification_json` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `draft_reply` text;--> statement-breakpoint
CREATE INDEX `emails_role_id_idx` ON `emails` (`role_id`);--> statement-breakpoint
CREATE INDEX `emails_sender_domain_idx` ON `emails` (`sender_domain`);--> statement-breakpoint
CREATE INDEX `emails_message_id_idx` ON `emails` (`message_id`);