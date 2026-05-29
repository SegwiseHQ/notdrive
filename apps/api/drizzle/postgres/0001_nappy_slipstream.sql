CREATE TABLE IF NOT EXISTS "user_item_favorites" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "user_item_favorites_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_item_favorites" ADD CONSTRAINT "user_item_favorites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_item_favorites" ADD CONSTRAINT "user_item_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_item_favorites" ADD CONSTRAINT "user_item_favorites_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "uif_ws_user" ON "user_item_favorites" USING btree ("workspace_id","user_id");--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "is_favorite";