# Imperium Antiquitas - Guide de Déploiement

## Option recommandée : Fly.io + Neon (GRATUIT, Always-on)

**Pourquoi ?** Fly.io ne dort jamais (contrairement à Render), Neon offre du PostgreSQL gratuit sans limite de 90 jours.

---

### Étape 1 : Créer la base de données Neon

1. Aller sur **https://neon.tech** → S'inscrire (GitHub)
2. **New Project** → Nom: `imperium-antiquitas`
3. Region: **Europe (Frankfurt)** `eu-central-1`
4. Copier le **Connection string** qui ressemble à :
   ```
   postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

### Étape 2 : Installer Fly.io CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Se connecter :
```bash
fly auth login
```

### Étape 3 : Déployer sur Fly.io

Depuis le dossier du projet :

```bash
# Créer l'app (une seule fois)
fly launch --no-deploy

# Configurer les secrets
fly secrets set DATABASE_URL="postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require"
fly secrets set JWT_SECRET="votre_secret_tres_long_genere_aleatoirement"

# Déployer
fly deploy
```

### Étape 4 : C'est tout !

Votre jeu est en ligne sur :
```
https://imperium-antiquitas.fly.dev
```

---

## Commandes utiles Fly.io

```bash
# Voir les logs en temps réel
fly logs

# Voir le statut
fly status

# Redéployer après changements
fly deploy

# Ouvrir dans le navigateur
fly open

# SSH dans le conteneur (debug)
fly ssh console

# Voir les secrets configurés
fly secrets list

# Changer la région
fly regions set cdg  # Paris
fly regions set fra  # Francfort
```

---

## Variables d'environnement

| Variable | Valeur | Obligatoire |
|----------|--------|-------------|
| `DATABASE_URL` | Connection string Neon | Oui |
| `JWT_SECRET` | Secret aléatoire (32+ chars) | Oui |
| `NODE_ENV` | `production` (auto via fly.toml) | Auto |
| `PORT` | `8080` (auto via fly.toml) | Auto |

---

## Alternative : Render.com (gratuit mais dort)

> **Attention** : Les services gratuits Render dorment après 15 min d'inactivité.
> Le premier chargement prend 30-60 secondes. Mauvais pour un jeu avec tick toutes les 30s.

### 1. Créer une base de données PostgreSQL
1. Dashboard → **New +** → **PostgreSQL**
2. Plan: **Free** (expire après 90 jours)
3. Copier l'**Internal Database URL**

### 2. Déployer le Backend
1. Dashboard → **New +** → **Web Service**
2. Configuration:
   - **Build Command**: `npm install && npx prisma generate && npx prisma db push`
   - **Start Command**: `node src/server.js`
   - **Plan**: Free
3. Variables: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `PORT=10000`

---

## Alternative : Railway.app ($5 crédit puis payant)

Voir `RAILWAY_GUIDE.md` pour les détails.

> **Note** : Railway offre $5 de crédit one-time. Après ça, le service s'arrête.

---

## Dépannage

### Erreur Prisma "binary not found"
Le `binaryTargets` dans `schema.prisma` couvre déjà les principales cibles Linux.

### Erreur "Cannot connect to database"
Vérifier que `DATABASE_URL` contient `?sslmode=require` pour Neon.

### Build timeout sur Fly.io
```bash
fly deploy --remote-only  # Build sur les serveurs Fly
```

### Vérifier la santé du serveur
```bash
curl https://imperium-antiquitas.fly.dev/health
# Doit retourner: {"status":"ok","version":"0.6.0"}
```

### Reset la base de données
```bash
npx prisma db push --force-reset
```
