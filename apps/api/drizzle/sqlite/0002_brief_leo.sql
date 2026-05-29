CREATE TABLE `user_item_favorites` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `uif_ws_user` ON `user_item_favorites` (`workspace_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `items` ADD `appdata_file_id` text;--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `is_favorite`;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `auto_share_mode` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `auto_share_role` text DEFAULT 'reader' NOT NULL;