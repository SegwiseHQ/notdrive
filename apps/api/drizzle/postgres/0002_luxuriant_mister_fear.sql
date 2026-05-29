ALTER TABLE "items" ADD COLUMN "visibility" text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "owner_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_visibility" ON "items" USING btree ("workspace_id","visibility","owner_id");