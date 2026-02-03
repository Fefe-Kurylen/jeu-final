# MonJeu v0.6 - Guide de Déploiement

## Déploiement sur Render.com (GRATUIT)

### 1. Créer un compte Render
- Aller sur https://render.com
- S'inscrire avec GitHub

### 2. Créer une base de données PostgreSQL

1. Dashboard → **New +** → **PostgreSQL**
2. Nom: `monjeu-db`
3. Region: Frankfurt (EU)
4. Plan: **Free**
5. Cliquer **Create Database**
6. Copier l'**Internal Database URL** (commence par `postgres://...`)

### 3. Déployer le Backend

1. Dashboard → **New +** → **Web Service**
2. Connecter votre repo GitHub (ou "Deploy from Git")
3. Configuration:
   - **Name**: `monjeu-api`
   - **Region**: Frankfurt
   - **Branch**: main
   - **Root Directory**: (laisser vide)
   - **Runtime**: Node
   - **Build Command**: `npm install && npx prisma generate && npx prisma db push`
   - **Start Command**: `node src/server.js`
   - **Plan**: Free

4. Variables d'environnement (Environment):
   ```
   DATABASE_URL = [coller l'Internal Database URL de l'étape 2]
   JWT_SECRET = votre_secret_tres_long_et_complexe
   NODE_ENV = production
   PORT = 10000
   ```

5. Cliquer **Create Web Service**

### 4. URL Finale

Après déploiement, votre jeu sera accessible sur:
```
https://monjeu-api.onrender.com
```

### 5. Mise à jour du Frontend

Si vous avez déployé le frontend séparément, mettez à jour `app.js`:
```javascript
const API = 'https://monjeu-api.onrender.com';
```

---

## Alternative: Railway.app

### 1. Créer un compte Railway
- https://railway.app
- S'inscrire avec GitHub

### 2. Nouveau projet
1. **New Project** → **Deploy from GitHub repo**
2. Sélectionner votre repo
3. Railway détecte automatiquement Node.js

### 3. Ajouter PostgreSQL
1. Dans le projet, cliquer **+ New**
2. Choisir **Database** → **PostgreSQL**
3. La variable `DATABASE_URL` est automatiquement ajoutée

### 4. Variables d'environnement
Cliquer sur le service → **Variables**:
```
JWT_SECRET = votre_secret
NODE_ENV = production
```

---

## Notes importantes

### Temps de démarrage (Render Free)
- Les services gratuits sur Render "dorment" après 15min d'inactivité
- Le premier chargement peut prendre 30-60 secondes
- Pour éviter ça: utiliser un service de ping (UptimeRobot)

### Base de données gratuite
- Render: 1GB, expire après 90 jours (renouvelable)
- Railway: $5 de crédit gratuit/mois

### CORS
Le serveur est déjà configuré pour accepter toutes les origines.

---

## Commandes utiles

### Voir les logs
```bash
# Render: Dashboard → Logs
# Railway: Dashboard → Deployments → Logs
```

### Reset la base de données
```bash
npx prisma db push --force-reset
```

### Générer le client Prisma
```bash
npx prisma generate
```
