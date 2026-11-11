-- CreateEnum
CREATE TYPE "NoteColor" AS ENUM ('YELLOW', 'ORANGE', 'BLUE', 'GREEN', 'PINK', 'PURPLE');

-- CreateTable
CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "houseId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "color" "NoteColor" NOT NULL DEFAULT 'YELLOW',
    "dueOn" DATE,
    "pinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_houseId_createdAt_idx" ON "Note"("houseId", "createdAt");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep Supabase's public API out of this table, like the others. The backend connects
-- as the table owner, which RLS doesn't apply to.
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
