-- CreateEnum
CREATE TYPE "Presence" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "LivingType" AS ENUM ('ON_CAMPUS', 'OFF_CAMPUS');

-- CreateEnum
CREATE TYPE "HouseFeature" AS ENUM ('BILLS', 'CHORES', 'SHOPPING', 'CALENDAR', 'STORAGE', 'MOODBOARD');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ChoreFrequency" AS ENUM ('DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ShoppingCategory" AS ENUM ('GROCERIES', 'HOUSEHOLD', 'OTHER');

-- CreateEnum
CREATE TYPE "ShoppingStatus" AS ENUM ('NEEDED', 'BOUGHT');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "netid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "major" TEXT,
    "avatarUrl" TEXT,
    "presence" "Presence" NOT NULL DEFAULT 'HOME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "House" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#7A4E2D',
    "inviteCode" TEXT NOT NULL,
    "livingType" "LivingType" NOT NULL DEFAULT 'OFF_CAMPUS',
    "address" TEXT,
    "unit" TEXT,
    "leaseEndsOn" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "features" "HouseFeature"[] DEFAULT ARRAY['BILLS', 'CHORES', 'SHOPPING', 'CALENDAR', 'STORAGE', 'MOODBOARD']::"HouseFeature"[],
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseMember" (
    "id" SERIAL NOT NULL,
    "houseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseInvite" (
    "id" SERIAL NOT NULL,
    "houseId" INTEGER NOT NULL,
    "netid" TEXT NOT NULL,
    "invitedById" INTEGER NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "HouseInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chore" (
    "id" SERIAL NOT NULL,
    "houseId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "frequency" "ChoreFrequency" NOT NULL,
    "startsOn" DATE NOT NULL,
    "occurrenceBase" INTEGER NOT NULL DEFAULT 0,
    "rotationAnchor" INTEGER NOT NULL DEFAULT 0,
    "allowSwaps" BOOLEAN NOT NULL DEFAULT true,
    "reminderHour" INTEGER DEFAULT 18,
    "createdById" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreRotation" (
    "id" SERIAL NOT NULL,
    "choreId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ChoreRotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreAssignment" (
    "id" SERIAL NOT NULL,
    "choreId" INTEGER NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "dueOn" DATE NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" INTEGER,

    CONSTRAINT "ChoreAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" SERIAL NOT NULL,
    "houseId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ShoppingCategory" NOT NULL DEFAULT 'GROCERIES',
    "status" "ShoppingStatus" NOT NULL DEFAULT 'NEEDED',
    "addedById" INTEGER NOT NULL,
    "claimedById" INTEGER,
    "boughtById" INTEGER,
    "boughtAt" TIMESTAMP(3),
    "priceCents" INTEGER,
    "billId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "User_netid_key" ON "User"("netid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "House_inviteCode_key" ON "House"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "HouseMember_userId_key" ON "HouseMember"("userId");

-- CreateIndex
CREATE INDEX "HouseMember_houseId_idx" ON "HouseMember"("houseId");

-- CreateIndex
CREATE INDEX "HouseInvite_netid_status_idx" ON "HouseInvite"("netid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HouseInvite_houseId_netid_key" ON "HouseInvite"("houseId", "netid");

-- CreateIndex
CREATE INDEX "Chore_houseId_idx" ON "Chore"("houseId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreRotation_choreId_userId_key" ON "ChoreRotation"("choreId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreRotation_choreId_position_key" ON "ChoreRotation"("choreId", "position");

-- CreateIndex
CREATE INDEX "ChoreAssignment_assigneeId_dueOn_idx" ON "ChoreAssignment"("assigneeId", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreAssignment_choreId_occurrence_key" ON "ChoreAssignment"("choreId", "occurrence");

-- CreateIndex
CREATE INDEX "ShoppingItem_houseId_status_idx" ON "ShoppingItem"("houseId", "status");

-- AddForeignKey
ALTER TABLE "House" ADD CONSTRAINT "House_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseMember" ADD CONSTRAINT "HouseMember_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseMember" ADD CONSTRAINT "HouseMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseInvite" ADD CONSTRAINT "HouseInvite_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseInvite" ADD CONSTRAINT "HouseInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreRotation" ADD CONSTRAINT "ChoreRotation_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreRotation" ADD CONSTRAINT "ChoreRotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreAssignment" ADD CONSTRAINT "ChoreAssignment_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreAssignment" ADD CONSTRAINT "ChoreAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreAssignment" ADD CONSTRAINT "ChoreAssignment_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_boughtById_fkey" FOREIGN KEY ("boughtById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
