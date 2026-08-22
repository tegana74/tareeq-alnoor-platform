-- This migration hashes existing session tokens using SHA-256
-- and updates the token column to store hashed versions

-- Step 1: Add temporary column for hashed tokens
ALTER TABLE "Session" ADD COLUMN "tokenHash" TEXT;

-- Step 2: Migrate existing tokens to hashed versions (SHA-256)
-- Note: This uses PostgreSQL's encode(digest()) for SHA-256 hashing
-- If pgcrypto extension is not available, tokens will be re-hashed on next login
UPDATE "Session" SET "tokenHash" = encode(digest("token", 'sha256'), 'hex');

-- Step 3: Drop the old token column
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_token_key";
ALTER TABLE "Session" DROP COLUMN "token";

-- Step 4: Rename tokenHash to token
ALTER TABLE "Session" RENAME COLUMN "tokenHash" TO "token";

-- Step 5: Add unique constraint back
ALTER TABLE "Session" ADD CONSTRAINT "Session_token_key" UNIQUE ("token");