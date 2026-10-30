-- Annonces de l'équipe à tous les joueurs (décision du 29 octobre 2026)
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bannerUntil" TIMESTAMP(3),
    "push" BOOLEAN NOT NULL DEFAULT false,
    "authorName" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_bannerUntil_idx" ON "Announcement"("bannerUntil");
