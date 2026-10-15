# Qafila — spécification de design (référence : Quiche Browser)

Objectif : un navigateur **épuré, élégant, monochrome**, où presque tout est réglable. Les visuels de référence
(site officiel de Quiche) sont décrits ici ; les deux applis (iOS SwiftUI, Android Compose) doivent les reproduire.

## 1. Langage visuel

- Typographie système (SF Pro / Roboto). Tailles petites et précises. Icônes **au trait fin** (SF Symbols `.light` / Material Outlined).
- Couleurs neutres : fond de barre clair `#F2F2F7`, cartes blanches, texte `#111`, gris secondaires `#8E8E93`.
  Sombre : barre `#1C1C1E`, cartes `#2C2C2E`, texte `#F2F2F7`.
- Rayons : carte d'adresse 12, menu 18, vignettes d'onglet 14, pastilles 999.
- Pas d'ombres lourdes : ombre douce uniquement sous le menu flottant (rayon 24, opacité 0,15).
- Animations courtes (0,2 s), ressort léger à l'ouverture du menu (échelle 0,92 → 1 depuis le coin du bouton).

## 2. Barre du bas (« chrome »)

Bloc unique collé en bas, fond = couleur de barre (voir 6) ou matériau translucide (style « Verre »).
Marges : 10 latérales, 8 au-dessus, zone de sécurité en dessous.

```
┌──────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────┐ │  ← carte d'adresse (si l'adresse n'est pas « en ligne »)
│ │ [fav] AEON.CO                    [19 min] │ │     DOMAINE : 9,5 pt, gras, capitales, interlettrage 0,6
│ │       Tech-vexed: how digital life thr…   │ │     titre : 12,5 pt, 1 ligne, tronqué
│ └──────────────────────────────────────────┘ │
│   ‹     ›     ⇪     +     ▢7     ⋯          │  ← rangée d'icônes, hauteur 44, réparties
└──────────────────────────────────────────────┘
```

### Styles de barre d'adresse (`addressStyle`)
1. **Carte** (défaut) : carte blanche, DOMAINE en capitales + titre en dessous, alignés à gauche, favicon optionnel à gauche, temps de lecture optionnel en pastille à droite.
2. **Adresse complète** : carte blanche, URL complète sans `https://`, une ligne.
3. **Domaine centré** : capsule grise pleine largeur, domaine centré 15 pt.
4. **Titre + lecture** : carte, favicon + titre (une ligne) + pastille « 19 min ».
5. **Centré sans carte** : DOMAINE en capitales centré sur titre centré, directement sur la barre.
6. **Masquée** : pas d'adresse (mode minimal) ; on l'édite via un bouton Rechercher ou le menu.

Contenu réglable indépendamment : favicon (oui/non), temps de lecture (oui/non).

### Adresse « en ligne »
La barre peut contenir l'action spéciale `address` : l'adresse se place alors **dans** la rangée d'icônes (prend l'espace libre),
par ex. `+  [MINIMALISM.COM / What is minimalism?]  ▢  ✕` ou `[minimalism.com]  ▢  ≡`.

### Rangée d'icônes
- Chaque emplacement : icône seule, taille Petit 17 / Moyen 20 / Grand 23, graisse réglable (Fine / Normale / Grasse).
- Bouton Onglets : carré arrondi au trait avec le nombre d'onglets à l'intérieur (police 10 pt).
- Bouton Menu : `⋯`, `⋯` cerclé ou `≡` cerclé (réglage « icône du menu »).
- Boutons désactivés (Précédent impossible…) : opacité 0,3.

### Défilement (`scrollBehavior`)
- **Fixe** : rien ne bouge.
- **Réduire** : la rangée d'icônes disparaît, il reste une mini-adresse (domaine seul, 11 pt) ; un tap la rouvre.
- **Masquer** : toute la barre glisse hors de l'écran ; elle revient en remontant ou en tapant en bas.

### Saisie
Un tap sur l'adresse (ou appui long si « le tap ouvre le menu » est activé) passe en mode saisie :
la carte devient un champ, clavier ouvert, suggestions **au-dessus** de la barre (près du pouce), bouton « Annuler ».

## 3. Menu flottant

Carte translucide (matériau épais clair/sombre), largeur 250, rayon 18, ancrée au-dessus de la barre côté du bouton Menu.
Fond de l'écran légèrement assombri (noir 10 %) ; un tap à côté ferme.

Rendu des éléments configurés (`menu`) :
- Éléments **sans intitulé** consécutifs → **rangée de tuiles** : icône au-dessus d'un petit intitulé (11 pt), ex. « Nouvel onglet | Onglet privé », ou en bas « ‹  ›  ↻  ⇪ » (sans intitulé si plus de 3).
- Éléments **avec intitulé** → **lignes** : intitulé à gauche (15 pt), icône à droite (17 pt), hauteur 42.
- Actions destructives (Fermer cet onglet, Fermer les N onglets, Tout fermer et effacer les données) en **rouge**.
- Séparateurs : trait fin 0,5 pt pleine largeur.

Ouverture du menu : bouton dédié (toujours), **et** au choix : tap sur l'adresse, appui long sur l'adresse.

## 4. Onglets

Plein écran, fond gris groupé (`#F2F2F7` / noir en sombre).

- **Liste** : cartes blanches arrondies groupées. Ligne : favicon 26, titre 14 pt medium (2 lignes max), DOMAINE en capitales 10 pt gris, pastille de temps de lecture à droite. Ligne active : coche discrète. Balayer pour fermer.
- **Grille** : 2 colonnes (grandes vignettes, ratio 3:4) ou 3 colonnes (petites). Vignette = capture de la page, rayon 14, petit ✕ cerclé en haut à droite ; dessous : favicon 14 + titre 12 pt une ligne.
- **Groupés par site** : en-tête DOMAINE (capitales gris 11 pt). En grille groupée, chaque site est un carrousel horizontal.
- **Tri** : date de consultation / temps de lecture / titre.
- Barre du bas : `+` à gauche, pastille centrale « 10 onglets ⌃ » (menu : Onglets / Privés, Fermer tout), icône réglages (curseurs) à droite qui ouvre les réglages d'onglets.

## 5. Page de démarrage

Minimaliste : « Qafila » en serif, « قافلة » dessous en gris, puis les favoris en tuiles (favicon + nom), centrés.

## 6. Réglages (tous ajustables)

Navigation à sous-pages, style réglages iOS sobre (icônes au trait, monochromes). Aperçu en direct de la barre en haut des pages d'apparence.

**Apparence**
- Thème : Système / Clair / Sombre
- Couleur d'accent : Monochrome, Indigo, Bleu, Turquoise, Vert, Orange, Rose, Rouge
- Couleur de la barre — mode clair : Auto (couleur du site), Blanc, Gris clair, Lilas, Rose, Ardoise, Graphite, Noir
- Couleur de la barre — mode sombre : mêmes choix
- Style de la barre : Classique (couleur pleine) / Verre (translucide)
- Icône de l'application : Classique, Sombre, Encre, Désert (icônes alternatives)
- Vibrations

**Barre d'outils**
- Personnaliser la barre et le menu (éditeur) ; Galerie de barres (presets)
- Position : En bas / En haut ; Barre en haut en mode paysage
- Graisse des icônes : Fine / Normale / Grasse
- Icône du menu : ⋯ / ⋯ cerclé / ≡ cerclé
- Au défilement : Fixe / Réduire / Masquer
- Gestes de bord d'écran pour Précédent / Suivant

**Barre d'adresse**
- Style (les 6 styles ci-dessus, avec aperçu)
- Afficher le favicon ; Afficher le temps de lecture
- Le tap sur l'adresse : Modifier l'adresse / Ouvrir le menu
- Appui long sur l'adresse : Ouvrir le menu / Copier l'adresse / Rien

**Onglets**
- Affichage : Liste / Grille ; Vignettes : Grandes / Petites
- Tri : Date / Temps de lecture / Titre ; Grouper par site
- Nouvel onglet ouvre : Page de démarrage / Moteur de recherche / Site personnalisé (+ adresse)
- Fermer automatiquement les onglets : Jamais / Après 1 jour / 1 semaine / 1 mois
- Mode confort (une main) : listes, menus et suggestions rapprochés du pouce

**Recherche**
- Moteur : DuckDuckGo, Kagi, Qwant, Brave, Startpage, Ecosia, Google, Bing, SearXNG (instance), Qafila (serveur), Personnalisé (modèle avec %s)
- Suggestions : Partout / Sauf onglets privés / Jamais
- Masquer les réponses IA dans les résultats (Google, DuckDuckGo, Bing, Brave)

**Confidentialité et sécurité**
- Bloquer les publicités ; Bloquer les traqueurs ; Masquer les bandeaux de cookies
- Sites où le bloqueur est désactivé (liste)
- JavaScript (global) + sites sans JavaScript (liste)
- Passer en HTTPS automatiquement
- Effacer l'historique et les données de sites ; Effacer en fermant tous les onglets

**Lecture**
- Assombrir tous les sites ; Seulement en mode sombre ; Exceptions (liste)
- Taille du texte des pages (80 % à 150 %)
- Langue de traduction (Français, Anglais, Arabe, Espagnol, Allemand…)
- Site bureau par défaut

**Énergie**
- Mettre en veille les onglets en arrière-plan en mode Économie d'énergie

**À propos** : version, moteur, confidentialité, code source.

## 7. Galerie de barres (presets)
Complète `‹ › ⇪ + ▢ ⋯` · Navigation `‹ › ▢ + ✕` · Outils `‹ ↶ 🖥 📖 ▢ ✕ ⋯` · Lecteur `文A ▣ JS ⌃ + ▢ ✕` · Minimal `[adresse] ▢ ≡` · Zen `+ [adresse] ▢ ✕`
