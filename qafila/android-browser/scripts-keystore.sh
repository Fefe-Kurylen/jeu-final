#!/usr/bin/env bash
# Crée le keystore de signature Google Play (à faire UNE fois, à conserver précieusement : il ne peut pas être régénéré).
set -e
read -rp "Mot de passe du keystore : " -s PASS; echo
keytool -genkeypair -v -keystore qafila-release.jks -alias qafila -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=Qafila, OU=Mobile, O=Qafila, L=Nimes, C=FR"
cat > keystore.properties <<EOT
KEYSTORE_FILE=$(pwd)/qafila-release.jks
KEYSTORE_PASSWORD=$PASS
KEY_ALIAS=qafila
KEY_PASSWORD=$PASS
EOT
echo
echo "Keystore créé : qafila-release.jks (ne jamais le committer : il est dans .gitignore)."
echo "Pour GitHub Actions, secret ANDROID_KEYSTORE_BASE64 = $(base64 -w0 qafila-release.jks | head -c 40)… (commande : base64 -w0 qafila-release.jks)"
