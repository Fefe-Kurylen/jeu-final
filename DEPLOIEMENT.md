# Imperium Antiquitas v0.6 - Guide de Deploiement (Render.com)

## 1. Creer un compte Render
- Aller sur https://render.com
- S'inscrire avec GitHub

## 2. Creer une base de donnees PostgreSQL

1. Dashboard → **New +** → **PostgreSQL**
2. Nom: `imperium-db`
3. Region: Frankfurt (EU)
4. Plan: **Free**
5. Cliquer **Create Database**
6. Copier l'**Internal Database URL** (commence par `postgres://...`)

## 3. Deployer le Backend

1. Dashboard → **New +** → **Web Service**
2. Connecter votre repo GitHub
3. Configuration:
   - **Name**: `imperium-antiquitas`
   - **Region**: Frankfurt
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install && npx prisma generate && npx prisma db push`
   - **Start Command**: `node src/server.js`
   - **Plan**: Free

4. Variables d'environnement (Environment):
   ```
   DATABASE_URL = [coller l'Internal Database URL de l'etape 2]
   JWT_SECRET = [une cle secrete longue et complexe]
   NODE_ENV = production
   PORT = 10000
   ```

5. Cliquer **Create Web Service**

## 4. URL Finale

Apres deploiement, le jeu sera accessible sur:
```
https://imperium-antiquitas.onrender.com
```

---

## Notes importantes

### Temps de demarrage (Render Free)
- Les services gratuits sur Render "dorment" apres 15min d'inactivite
- Le premier chargement peut prendre 30-60 secondes
- Pour eviter ca: utiliser un service de ping (UptimeRobot)

### Base de donnees gratuite
- Render: 1GB PostgreSQL, expire apres 90 jours (renouvelable)

### CORS
Le serveur est deja configure pour accepter toutes les origines.

---

## Commandes utiles

### Voir les logs
Dashboard → Deployments → Logs

### Reset la base de donnees
```bash
npx prisma db push --force-reset
```

### Generer le client Prisma
```bash
npx prisma generate
```
