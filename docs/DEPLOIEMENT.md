# Déploiement et exploitation

Ce document décrit comment l'API tourne en production et ce qu'il faut savoir pour la faire évoluer sans casser le monde.

## Variables d'environnement

Voir `.env.example` pour la liste commentée. Les deux obligatoires :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | PostgreSQL. Ajouter `?sslmode=require` chez la plupart des hébergeurs. |
| `JWT_SECRET` | Au moins 32 caractères (`openssl rand -hex 32`). Sans lui le serveur **refuse de démarrer**, quel que soit `NODE_ENV`. Seul `NODE_ENV=development` tolère son absence (secret de développement, avertissement au démarrage). |

Facultative : `WORLD_SEED`, la graine de la carte d'un **serveur neuf** (voir plus bas, « Carte du serveur »).

## Carte du serveur : une carte tirée au hasard par serveur

Chaque serveur a sa propre carte (décision du 26 octobre 2026). Tout le terrain (rivières, ponts et gués, lacs, chaînes de
montagnes, forêts, sols, biomes) se déduit d'une **graine** : un nombre de 0 à 2 147 483 646. La graine 0 est la carte de
référence du serveur déjà ouvert. Le serveur garde sa graine en base (table `WorldConfig`, une ligne) et la publie dans
`GET /api/world/info` (`worldSeed`) ; le jeu la lit avant de dessiner quoi que ce soit, et la retient pour le lancement
suivant.

Au premier démarrage d'une **base vide**, le serveur prend `WORLD_SEED` si elle est donnée, sinon tire une graine au hasard
parmi celles qui donnent une carte jouable (presque toute la terre d'un seul tenant, neige et désert entre 10 et 30 %,
chaque rivière traversable au moins deux fois). Le journal l'indique :

```
[MONDE] nouvelle carte, graine 432062107 : tirée au hasard (1 essai)
[MONDE] graine 432062107 : neige 19 %, désert 21 %, terre d'un seul tenant 99 %, 8 rivières, 49 passages
```

Ensuite la graine **ne change plus jamais** : changer la carte d'un monde peuplé mettrait des villes dans l'eau ou sur
les montagnes (le serveur les déplacerait toutes au démarrage suivant). `WORLD_SEED` est donc ignorée, avec un
avertissement, dès que le monde a sa carte. Une base qui a déjà des joueurs, des villes ou des points de ressource mais pas
encore de graine (monde ouvert avant les cartes au hasard) garde la carte de référence (graine 0).

Ouvrir un nouveau monde :

1. **arrêter l'API**, puis partir d'une base **vide** (nouvelle base, ou `npx prisma migrate reset --force` sur l'ancienne :
   tout est effacé). Une API restée allumée pendant la remise à zéro garderait l'ancienne carte en mémoire, et la première
   inscription ferait croire au redémarrage que le monde est déjà peuplé ;
2. facultatif : regarder quelques cartes avant de choisir, `node tools/apercu-carte.cjs --random=4` (images dans
   `docs/img/cartes/`), puis mettre la graine retenue dans `WORLD_SEED` ;
3. démarrer l'API et vérifier la ligne `[MONDE]` du journal, ou `GET /api/world/info` → `worldSeed` ;
4. voir la carte d'un serveur en service : `node tools/apercu-carte.cjs --server=https://<api>`.

Ne jamais vider ni supprimer la table `WorldConfig` d'un monde en cours (elle fait partie des sauvegardes). Si elle
disparaît, le serveur ne prend une graine pour ce monde peuplé que si ses villes et ses points tiennent sur la carte qu'elle
donne (la graine 0, ou celle de `WORLD_SEED` pour la lui rendre) ; sinon il refuse de démarrer, plutôt que de déplacer des
villes. Une carte tirée par une autre version du générateur (`WorldConfig.generator`) l'arrête aussi : déployer la version
qui sait la dessiner.

## E-mail : vérification d'adresse et mot de passe oublié

| Variable | Rôle |
|---|---|
| `EMAIL_PROVIDER` | `log` (défaut : rien n'est envoyé, le message est écrit dans les logs et dans `EMAIL_LOG_FILE` s'il est défini), `smtp` (via `SMTP_URL`, ex. `smtps://user:motdepasse@smtp.exemple.fr:465`) ou `resend` (via `RESEND_API_KEY`). |
| `EMAIL_FROM` | Expéditeur affiché. |
| `PUBLIC_URL` | Adresse publique de l'API, utilisée dans les liens (`/api/auth/verify-email?token=…`, `/reset-password?token=…`). |
| `REQUIRE_VERIFIED_EMAIL` | Avec un vrai fournisseur, le commerce entre joueurs (offres, envois) exige une adresse confirmée ; `false` pour désactiver. |

Les jetons envoyés sont à usage unique, stockés hachés, valables 24 h (confirmation) ou 1 h (réinitialisation). Une réinitialisation déconnecte tous les appareils et confirme l'adresse.

## Messagerie : traduction et modération

| Variable | Rôle |
|---|---|
| `DEEPL_API_KEY` | Clé API DeepL. Compte gratuit sur deepl.com/pro-api (« DeepL API Free », 500 000 caractères/mois) : la clé finit par `:fx` et passe par `api-free.deepl.com` ; une clé payante par `api.deepl.com`. Sans clé, pas de traduction (le reste du chat fonctionne). |
| `TRANSLATE_PROVIDER` | `deepl` (défaut si la clé est donnée), `log` (tests : « [en] texte », aucun appel), `none` (désactivée). |
| `ADMIN_KEY` | Modération (en-tête `x-admin-key`). |

- Chaque message n'est traduit qu'une fois par langue (table `ChatTranslation`). Une clé refusée ou un quota du mois atteint met la traduction en pause 1 h : les joueurs voient le texte d'origine.
- Conservation : chat global 7 jours, autres messages 90 jours (purge du tick monde, avec les vieux rapports).
- Filtre de mots : `data/chat-filter.json` (accents et lettres répétées ignorés ; modifier puis redémarrer).
- Modération : `GET /api/chat/admin/reports` liste les signalements en attente ; `POST /api/chat/admin/reports/:id` avec `{"action":"dismiss"}`, `{"action":"delete"}` (supprime le message) ou `{"action":"mute","hours":24}` (supprime le message et coupe le chat du joueur). Exemple :
  `curl -H "x-admin-key: $ADMIN_KEY" https://api.exemple.fr/api/chat/admin/reports`
- Limites : 500 caractères, 1 message toutes les 1,5 s, 15 par minute, pas deux fois le même texte en 30 s. Le chat global demande une adresse e-mail confirmée quand un vrai fournisseur d'e-mail est configuré.

## Schéma de base de données : migrations versionnées

Le schéma vit dans `prisma/schema.prisma` et son historique dans `prisma/migrations/` :

- `0001_init` : le schéma tel qu'il existait quand le projet utilisait encore `prisma db push` ;
- `0002_hardening` : cascades de suppression, colonnes mortes retirées, PV de mur fractionnaires, version de jeton, marqueur d'activité, réclamation des arrivées, horodatage du tick, index manquants. Chaque instruction tolère une base qui porte déjà une partie de ces changements (`IF EXISTS` / `IF NOT EXISTS`) ;
- `0003_effects_email_limits` : jetons d'e-mail, adresse confirmée, compteurs de limite partagés, or accumulé de la Chambre au Trésor.

Les suivantes : `0004` heure de départ des armées, `0005` recherche, `0006` villes secondaires, `0007` blessés transportés,
`0008` lits de soins, `0009` vies des villes (`wallStructure`), `0010` notifications, `0011_world_seed` la carte du serveur
(`WorldConfig` : graine, générateur, monde prêt ; graine 0 inscrite si le monde est déjà peuplé).

Au démarrage, le serveur applique les migrations lui-même (`DB_SYNC=migrate`, valeur par défaut) :

1. une base **vide** reçoit toutes les migrations ;
2. une base **créée autrefois par `db push`** (pas de table `_prisma_migrations` mais une table `Player`) est d'abord « baselinée » : `0001_init` est marquée appliquée, puis `0002_hardening` s'applique ;
3. une base déjà migrée ne reçoit que les migrations manquantes.

Les autres modes : `DB_SYNC=none` (la plateforme applique les migrations, par exemple `release_command = "npx prisma migrate deploy"` chez Fly) et `DB_SYNC=push` (prototypage local uniquement : `prisma db push`, jamais en production).

### Modifier le schéma

```bash
# 1. éditer prisma/schema.prisma
# 2. générer la migration à partir de la base de développement
npx prisma migrate dev --name ma_modification
# 3. relire prisma/migrations/<date>_ma_modification/migration.sql, ajouter les corrections de données si besoin
# 4. commit ; au déploiement suivant le serveur l'applique
```

Ne jamais éditer une migration déjà déployée : en ajouter une nouvelle.

### Si une migration échoue en production

Le serveur s'arrête (`process.exit(1)`) plutôt que de servir un schéma incohérent. Lire le message, corriger la base ou la migration, puis :

```bash
npx prisma migrate resolve --rolled-back <nom>   # ou --applied si elle a été passée à la main
npx prisma migrate deploy
```

## Processus et boucle de jeu

- Ordre du démarrage : migrations, **graine de la carte** (`[MONDE]`), réparations des données, points de ressource
  (création sur une base neuve, sinon mise à jour d'après le terrain), puis la boucle de jeu. Tant que la graine n'est pas
  chargée, toutes les routes `/api/*` répondent `503` (sauf `/api/health`) : aucun client ne reçoit une autre carte.

- `CLUSTER_WORKERS=1` (défaut) : un processus sert l'API et exécute le tick. `CLUSTER_WORKERS=auto` ou `N` : un processus par CPU, le premier porte la boucle de jeu.
- Le tick (30 s) est protégé par un **bail en base** (`TickLock`) : une seule instance l'exécute, même pendant un déploiement glissant. Le bail est renouvelé entre chaque étape ; s'il est perdu, le tick s'interrompt.
- La durée de jeu de chaque tick est le **temps réellement écoulé** depuis le tick précédent (horloge de la base), plafonné à 6 h : un redémarrage ou un tick en retard ne perd ni ne double la production.
- Une arrivée d'armée est **réclamée** (`Army.claimedAt`) avant d'être résolue ; une résolution interrompue est détectée au tick suivant et l'armée est renvoyée chez elle, jamais rejouée.
- Les files de construction et de recrutement échues sont aussi réglées **à la lecture** (`GET /api/cities`), sans attendre le tick.
- Arrêt : sur `SIGTERM`, le serveur cesse d'accepter des connexions, termine les requêtes en cours (10 s max), libère le bail du tick et quitte.

## Limites et protections

- Limite globale : 240 requêtes/min par joueur (ou par IP avant connexion), comptée en mémoire par processus.
- Routes sensibles (connexion, inscription, administration, webhook) : compteurs **partagés en base** (`RateLimitBucket`), donc une seule limite quel que soit le nombre de processus ou de machines ; inscriptions 10/min par IP, connexions 20/min par IP et **verrouillage de l'e-mail 15 min après 10 échecs**.
- Marché : un bâtiment Marché est requis, ratio borné à 1:3, 10 offres actives par joueur. Recrutement : 5 lots en attente par bâtiment.
- Les textes libres sont bornés à 512 caractères avant tout traitement (anti ReDoS).

## Santé et surveillance

- `GET /api/health` : 200 quand la base répond et que le démarrage est terminé, 503 sinon (résultat mis en cache 5 s, hors limite de débit).
- Les erreurs sont loguées côté serveur ; en production le client ne reçoit que « Erreur serveur ».
- `GET /api/analytics/funnel` (en-tête `x-admin-key: $ADMIN_KEY`) : comptes d'événements des 7 derniers jours.

## Plateformes

- **Fly.io** (`fly.toml`) : `fly secrets set DATABASE_URL=... JWT_SECRET=...` ; une machine minimum toujours allumée (le tick doit tourner).
- **Render** (`render.yaml`) : `JWT_SECRET` généré automatiquement ; attention, l'instance gratuite s'endort et le tick avec elle.
- **Docker** : image `node:20-slim`, utilisateur non root, `HEALTHCHECK` intégré.

## Tests

```bash
npm run test:unit    # moteur de combat, calculs, validation, tribus (sans base)
npm run test:e2e     # partie complète contre une API locale (API_BASE, DATABASE_URL pour psql)
npm run test:smoke   # navigateur (Playwright) : onglets, ville, carte, mobile
```

La CI GitHub (`.github/workflows/ci.yml`) lance les tests unitaires, applique les migrations sur un Postgres vierge, démarre l'API et joue les tests de bout en bout.
