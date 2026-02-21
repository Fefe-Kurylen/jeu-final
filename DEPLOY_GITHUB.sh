#!/bin/bash
# ===========================================
# MonJeu v0.6 - Script de déploiement GitHub
# ===========================================

# CONFIGURE ICI :
GITHUB_USER="ton_username"
REPO_NAME="monjeu"
BRANCH="main"

# -------------------------------------------

echo "🚀 Déploiement MonJeu v0.6 sur GitHub..."

# Initialiser Git si nécessaire
if [ ! -d ".git" ]; then
    echo "📁 Initialisation du repo Git..."
    git init
    git branch -M $BRANCH
fi

# Ajouter tous les fichiers
echo "📦 Ajout des fichiers..."
git add .

# Commit
echo "💾 Commit..."
git commit -m "MonJeu v0.6 - Army Management System

✅ Nouveau système de gestion d'armées
✅ Interface two-column avec composition fluide
✅ Prérequis recrutement: Niv.1 base, Niv.9 inter, Niv.15 elite
✅ 6 nouveaux endpoints backend
✅ Schéma Prisma mis à jour (slot, isGarrison)
✅ Optimisé pour Render"

# Ajouter remote si nécessaire
if ! git remote | grep -q origin; then
    echo "🔗 Ajout du remote origin..."
    git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git
fi

# Push
echo "⬆️ Push vers GitHub..."
git push -u origin $BRANCH

echo ""
echo "✅ Terminé ! Ton code est sur https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "📌 Prochaine étape : Déployer sur Render"
echo "   1. Va sur https://render.com"
echo "   2. New + → Web Service → Deploy from GitHub"
echo "   3. Sélectionne '$REPO_NAME'"
