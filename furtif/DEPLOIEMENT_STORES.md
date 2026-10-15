# 🚀 Publier Furtif Browser sur l'App Store et Google Play

Tout ce qui pouvait être préparé sans vos comptes l'a été : code iOS et Android, icônes, textes de fiche,
politique de confidentialité, chaînes de compilation et de publication automatiques. Il reste les étapes qui
exigent **vos** comptes développeur. Suivez les cases dans l'ordre.

## 0. Prérequis communs

- [ ] Déployer le site Furtif (dossier `furtif/`) pour que la politique de confidentialité soit en ligne :
      `https://<votre-domaine>/confidentialite` (page déjà incluse). Remplacer `furtif.example.com` par votre domaine dans
      `ios-browser/fastlane/metadata/*/privacy_url.txt`, `marketing_url.txt` et `android-browser/play/listing/fr-FR.md`.
- [x] Captures d'écran : **déjà prêtes**, générées par le workflow *Furtif captures stores* (vraie appli dans un simulateur iPhone 16 Pro Max
      et un émulateur Android) et rangées dans le dépôt :
      `ios-browser/fastlane/screenshots/fr-FR/` (6 × 1320×2868, format 6,9" — envoyées automatiquement par la lane `release`)
      et `android-browser/play/screenshots/phone/` (6 × 1080×1920, format 9:16 — à glisser dans la Play Console).
      Elles se régénèrent à chaque modification du code des applis (artefacts `store-screenshots-ios` / `-android`).

## 1. App Store (iOS)

### Comptes et identifiants
- [ ] Adhérer à l'**Apple Developer Program** (99 €/an) : https://developer.apple.com/programs/enroll/
- [ ] Dans App Store Connect → *Utilisateurs et accès* → *Clés d'intégration* : créer une **clé API App Store Connect** (rôle App Manager).
      Noter l'**Issuer ID**, le **Key ID** et télécharger le fichier `.p8`.
- [ ] Dans *Certificats, identifiants et profils* : créer l'**App ID** `fr.furtif.FurtifBrowser` (aucune capacité spéciale requise).
- [ ] Dans App Store Connect → *Mes apps* → **+** : créer l'app « Furtif : Navigateur Internet », bundle `fr.furtif.FurtifBrowser`, SKU `furtif-browser`.

### Secrets GitHub (Settings → Secrets and variables → Actions)
| Secret | Valeur |
|---|---|
| `APPLE_TEAM_ID` | Identifiant d'équipe (10 caractères, visible sur developer.apple.com/account) |
| `APP_STORE_CONNECT_KEY_ID` | Key ID de la clé API |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
| `APP_STORE_CONNECT_KEY_CONTENT` | Contenu du `.p8` encodé : `base64 -i AuthKey_XXXX.p8 \| pbcopy` |
| `IOS_CERT_P12_BASE64` | Certificat de distribution exporté en `.p12` depuis Trousseau d'accès, encodé en base64 (`base64 -i cert.p12 \| pbcopy`) |
| `IOS_CERT_PASSWORD` | Mot de passe choisi à l'export du `.p12` |

### Lancer
- [ ] **Vérifier la compilation** : onglet *Actions* → *Furtif iOS* → *Run workflow* → lane `build`. Ce job tourne sur un Mac GitHub
      et compile réellement le projet contre le SDK iOS. S'il remonte des erreurs, collez-les moi, je corrige.
- [ ] **TestFlight** : *Run workflow* → lane `beta`. Le build apparaît dans App Store Connect → TestFlight en 10 à 30 min ; installez-le sur votre iPhone via l'app TestFlight.
- [ ] **App Store** : *Run workflow* → lane `release`. Les métadonnées FR/EN (`ios-browser/fastlane/metadata`) sont envoyées et l'app est soumise à la validation.
      Les captures de `fastlane/screenshots/fr-FR` sont envoyées en même temps.
- [ ] Questionnaire *Confidentialité de l'app* dans App Store Connect : répondre « **Aucune donnée collectée** » (conforme au `PrivacyInfo.xcprivacy`).
- [ ] Classification : 17+ n'est pas nécessaire ; cocher « Accès web sans restriction » (navigateur), ce qui donne **17+** automatiquement comme pour Quiche (16+ en France).

Sans Mac, tout passe par GitHub Actions. Avec un Mac : `cd ios-browser && brew install xcodegen && xcodegen generate && open FurtifBrowser.xcodeproj`, puis Product → Archive → Distribute.

## 2. Google Play (Android)

### Comptes et identifiants
- [ ] Créer un compte **Google Play Console** (25 $ une fois) : https://play.google.com/console/signup
- [ ] Créer l'application « Furtif : Navigateur Internet », type *Application*, gratuite, langue par défaut français.
- [ ] Générer le **keystore de signature** (une seule fois, à sauvegarder dans un gestionnaire de mots de passe, il est irremplaçable) :
      `cd android-browser && ./scripts-keystore.sh`
- [ ] Dans Play Console → *Configuration* → *Accès à l'API* : lier un projet Google Cloud, créer un **compte de service** avec le rôle
      *Administrateur de versions*, télécharger sa clé JSON, puis l'inviter dans *Utilisateurs et autorisations* de l'app.

### Secrets GitHub
| Secret | Valeur |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 furtif-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du keystore |
| `ANDROID_KEY_ALIAS` | `furtif` |
| `ANDROID_KEY_PASSWORD` | Mot de passe de la clé (identique) |
| `PLAY_SERVICE_ACCOUNT_JSON` | Contenu complet du fichier JSON du compte de service |

### Lancer
- [ ] **Premier envoi manuel obligatoire** : Google exige que le tout premier bundle soit déposé à la main. Lancer *Furtif Android* → *Run workflow*
      → piste `internal`, récupérer l'artefact `furtif-release-aab` et le glisser dans Play Console → *Tests internes* → *Créer une version*.
      (Si l'envoi automatique échoue avec « applicationNotFound », c'est ce cas.) Les envois suivants sont automatiques.
- [ ] Remplir la fiche depuis `android-browser/play/listing/fr-FR.md` : titre, descriptions, icône 512 (`play/icon-512.png`),
      visuel de présentation (`play/feature-graphic-1024x500.png`), captures d'écran (`play/screenshots/phone/`).
- [ ] *Contenu de l'application* : politique de confidentialité (URL), **Sécurité des données** → « Aucune donnée collectée ni partagée »,
      questionnaire de classification (type *Autre* → navigateur avec accès web non contrôlé), publicités : non, application de navigation web : oui.
- [ ] Promouvoir de *Tests internes* vers *Production* une fois satisfait.

## Vérifié dans le dépôt

| Vérification | Résultat |
|---|---|
| Compilation iOS (Xcode, macOS GitHub) | ✅ |
| Lancement réel dans un simulateur iPhone 16 Pro Max | ✅ captures générées |
| Compilation Android debug + lint | ✅ |
| Bundle **release** Android minifié et signé (clé de test) | ✅ AAB 3,1 Mo, APK 1,3 Mo, API cible 35 |
| Lancement réel dans un émulateur Android 13 | ✅ captures générées |
| Envoi TestFlight / App Store / Google Play | ⏳ nécessite vos comptes et secrets |

## 3. Après publication

- [ ] Mettre à jour `release_notes.txt` (iOS) et `play/whatsnew/*` (Android) à chaque version, puis relancer les workflows.
- [ ] Les numéros de build sont automatiques (`github.run_number`) ; la version marketing est `1.0.<run>` côté Android et `MARKETING_VERSION` dans `project.yml` côté iOS.
