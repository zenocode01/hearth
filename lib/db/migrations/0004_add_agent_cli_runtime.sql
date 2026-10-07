ALTER TABLE `agents` ADD `runtime` text DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `cli_command` text;