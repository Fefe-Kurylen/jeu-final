-- AlterTable
ALTER TABLE "Army" ADD COLUMN     "settlers" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "settlers" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ResourceNode" ADD COLUMN     "cityId" TEXT;

-- CreateIndex
CREATE INDEX "ResourceNode_cityId_idx" ON "ResourceNode"("cityId");

