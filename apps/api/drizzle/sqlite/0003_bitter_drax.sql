ALTER TABLE `items` ADD `visibility` text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `items_visibility` ON `items` (`workspace_id`,`visibility`,`owner_id`);