CREATE TABLE IF NOT EXISTS `rapidapi_usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`api_host` text NOT NULL,
	`api_endpoint` text NOT NULL,
	`request_params` text,
	`response_status` integer NOT NULL,
	`response_bytes` integer,
	`duration_ms` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rapidapi_usage_log_timestamp_idx` ON `rapidapi_usage_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rapidapi_usage_log_api_host_idx` ON `rapidapi_usage_log` (`api_host`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rapidapi_usage_log_host_endpoint_idx` ON `rapidapi_usage_log` (`api_host`,`api_endpoint`);