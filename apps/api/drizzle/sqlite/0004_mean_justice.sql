PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`drive_file_id` text,
	`parent_id` text,
	`rank` text NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`body` text,
	`appdata_file_id` text,
	`visibility` text DEFAULT 'workspace' NOT NULL,
	`owner_id` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "items_visibility_check" CHECK("__new_items"."visibility" IN ('workspace', 'private'))
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "workspace_id", "type", "title", "drive_file_id", "parent_id", "rank", "is_archived", "archived_at", "body", "appdata_file_id", "visibility", "owner_id", "created_by", "created_at", "updated_at") SELECT "id", "workspace_id", "type", "title", "drive_file_id", "parent_id", "rank", "is_archived", "archived_at", "body", "appdata_file_id", "visibility", "owner_id", "created_by", "created_at", "updated_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `items_parent` ON `items` (`workspace_id`,`parent_id`,`rank`);--> statement-breakpoint
CREATE INDEX `items_archived` ON `items` (`workspace_id`,`is_archived`);--> statement-breakpoint
CREATE INDEX `items_drive_file` ON `items` (`drive_file_id`);--> statement-breakpoint
CREATE INDEX `items_visibility` ON `items` (`workspace_id`,`visibility`,`owner_id`);