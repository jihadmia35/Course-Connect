-- Trusted CLI imports are attributed to the authenticated database role.
-- Web imports continue to require a verified Supabase administrator UUID.
ALTER TABLE "ImportHistory" ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "ImportHistory" ADD COLUMN "databaseRole" TEXT;
ALTER TABLE "ImportHistory" ADD CONSTRAINT "ImportHistory_actor_check"
  CHECK (("adminId" IS NOT NULL AND "databaseRole" IS NULL)
      OR ("adminId" IS NULL AND "databaseRole" IS NOT NULL));
