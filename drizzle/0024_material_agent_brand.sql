CREATE TABLE IF NOT EXISTS `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
