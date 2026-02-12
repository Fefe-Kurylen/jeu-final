# Imperium Antiquitas - Deploiement Fly.io

## Prerequis

- Compte Fly.io : https://fly.io
- CLI flyctl installe :
  ```bash
  # Linux/Mac
  curl -L https://fly.io/install.sh | sh

  # Windows (PowerShell)
  powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
  ```

## 1. Connexion

```bash
fly auth login
```

## 2. Creer l'application

```bash
# Depuis la racine du projet
fly launch --no-deploy
```

Quand il demande :
- **App name** : `imperium-antiquitas` (ou un autre nom)
- **Region** : `cdg` (Paris) recommande
- **Database** : repondre Non (on la cree separement)

## 3. Creer la base de donnees PostgreSQL

```bash
# Creer un cluster Postgres (plan free : 1 shared CPU, 256MB, 1GB disk)
fly postgres create --name imperium-db --region cdg

# Attacher la DB a l'app (cree automatiquement DATABASE_URL)
fly postgres attach imperium-db --app imperium-antiquitas
```

La variable `DATABASE_URL` est automatiquement ajoutee aux secrets de l'app.

## 4. Configurer les secrets

```bash
# Secret JWT (generer un mot de passe fort)
fly secrets set JWT_SECRET="$(openssl rand -hex 32)" --app imperium-antiquitas
```

Pour verifier les secrets configures :
```bash
fly secrets list --app imperium-antiquitas
```

## 5. Deployer

```bash
fly deploy
```

Le deploiement va :
1. Builder l'image Docker (multi-stage)
2. Executer `prisma db push` (release_command)
3. Demarrer le serveur Node.js
4. Verifier le healthcheck sur `/api/health`

## 6. Verifier

```bash
# Ouvrir l'app dans le navigateur
fly open

# Voir les logs en temps reel
fly logs

# Verifier le statut
fly status
```

## URL finale

Apres deploiement, le jeu est accessible sur :
```
https://imperium-antiquitas.fly.dev
```

---

## Commandes utiles

### Logs et monitoring

```bash
# Logs en temps reel
fly logs

# Statut de l'app
fly status

# Dashboard web
fly dashboard
```

### Gestion de la base de donnees

```bash
# Se connecter a la DB en CLI
fly postgres connect -a imperium-db

# Reset la base de donnees
fly ssh console -a imperium-antiquitas -C "npx prisma db push --force-reset"
```

### Scaling

```bash
# Augmenter la RAM (si besoin)
fly scale memory 1024

# Mettre 2 machines (haute disponibilite)
fly scale count 2

# Voir la config actuelle
fly scale show
```

### Redemarrer

```bash
fly apps restart imperium-antiquitas
```

### Mise a jour

Apres un `git push`, re-deployer :
```bash
fly deploy
```

---

## Variables d'environnement

| Variable | Valeur | Note |
|----------|--------|------|
| `DATABASE_URL` | (auto via `fly postgres attach`) | Ne pas modifier manuellement |
| `JWT_SECRET` | (secret) | `fly secrets set JWT_SECRET=...` |
| `NODE_ENV` | `production` | Configure dans fly.toml |
| `PORT` | `3000` | Configure dans fly.toml |

---

## Couts

### Plan gratuit (Hobby)
- **3 VMs shared-cpu-1x 256MB** gratuites
- **1 cluster Postgres** gratuit (1GB stockage)
- Bande passante : 100GB/mois gratuit

### Estimation avec joueurs
- 1-100 joueurs : **gratuit** (shared-cpu, 512MB)
- 100-500 joueurs : **~5$/mois** (dedicated-cpu, 1GB)
- 500+ joueurs : **~15$/mois** (scale count 2 + dedicated)

---

## Depannage

### Erreur "no machines in group app"
```bash
fly scale count 1
```

### Erreur Prisma "binary not found"
Le Dockerfile utilise `node:18-slim` (Debian) et le schema Prisma inclut `debian-openssl-3.0.x`. Si erreur :
```bash
fly ssh console -a imperium-antiquitas -C "npx prisma generate"
fly apps restart imperium-antiquitas
```

### Erreur "database connection failed"
Verifier que le Postgres est attache :
```bash
fly postgres attach imperium-db --app imperium-antiquitas
```

### La machine s'arrete toute seule
C'est normal avec `auto_stop_machines = 'stop'`. Elle redemarre automatiquement a la prochaine requete HTTP (delai 2-5s).

### Build timeout
```bash
# Builder avec plus de temps
fly deploy --build-timeout 600
```
