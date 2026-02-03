@echo off
title MonJeu v0.6 - Combat PvP + Armees
color 0A
echo.
echo =============================================
echo      MONJEU v0.6 - Combat PvP + Armees
echo      Style Travian / Rise of Kingdoms
echo =============================================
echo.
echo [1/4] Verification Docker...
docker ps > nul 2>&1
if errorlevel 1 (
    echo ERREUR: Docker n'est pas lance!
    echo Lance Docker Desktop et reessaye.
    pause
    exit /b 1
)
echo OK - Docker fonctionne
echo.

echo [2/4] Lancement PostgreSQL...
docker-compose up -d
timeout /t 3 > nul
echo OK - Base de donnees lancee
echo.

echo [3/4] Installation des dependances...
call npm install --silent
echo OK - Dependances installees
echo.

echo [4/4] Configuration base de donnees...
call npx prisma generate
call npx prisma db push --accept-data-loss
echo OK - Base de donnees configuree
echo.

echo =============================================
echo   SERVEUR PRET !
echo   Ouvre http://localhost:3000 dans ton navigateur
echo   
echo   NOUVEAUTES v0.6:
echo   - Interface style Travian (medieval)
echo   - Combat PvP entre joueurs
echo   - Mouvement d'armees sur la carte
echo   - Raids et pillage de ressources
echo =============================================
echo.
echo Appuie sur Ctrl+C pour arreter le serveur
echo.
node src/server.js
pause
