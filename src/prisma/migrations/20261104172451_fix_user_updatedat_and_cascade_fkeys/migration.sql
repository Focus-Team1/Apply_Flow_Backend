-- Rename mistyped column: "updateAt" -> "updatedAt" on User table
-- (original migration created "updateAt" instead of "updatedAt")
ALTER TABLE "User" RENAME COLUMN "updateAt" TO "updatedAt";

-- Drop the database-level DEFAULT that was on the original "updateAt" column.
-- The schema uses @updatedAt (Prisma client sets the value on every write), so no
-- DB default is needed — keeping it causes a migrate-diff mismatch.
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Fix Application foreign key: ON DELETE RESTRICT -> ON DELETE CASCADE (matches schema onDelete: Cascade)
ALTER TABLE "Application" DROP CONSTRAINT "Application_userId_fkey";
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fix Resume foreign key: ON DELETE RESTRICT -> ON DELETE CASCADE (matches schema onDelete: Cascade)
ALTER TABLE "Resume" DROP CONSTRAINT "Resume_userId_fkey";
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
