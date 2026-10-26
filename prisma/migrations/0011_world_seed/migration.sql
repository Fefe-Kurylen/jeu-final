-- Carte du serveur : chaque serveur a sa carte, tirée au hasard à sa création (décision du 26 octobre 2026).
-- seed : la graine de la carte ; generator : la version du terrain qui l'a tirée (2 = carte de référence, 3 = cartes au
-- hasard) ; readyAt : le monde est prêt (points de ressource posés), le serveur peut ouvrir. Une seule ligne, id = 1,
-- jamais modifiée ensuite (src/game/world.js).
-- Un monde déjà peuplé (joueurs, villes ou points de ressource) garde la carte de référence : graine 0, générateur 2.
CREATE TABLE IF NOT EXISTS "WorldConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seed" INTEGER NOT NULL,
    "generator" INTEGER NOT NULL DEFAULT 2,
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WorldConfig" ("id", "seed", "generator", "readyAt")
SELECT 1, 0, 2, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "City") OR EXISTS (SELECT 1 FROM "ResourceNode") OR EXISTS (SELECT 1 FROM "Player")
ON CONFLICT ("id") DO NOTHING;
