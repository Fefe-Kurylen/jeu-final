# 🚂 MonJeu v0.6 - Déploiement Railway

## 📋 Étapes de Déploiement

### 1. Push sur GitHub

```bash
git init
git add .
git commit -m "MonJeu v0.6"
git remote add origin https://github.com/VOTRE_USER/monjeu.git
git push -u origin main
```

### 2. Créer le Projet Railway

1. Aller sur **https://railway.app**
2. **New Project** → **Deploy from GitHub repo**
3. Sélectionner votre repo `monjeu`

### 3. Ajouter PostgreSQL

1. Dans le projet, cliquer **+ New**
2. **Database** → **PostgreSQL**
3. Attendre ~30 secondes

### 4. Lier DATABASE_URL

1. Cliquer sur le service (votre code)
2. **Variables** → **+ Add Variable**
3. Sélectionner **Add Reference** → **PostgreSQL** → **DATABASE_URL**

### 5. Ajouter JWT_SECRET

Dans **Variables** :
```
JWT_SECRET = (cliquer Generate)
NODE_ENV = production
```

### 6. Générer le Domaine

1. **Settings** → **Networking**
2. **Generate Domain**

### 7. C'est tout !

Le déploiement prend 2-5 minutes.

---

## 🔧 Variables d'Environnement

| Variable | Valeur |
|----------|--------|
| `DATABASE_URL` | (Reference → PostgreSQL) |
| `JWT_SECRET` | (Generate) |
| `NODE_ENV` | `production` |

---

## 🐛 Si ça ne marche pas

### Erreur Prisma "binary not found"
→ Le `binaryTargets` dans `schema.prisma` doit inclure `linux-musl-openssl-3.0.x`

### Erreur "Cannot connect to database"
→ Vérifier que DATABASE_URL est bien liée (pas copiée manuellement)

### Build timeout
→ Augmenter le timeout dans Settings ou re-déployer

### 503 Service Unavailable
→ Le serveur démarre mais crash. Voir les logs dans Deployments.

---

## 📊 Logs

- **Build logs** : Deployments → [deployment] → Build Logs
- **Runtime logs** : Deployments → [deployment] → Deploy Logs

---

## 💰 Coûts

- **5$/mois gratuit** inclus
- Après: ~0.01$/heure d'utilisation
- Estimation 1000 joueurs: **10-20$/mois**
