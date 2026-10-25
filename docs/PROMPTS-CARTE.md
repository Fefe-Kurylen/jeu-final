# Carte du monde — les 378 images à produire, avec leurs prompts

Généré par `node tools/repaint/map-kit.cjs` (ne pas éditer à la main). Style et découpage : [la carte de référence](img/carte-reference.jpg)
et [CARTE-REFERENCE.md](CARTE-REFERENCE.md) (décisions du 25 octobre 2026). Seule la carte du monde change de style ; la vue de la
ville et l'interface gardent le style peint.

## Comment produire une image

1. Donne à l'outil d'images **la référence de style** en première image : [carte-reference.jpg](img/carte-reference.jpg) (toujours la même).
2. Sauf pour le sol, donne **l'image guide** indiquée en deuxième image : elle montre en rouge la place de la case au sol
   ([élément d'une case](img/guides-carte/guide-objet.png), [ville 2 × 2](img/guides-carte/guide-ville.png),
   [armée](img/guides-carte/guide-armee.png)). Le guide sert seulement à placer le sujet : ni le losange rouge ni le fond gris ne doivent apparaître.
3. Colle **le prompt** de l'image (bloc de texte sous son nom), demande une image carrée 1024 × 1024 (512 × 512 pour les effets).
4. Enregistre en **PNG** sous **exactement le nom indiqué** (avec ses dossiers), par exemple `map/world/forest/temperate_1.png`.
   Fond transparent ; sinon un fond uni magenta (#FF00FF), détouré à l'import. Le sol, lui, est opaque.
5. Envoie les PNG (un dossier ou un zip, par petits lots si tu veux) : je les importe
   (`node tools/repaint.cjs --import=<dossier>`), ils remplacent aussitôt le dessin provisoire. Une image absente garde le dessin actuel.

Ordre conseillé : le sol d'abord (7 images, c'est ce qui change le plus la carte), puis les forêts, les rochers et les villes.

## Sommaire

| # | Partie | Images |
|---|---|---|
| 1 | [Sol](#partie-1) | 7 |
| 2 | [Forêts](#partie-2) | 14 |
| 3 | [Rochers et montagnes](#partie-3) | 15 |
| 4 | [Rivières : ponts et gués](#partie-4) | 4 |
| 5 | [Désert : dunes, ruines, palmiers](#partie-5) | 8 |
| 6 | [Eau : bateaux et quais (décor)](#partie-6) | 5 |
| 7 | [Villes sur 2 × 2 cases](#partie-7) | 32 |
| 8 | [Villes assiégées (animation en 4 images)](#partie-8) | 120 |
| 9 | [Points de ressource](#partie-9) | 15 |
| 10 | [Camps des tribus, fondation, bannières](#partie-10) | 21 |
| 11 | [Armées en marche](#partie-11) | 43 |
| 12 | [Animations des armées](#partie-12) | 74 |
| 13 | [Effets de la carte](#partie-13) | 20 |
| | **Total** | **378** |

<a id="partie-1"></a>

## 1. Sol

Une texture répétable par type de sol, vue de dessus. Le jeu la projette en isométrique et fait lui-même les fondus irréguliers entre sols voisins (berges de sable, taches d'herbe sèche, champs labourés) : pas de tuiles de transition à produire. Pas d'image guide.

### `map/world/ground/grass.png`

Sol de la carte : herbe (texture répétable ; le jeu fait les fondus avec les sols voisins)  
**Taille** : 1024x1024 (opaque) · **Guide** : aucun

```text
Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.

Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).

Subject: lush short green meadow grass with very small flowers and subtle colour variations, like the green areas of the reference.
```

### `map/world/ground/drygrass.png`

Sol de la carte : herbe sèche (texture répétable ; le jeu fait les fondus avec les sols voisins)  
**Taille** : 1024x1024 (opaque) · **Guide** : aucun

```text
Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.

Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).

Subject: golden dry steppe grass, short and slightly patchy with a little bare earth showing, like the yellow areas of the reference.
```

### `map/world/ground/earth.png`

Sol de la carte : terre labourée (texture répétable ; le jeu fait les fondus avec les sols voisins)  
**Taille** : 1024x1024 (opaque) · **Guide** : aucun

```text
Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.

Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).

Subject: brown ploughed field earth with straight parallel furrows running exactly horizontally across the image (the furrows must continue across the left and right edges), a few clods, like the brown fields of the reference.
```

### `map/world/ground/sand.png`

Sol de la carte : sable (texture répétable ; le jeu fait les fondus avec les sols voisins)  
**Taille** : 1024x1024 (opaque) · **Guide** : aucun

```text
Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.

Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).

Subject: warm ochre sand, like the riverbanks and beaches of the reference: fine wind ripples and a few small pebbles.
```

### `map/world/ground/water.png`

Sol de la carte : eau (texture répétable ; le jeu fait les fondus avec les sols voisins)  
**Taille** : 1024x1024 (opaque) · **Guide** : aucun

```text
Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.

Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).

Subject: clear deep blue river and lake water with gentle ripples and soft light reflections, as in the river of the reference.
```

### `map/world/ground/snow.png`

Sol de la carte : neige (texture répétable ; le jeu fait les fondus avec les sols voisins)  
**Taille** : 1024x1024 (opaque) · **Guide** : aucun

```text
Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.

Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).

Subject: fresh white snow with soft blue shadows and small wind drifts.
```

### `map/world/ground/ice.png`

Sol de la carte : glace (texture répétable ; le jeu fait les fondus avec les sols voisins)  
**Taille** : 1024x1024 (opaque) · **Guide** : aucun

```text
Ground texture for the world map of a stylised 3D-rendered mobile strategy game, in exactly the colours and the soft realistic rendering of the ground of the first reference image (an ancient-world map): natural saturated colours, fine realistic detail, soft ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. Fully opaque image, no transparency. No text, no letters, no numbers, no watermark.

Composition: a SEAMLESS TILEABLE square ground texture (1024 x 1024) seen straight from above (top-down, no perspective, no horizon): the left edge continues the right edge and the top edge continues the bottom edge with no visible seam. Even lighting with only very soft relief shading (no cast shadows, no light gradient across the image), even density everywhere, no single feature that stands out and would be seen repeating. Ground only: nothing taller than a pebble or a tuft of grass. The image covers about 6 x 6 map tiles: details are small (a tuft of grass is about 1/100 of the image width).

Subject: pale blue frozen water: smooth ice with fine white cracks and a light dusting of snow.
```

<a id="partie-2"></a>

## 2. Forêts

Une case de forêt dense ; le jeu prend une « lisière » pour une case peu entourée de forêt. Les cases voisines se fondent en un seul massif.

### `map/world/forest/snow_1.png`

Forêt de sapins enneigés (variante 1), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of snow-covered pine trees filling the whole tile, snow on the branches and drifts at their feet; trees may overflow the tile by up to 15% so that neighbouring clumps merge
```

### `map/world/forest/snow_2.png`

Forêt de sapins enneigés (variante 2), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of snow-covered pine trees filling the whole tile, snow on the branches and drifts at their feet; trees may overflow the tile by up to 15% so that neighbouring clumps merge
```

### `map/world/forest/snow_3.png`

Forêt de sapins enneigés (variante 3), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of snow-covered pine trees filling the whole tile, snow on the branches and drifts at their feet; trees may overflow the tile by up to 15% so that neighbouring clumps merge
```

### `map/world/forest/snow_4.png`

Forêt de sapins enneigés (variante 4), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of snow-covered pine trees filling the whole tile, snow on the branches and drifts at their feet; trees may overflow the tile by up to 15% so that neighbouring clumps merge
```

### `map/world/forest/snow_edge_1.png`

Lisière de forêt enneigée (variante 1)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the edge of a snowy pine forest on one tile: four or five snow-covered pines
```

### `map/world/forest/snow_edge_2.png`

Lisière de forêt enneigée (variante 2)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the edge of a snowy pine forest on one tile: four or five snow-covered pines
```

### `map/world/forest/snow_edge_3.png`

Lisière de forêt enneigée (variante 3)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the edge of a snowy pine forest on one tile: four or five snow-covered pines
```

### `map/world/forest/temperate_1.png`

Forêt dense en zone tempérée (variante 1), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of mixed forest filling the whole tile: tall dark-green pines and round deciduous trees packed close together, a few bushes at their feet, as in the forests of the reference; trees may overflow the tile by up to 15% so that neighbouring clumps merge into one forest
```

### `map/world/forest/temperate_2.png`

Forêt dense en zone tempérée (variante 2), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of mixed forest filling the whole tile: tall dark-green pines and round deciduous trees packed close together, a few bushes at their feet, as in the forests of the reference; trees may overflow the tile by up to 15% so that neighbouring clumps merge into one forest
```

### `map/world/forest/temperate_3.png`

Forêt dense en zone tempérée (variante 3), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of mixed forest filling the whole tile: tall dark-green pines and round deciduous trees packed close together, a few bushes at their feet, as in the forests of the reference; trees may overflow the tile by up to 15% so that neighbouring clumps merge into one forest
```

### `map/world/forest/temperate_4.png`

Forêt dense en zone tempérée (variante 4), une case  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a dense clump of mixed forest filling the whole tile: tall dark-green pines and round deciduous trees packed close together, a few bushes at their feet, as in the forests of the reference; trees may overflow the tile by up to 15% so that neighbouring clumps merge into one forest
```

### `map/world/forest/temperate_edge_1.png`

Lisière de forêt tempérée (variante 1) : case de forêt peu entourée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the edge of a forest on one tile: five or six pines and deciduous trees, less dense, a few bushes
```

### `map/world/forest/temperate_edge_2.png`

Lisière de forêt tempérée (variante 2) : case de forêt peu entourée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the edge of a forest on one tile: five or six pines and deciduous trees, less dense, a few bushes
```

### `map/world/forest/temperate_edge_3.png`

Lisière de forêt tempérée (variante 3) : case de forêt peu entourée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the edge of a forest on one tile: five or six pines and deciduous trees, less dense, a few bushes
```

<a id="partie-3"></a>

## 3. Rochers et montagnes

Amas de rochers (infranchissables en zone tempérée), rochers du désert (franchissables), montagnes : _x et _y pour une chaîne dans l'axe de la grille, _xy pour le cœur d'un massif.

### `map/world/mountains/snow_x.png`

Chaîne de montagnes (snow) dans l'axe haut-gauche → bas-droite  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a steep icy mountain covered with snow and blue ice: a long ridge running along the tile from its top-left side to its bottom-right side, cut so that it continues into the next tile in that direction
```

### `map/world/mountains/snow_xy.png`

Massif montagneux (snow) entouré de montagnes  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a steep icy mountain covered with snow and blue ice: a massif with several peaks filling the whole tile, so that it merges with mountain tiles on every side
```

### `map/world/mountains/snow_y.png`

Chaîne de montagnes (snow) dans l'axe haut-droite → bas-gauche  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a steep icy mountain covered with snow and blue ice: a long ridge running along the tile from its top-right side to its bottom-left side, cut so that it continues into the next tile in that direction
```

### `map/world/mountains/snow.png`

Montagne isolée (snow), infranchissable  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a steep icy mountain covered with snow and blue ice, standing on one tile
```

### `map/world/mountains/temperate_x.png`

Chaîne de montagnes (temperate) dans l'axe haut-gauche → bas-droite  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a rugged grey mountain with rocky slopes, a few pines at its foot and a light snow cap: a long ridge running along the tile from its top-left side to its bottom-right side, cut so that it continues into the next tile in that direction
```

### `map/world/mountains/temperate_xy.png`

Massif montagneux (temperate) entouré de montagnes  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a rugged grey mountain with rocky slopes, a few pines at its foot and a light snow cap: a massif with several peaks filling the whole tile, so that it merges with mountain tiles on every side
```

### `map/world/mountains/temperate_y.png`

Chaîne de montagnes (temperate) dans l'axe haut-droite → bas-gauche  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a rugged grey mountain with rocky slopes, a few pines at its foot and a light snow cap: a long ridge running along the tile from its top-right side to its bottom-left side, cut so that it continues into the next tile in that direction
```

### `map/world/mountains/temperate.png`

Montagne isolée (temperate), infranchissable  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a rugged grey mountain with rocky slopes, a few pines at its foot and a light snow cap, standing on one tile
```

### `map/world/rocks/boulders_1.png`

Amas de rochers (variante 1), infranchissable  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a grey rock outcrop on one tile: a few large angular boulders with patches of moss and grass, like the rock outcrops of the reference (impassable for armies)
```

### `map/world/rocks/boulders_2.png`

Amas de rochers (variante 2), infranchissable  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a grey rock outcrop on one tile: a few large angular boulders with patches of moss and grass, like the rock outcrops of the reference (impassable for armies)
```

### `map/world/rocks/boulders_3.png`

Amas de rochers (variante 3), infranchissable  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a grey rock outcrop on one tile: a few large angular boulders with patches of moss and grass, like the rock outcrops of the reference (impassable for armies)
```

### `map/world/rocks/boulders_4.png`

Amas de rochers (variante 4), infranchissable  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a grey rock outcrop on one tile: a few large angular boulders with patches of moss and grass, like the rock outcrops of the reference (impassable for armies)
```

### `map/world/rocks/desert_1.png`

Rochers du désert (variante 1) : isolés ou en chaîne, franchissables  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a cluster of low red sandstone rocks with a small cactus, on one tile; neighbouring clusters join into a rocky ridge that armies can still walk through
```

### `map/world/rocks/desert_2.png`

Rochers du désert (variante 2) : isolés ou en chaîne, franchissables  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a cluster of low red sandstone rocks with a small cactus, on one tile; neighbouring clusters join into a rocky ridge that armies can still walk through
```

### `map/world/rocks/desert_3.png`

Rochers du désert (variante 3) : isolés ou en chaîne, franchissables  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a cluster of low red sandstone rocks with a small cactus, on one tile; neighbouring clusters join into a rocky ridge that armies can still walk through
```

<a id="partie-4"></a>

## 4. Rivières : ponts et gués

L'eau fait partie du sol. Un pont ou un gué traverse la rivière d'une rive à l'autre, case par case : _x de haut-gauche vers bas-droite, _y de haut-droite vers bas-gauche. Pont : vitesse normale ; gué : moitié moins vite.

### `map/world/river/bridge_x.png`

Pont (axe haut-gauche → bas-droite) : passage à vitesse normale  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: one section of a wooden bridge deck with railings over river water, running along the tile from its top-left side to its bottom-right side and cut square at both ends so that sections join into one bridge across the river; the water under it is NOT drawn (transparent)
```

### `map/world/river/bridge_y.png`

Pont (axe haut-droite → bas-gauche)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: one section of a wooden bridge deck with railings over river water, running along the tile from its top-right side to its bottom-left side and cut square at both ends so that sections join into one bridge across the river; the water under it is NOT drawn (transparent)
```

### `map/world/river/ford_x.png`

Gué (axe haut-gauche → bas-droite) : passage moitié moins vite  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a ford: a line of flat stepping stones and a gravel shoal with small white riffles, running across the tile from its top-left side to its bottom-right side; the water around it is NOT drawn (transparent)
```

### `map/world/river/ford_y.png`

Gué (axe haut-droite → bas-gauche)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a ford: a line of flat stepping stones and a gravel shoal with small white riffles, running across the tile from its top-right side to its bottom-left side; the water around it is NOT drawn (transparent)
```

<a id="partie-5"></a>

## 5. Désert : dunes, ruines, palmiers

Décor du désert. Les palmiers se posent autour des oasis.

### `map/world/desert/dunes_1.png`

Dunes (variante 1)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: two or three golden sand dunes with wind ripples on one tile
```

### `map/world/desert/dunes_2.png`

Dunes (variante 2)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: two or three golden sand dunes with wind ripples on one tile
```

### `map/world/desert/dunes_3.png`

Dunes (variante 3)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: two or three golden sand dunes with wind ripples on one tile
```

### `map/world/desert/palms_1.png`

Palmiers au bord d'une oasis (variante 1)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: two or three date palms and green bushes, the vegetation at the edge of a desert oasis, on one tile
```

### `map/world/desert/palms_2.png`

Palmiers au bord d'une oasis (variante 2)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: two or three date palms and green bushes, the vegetation at the edge of a desert oasis, on one tile
```

### `map/world/desert/palms_3.png`

Palmiers au bord d'une oasis (variante 3)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: two or three date palms and green bushes, the vegetation at the edge of a desert oasis, on one tile
```

### `map/world/desert/ruins_1.png`

Ruines du désert (variante 1)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: ancient sandstone ruins on one tile: broken columns, fallen blocks, half buried in sand
```

### `map/world/desert/ruins_2.png`

Ruines du désert (variante 2)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: ancient sandstone ruins on one tile: broken columns, fallen blocks, half buried in sand
```

<a id="partie-6"></a>

## 6. Eau : bateaux et quais (décor)

Décor seulement (décision du 25 octobre 2026) : sur les rivières et les lacs, sans effet sur le jeu.

### `map/world/water/boat_1.png`

Bateau (décor, variante 1) sur les rivières et les lacs  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a small wooden sailing boat with a white sail, floating; the water is NOT drawn (transparent), only the boat and a few soft ripples
```

### `map/world/water/boat_2.png`

Bateau (décor, variante 2) sur les rivières et les lacs  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a small fishing rowboat with two oars and a net, floating; the water is NOT drawn (transparent), only the boat and a few soft ripples
```

### `map/world/water/boat_3.png`

Bateau (décor, variante 3) sur les rivières et les lacs  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a flat river barge loaded with crates and barrels, floating; the water is NOT drawn (transparent), only the boat and a few soft ripples
```

### `map/world/water/dock_x.png`

Quai (décor) au bord de l'eau  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a short wooden pier on posts reaching out over the water from the top-left side of the tile toward the bottom-right, a moored rowboat; the water is NOT drawn (transparent)
```

### `map/world/water/dock_y.png`

Quai (décor) au bord de l'eau  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a short wooden pier on posts reaching out over the water from the top-right side of the tile toward the bottom-left, a moored rowboat; the water is NOT drawn (transparent)
```

<a id="partie-7"></a>

## 7. Villes sur 2 × 2 cases

Une ville couvre 2 × 2 cases. Village, ville (palier 2), capitale fortifiée (palier 3), ville secondaire normale et fortifiée, pour chaque civilisation.

### `map/cities/capital_egypt.png`

Carte du monde : ville « capital_egypt » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified capital city in Egyptian style: sandstone and mudbrick buildings with flat roofs, an obelisk and a small pylon gate, blue and gold banners; high stone walls with corner towers and a gatehouse around a dense town and a grand palace or temple in the middle, many banners
```

### `map/cities/capital_gaul.png`

Carte du monde : ville « capital_gaul » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified capital city in Gallic style: round timber and wattle houses with thick thatched roofs, a wooden palisade, green and gold banners; high stone walls with corner towers and a gatehouse around a dense town and a grand palace or temple in the middle, many banners
```

### `map/cities/capital_greek.png`

Carte du monde : ville « capital_greek » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified capital city in Greek style: a white marble temple with columns, blue-grey roofs, blue and white banners; high stone walls with corner towers and a gatehouse around a dense town and a grand palace or temple in the middle, many banners
```

### `map/cities/capital_hun.png`

Carte du monde : ville « capital_hun » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified capital city in Hunnic style: felt yurts and timber longhouses inside a log stockade, horse pens, red and black banners with horse-tail standards; high stone walls with corner towers and a gatehouse around a dense town and a grand palace or temple in the middle, many banners
```

### `map/cities/capital_rome.png`

Carte du monde : ville « capital_rome » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified capital city in Roman style: terracotta tile roofs, white plaster and stone, red banners with a golden eagle; high stone walls with corner towers and a gatehouse around a dense town and a grand palace or temple in the middle, many banners
```

### `map/cities/capital_sultan.png`

Carte du monde : ville « capital_sultan » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified capital city in Sultanate style: domed buildings and slender towers of pale stone with turquoise tiles, green and gold banners; high stone walls with corner towers and a gatehouse around a dense town and a grand palace or temple in the middle, many banners
```

### `map/cities/capital.png`

Carte du monde : ville « capital » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a fortified capital: walls with corner towers around a columned palace, Roman style, a red banner
```

### `map/cities/colony_egypt_fortified.png`

Carte du monde : ville secondaire fortifiée de Égypte (Bâtiment principal 20 et plus), état normal, plus modeste que la capitale fortifiée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified secondary city in Egyptian style: sandstone and mudbrick buildings with flat roofs, an obelisk and a small pylon gate, blue and gold banners; a stone wall with two towers around a compact town, banners
```

### `map/cities/colony_egypt.png`

Carte du monde : ville secondaire (colonie) de Égypte, plus petite que la ville de départ  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small secondary settlement in Egyptian style: sandstone and mudbrick buildings with flat roofs, an obelisk and a small pylon gate, blue and gold banners; a wooden palisade around a few houses and a storehouse, one banner
```

### `map/cities/colony_gaul_fortified.png`

Carte du monde : ville secondaire fortifiée de Gaule (Bâtiment principal 20 et plus), état normal, plus modeste que la capitale fortifiée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified secondary city in Gallic style: round timber and wattle houses with thick thatched roofs, a wooden palisade, green and gold banners; a stone wall with two towers around a compact town, banners
```

### `map/cities/colony_gaul.png`

Carte du monde : ville secondaire (colonie) de Gaule, plus petite que la ville de départ  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small secondary settlement in Gallic style: round timber and wattle houses with thick thatched roofs, a wooden palisade, green and gold banners; a wooden palisade around a few houses and a storehouse, one banner
```

### `map/cities/colony_greek_fortified.png`

Carte du monde : ville secondaire fortifiée de Grèce (Bâtiment principal 20 et plus), état normal, plus modeste que la capitale fortifiée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified secondary city in Greek style: a white marble temple with columns, blue-grey roofs, blue and white banners; a stone wall with two towers around a compact town, banners
```

### `map/cities/colony_greek.png`

Carte du monde : ville secondaire (colonie) de Grèce, plus petite que la ville de départ  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small secondary settlement in Greek style: a white marble temple with columns, blue-grey roofs, blue and white banners; a wooden palisade around a few houses and a storehouse, one banner
```

### `map/cities/colony_hun_fortified.png`

Carte du monde : ville secondaire fortifiée de Huns (Bâtiment principal 20 et plus), état normal, plus modeste que la capitale fortifiée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified secondary city in Hunnic style: felt yurts and timber longhouses inside a log stockade, horse pens, red and black banners with horse-tail standards; a stone wall with two towers around a compact town, banners
```

### `map/cities/colony_hun.png`

Carte du monde : ville secondaire (colonie) de Huns, plus petite que la ville de départ  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small secondary settlement in Hunnic style: felt yurts and timber longhouses inside a log stockade, horse pens, red and black banners with horse-tail standards; a wooden palisade around a few houses and a storehouse, one banner
```

### `map/cities/colony_rome_fortified.png`

Carte du monde : ville secondaire fortifiée de Rome (Bâtiment principal 20 et plus), état normal, plus modeste que la capitale fortifiée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified secondary city in Roman style: terracotta tile roofs, white plaster and stone, red banners with a golden eagle; a stone wall with two towers around a compact town, banners
```

### `map/cities/colony_rome.png`

Carte du monde : ville secondaire (colonie) de Rome, plus petite que la ville de départ  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small secondary settlement in Roman style: terracotta tile roofs, white plaster and stone, red banners with a golden eagle; a wooden palisade around a few houses and a storehouse, one banner
```

### `map/cities/colony_sultan_fortified.png`

Carte du monde : ville secondaire fortifiée de Sultanat (Bâtiment principal 20 et plus), état normal, plus modeste que la capitale fortifiée  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a fortified secondary city in Sultanate style: domed buildings and slender towers of pale stone with turquoise tiles, green and gold banners; a stone wall with two towers around a compact town, banners
```

### `map/cities/colony_sultan.png`

Carte du monde : ville secondaire (colonie) de Sultanat, plus petite que la ville de départ  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small secondary settlement in Sultanate style: domed buildings and slender towers of pale stone with turquoise tiles, green and gold banners; a wooden palisade around a few houses and a storehouse, one banner
```

### `map/cities/default.png`

Carte du monde : ville « default » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a small generic ancient town: a few stone houses with terracotta roofs
```

### `map/cities/egypt_t2.png`

Carte du monde : ville de Égypte au palier « Ville » (Bâtiment principal 10 à 19), plus grande que le village, avec un premier mur bas ; état normal  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a walled town in Egyptian style: sandstone and mudbrick buildings with flat roofs, an obelisk and a small pylon gate, blue and gold banners; a stone wall with a gate and two towers around about twenty houses and a larger central building, banners
```

### `map/cities/egypt.png`

Carte du monde : ville « egypt » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small walled village in Egyptian style: sandstone and mudbrick buildings with flat roofs, an obelisk and a small pylon gate, blue and gold banners; a low wall or palisade around a dozen houses, a main hall in the middle, two banners
```

### `map/cities/gaul_t2.png`

Carte du monde : ville de Gaule au palier « Ville » (Bâtiment principal 10 à 19), plus grande que le village, avec un premier mur bas ; état normal  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a walled town in Gallic style: round timber and wattle houses with thick thatched roofs, a wooden palisade, green and gold banners; a stone wall with a gate and two towers around about twenty houses and a larger central building, banners
```

### `map/cities/gaul.png`

Carte du monde : ville « gaul » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small walled village in Gallic style: round timber and wattle houses with thick thatched roofs, a wooden palisade, green and gold banners; a low wall or palisade around a dozen houses, a main hall in the middle, two banners
```

### `map/cities/greek_t2.png`

Carte du monde : ville de Grèce au palier « Ville » (Bâtiment principal 10 à 19), plus grande que le village, avec un premier mur bas ; état normal  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a walled town in Greek style: a white marble temple with columns, blue-grey roofs, blue and white banners; a stone wall with a gate and two towers around about twenty houses and a larger central building, banners
```

### `map/cities/greek.png`

Carte du monde : ville « greek » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small walled village in Greek style: a white marble temple with columns, blue-grey roofs, blue and white banners; a low wall or palisade around a dozen houses, a main hall in the middle, two banners
```

### `map/cities/hun_t2.png`

Carte du monde : ville de Huns au palier « Ville » (Bâtiment principal 10 à 19), plus grande que le village, avec un premier mur bas ; état normal  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a walled town in Hunnic style: felt yurts and timber longhouses inside a log stockade, horse pens, red and black banners with horse-tail standards; a stone wall with a gate and two towers around about twenty houses and a larger central building, banners
```

### `map/cities/hun.png`

Carte du monde : ville « hun » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small walled village in Hunnic style: felt yurts and timber longhouses inside a log stockade, horse pens, red and black banners with horse-tail standards; a low wall or palisade around a dozen houses, a main hall in the middle, two banners
```

### `map/cities/rome_t2.png`

Carte du monde : ville de Rome au palier « Ville » (Bâtiment principal 10 à 19), plus grande que le village, avec un premier mur bas ; état normal  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a walled town in Roman style: terracotta tile roofs, white plaster and stone, red banners with a golden eagle; a stone wall with a gate and two towers around about twenty houses and a larger central building, banners
```

### `map/cities/rome.png`

Carte du monde : ville « rome » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small walled village in Roman style: terracotta tile roofs, white plaster and stone, red banners with a golden eagle; a low wall or palisade around a dozen houses, a main hall in the middle, two banners
```

### `map/cities/sultan_t2.png`

Carte du monde : ville de Sultanat au palier « Ville » (Bâtiment principal 10 à 19), plus grande que le village, avec un premier mur bas ; état normal  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a walled town in Sultanate style: domed buildings and slender towers of pale stone with turquoise tiles, green and gold banners; a stone wall with a gate and two towers around about twenty houses and a larger central building, banners
```

### `map/cities/sultan.png`

Carte du monde : ville « sultan » (…)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: a small walled village in Sultanate style: domed buildings and slender towers of pale stone with turquoise tiles, green and gold banners; a low wall or palisade around a dozen houses, a main hall in the middle, two banners
```

<a id="partie-8"></a>

## 8. Villes assiégées (animation en 4 images)

Remplacent la ville tant que le siège dure : même cadrage que la ville normale, 4 images qui bouclent.

### `map/cities/siege_colony_EGYPT_fortified_0.png`

Carte du monde : ville secondaire fortifiée de Égypte assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_EGYPT_fortified_1.png`

Carte du monde : ville secondaire fortifiée de Égypte assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_EGYPT_fortified_2.png`

Carte du monde : ville secondaire fortifiée de Égypte assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_EGYPT_fortified_3.png`

Carte du monde : ville secondaire fortifiée de Égypte assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_EGYPT_normal_0.png`

Carte du monde : ville secondaire de Égypte assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_EGYPT_normal_1.png`

Carte du monde : ville secondaire de Égypte assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_EGYPT_normal_2.png`

Carte du monde : ville secondaire de Égypte assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_EGYPT_normal_3.png`

Carte du monde : ville secondaire de Égypte assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_fortified_0.png`

Carte du monde : ville secondaire fortifiée de Gaule assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_fortified_1.png`

Carte du monde : ville secondaire fortifiée de Gaule assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_fortified_2.png`

Carte du monde : ville secondaire fortifiée de Gaule assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_fortified_3.png`

Carte du monde : ville secondaire fortifiée de Gaule assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_normal_0.png`

Carte du monde : ville secondaire de Gaule assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_normal_1.png`

Carte du monde : ville secondaire de Gaule assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_normal_2.png`

Carte du monde : ville secondaire de Gaule assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GAUL_normal_3.png`

Carte du monde : ville secondaire de Gaule assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_fortified_0.png`

Carte du monde : ville secondaire fortifiée de Grèce assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_fortified_1.png`

Carte du monde : ville secondaire fortifiée de Grèce assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_fortified_2.png`

Carte du monde : ville secondaire fortifiée de Grèce assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_fortified_3.png`

Carte du monde : ville secondaire fortifiée de Grèce assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_normal_0.png`

Carte du monde : ville secondaire de Grèce assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_normal_1.png`

Carte du monde : ville secondaire de Grèce assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_normal_2.png`

Carte du monde : ville secondaire de Grèce assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_GREEK_normal_3.png`

Carte du monde : ville secondaire de Grèce assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_fortified_0.png`

Carte du monde : ville secondaire fortifiée de Huns assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_fortified_1.png`

Carte du monde : ville secondaire fortifiée de Huns assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_fortified_2.png`

Carte du monde : ville secondaire fortifiée de Huns assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_fortified_3.png`

Carte du monde : ville secondaire fortifiée de Huns assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_normal_0.png`

Carte du monde : ville secondaire de Huns assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_normal_1.png`

Carte du monde : ville secondaire de Huns assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_normal_2.png`

Carte du monde : ville secondaire de Huns assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_HUN_normal_3.png`

Carte du monde : ville secondaire de Huns assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_fortified_0.png`

Carte du monde : ville secondaire fortifiée de Rome assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_fortified_1.png`

Carte du monde : ville secondaire fortifiée de Rome assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_fortified_2.png`

Carte du monde : ville secondaire fortifiée de Rome assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_fortified_3.png`

Carte du monde : ville secondaire fortifiée de Rome assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_normal_0.png`

Carte du monde : ville secondaire de Rome assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_normal_1.png`

Carte du monde : ville secondaire de Rome assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_normal_2.png`

Carte du monde : ville secondaire de Rome assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_ROME_normal_3.png`

Carte du monde : ville secondaire de Rome assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_fortified_0.png`

Carte du monde : ville secondaire fortifiée de Sultanat assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_fortified_1.png`

Carte du monde : ville secondaire fortifiée de Sultanat assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_fortified_2.png`

Carte du monde : ville secondaire fortifiée de Sultanat assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_fortified_3.png`

Carte du monde : ville secondaire fortifiée de Sultanat assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified secondary city grown from a colony: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a ring of stone walls with two or three towers around a compact town and a hall, banners, smaller and plainer than the fortified capital, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_normal_0.png`

Carte du monde : ville secondaire de Sultanat assiégée, même cadrage que son sprite normal — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_normal_1.png`

Carte du monde : ville secondaire de Sultanat assiégée, même cadrage que son sprite normal — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_normal_2.png`

Carte du monde : ville secondaire de Sultanat assiégée, même cadrage que son sprite normal — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_colony_SULTAN_normal_3.png`

Carte du monde : ville secondaire de Sultanat assiégée, même cadrage que son sprite normal — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small newly founded colony village: Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns, a low palisade, three or four modest houses, a well and a banner on a pole, freshly cleared ground around, UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t1_0.png`

Carte du monde : village de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Egyptian town: sandstone buildings with flat roofs and a teal banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t1_1.png`

Carte du monde : village de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Egyptian town: sandstone buildings with flat roofs and a teal banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t1_2.png`

Carte du monde : village de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Egyptian town: sandstone buildings with flat roofs and a teal banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t1_3.png`

Carte du monde : village de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Egyptian town: sandstone buildings with flat roofs and a teal banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t2_0.png`

Carte du monde : ville de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Egyptian town, grown into a real town: sandstone buildings with flat roofs and a teal banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t2_1.png`

Carte du monde : ville de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Egyptian town, grown into a real town: sandstone buildings with flat roofs and a teal banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t2_2.png`

Carte du monde : ville de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Egyptian town, grown into a real town: sandstone buildings with flat roofs and a teal banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t2_3.png`

Carte du monde : ville de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Egyptian town, grown into a real town: sandstone buildings with flat roofs and a teal banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t3_0.png`

Carte du monde : ville fortifiée de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t3_1.png`

Carte du monde : ville fortifiée de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t3_2.png`

Carte du monde : ville fortifiée de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_EGYPT_t3_3.png`

Carte du monde : ville fortifiée de Égypte assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Egyptian architecture: sandstone walls with hieroglyph friezes, flat roofs with merlons, lotus columns, gold trims, teal and ochre accents, obelisks (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t1_0.png`

Carte du monde : village de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Gallic village: thatched huts and a green banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t1_1.png`

Carte du monde : village de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Gallic village: thatched huts and a green banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t1_2.png`

Carte du monde : village de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Gallic village: thatched huts and a green banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t1_3.png`

Carte du monde : village de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Gallic village: thatched huts and a green banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t2_0.png`

Carte du monde : ville de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Gallic village, grown into a real town: thatched huts and a green banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t2_1.png`

Carte du monde : ville de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Gallic village, grown into a real town: thatched huts and a green banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t2_2.png`

Carte du monde : ville de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Gallic village, grown into a real town: thatched huts and a green banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t2_3.png`

Carte du monde : ville de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Gallic village, grown into a real town: thatched huts and a green banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t3_0.png`

Carte du monde : ville fortifiée de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t3_1.png`

Carte du monde : ville fortifiée de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t3_2.png`

Carte du monde : ville fortifiée de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GAUL_t3_3.png`

Carte du monde : ville fortifiée de Gaule assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Gallic architecture: timber and wattle walls, thatched roofs, carved wooden beams, palisade stakes, green banners, barrels (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t1_0.png`

Carte du monde : village de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Greek town: marble buildings with blue roofs and a blue banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t1_1.png`

Carte du monde : village de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Greek town: marble buildings with blue roofs and a blue banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t1_2.png`

Carte du monde : village de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Greek town: marble buildings with blue roofs and a blue banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t1_3.png`

Carte du monde : village de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Greek town: marble buildings with blue roofs and a blue banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t2_0.png`

Carte du monde : ville de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Greek town, grown into a real town: marble buildings with blue roofs and a blue banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t2_1.png`

Carte du monde : ville de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Greek town, grown into a real town: marble buildings with blue roofs and a blue banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t2_2.png`

Carte du monde : ville de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Greek town, grown into a real town: marble buildings with blue roofs and a blue banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t2_3.png`

Carte du monde : ville de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Greek town, grown into a real town: marble buildings with blue roofs and a blue banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t3_0.png`

Carte du monde : ville fortifiée de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t3_1.png`

Carte du monde : ville fortifiée de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t3_2.png`

Carte du monde : ville fortifiée de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_GREEK_t3_3.png`

Carte du monde : ville fortifiée de Grèce assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Greek architecture: white marble walls, fluted columns, triangular pediments, blue slate roofs, blue banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t1_0.png`

Carte du monde : village de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Hunnic camp: felt yurts with conical roofs and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t1_1.png`

Carte du monde : village de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Hunnic camp: felt yurts with conical roofs and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t1_2.png`

Carte du monde : village de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Hunnic camp: felt yurts with conical roofs and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t1_3.png`

Carte du monde : village de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Hunnic camp: felt yurts with conical roofs and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t2_0.png`

Carte du monde : ville de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Hunnic camp, grown into a real town: felt yurts with conical roofs and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t2_1.png`

Carte du monde : ville de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Hunnic camp, grown into a real town: felt yurts with conical roofs and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t2_2.png`

Carte du monde : ville de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Hunnic camp, grown into a real town: felt yurts with conical roofs and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t2_3.png`

Carte du monde : ville de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Hunnic camp, grown into a real town: felt yurts with conical roofs and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t3_0.png`

Carte du monde : ville fortifiée de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t3_1.png`

Carte du monde : ville fortifiée de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t3_2.png`

Carte du monde : ville fortifiée de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_HUN_t3_3.png`

Carte du monde : ville fortifiée de Huns assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Hunnic steppe architecture: felt yurts, hides and timber, pointed conical roofs, horsetail standards, red banners, spears and campfires (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t1_0.png`

Carte du monde : village de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Roman town: a few terracotta-roofed houses, a columned hall and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t1_1.png`

Carte du monde : village de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Roman town: a few terracotta-roofed houses, a columned hall and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t1_2.png`

Carte du monde : village de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Roman town: a few terracotta-roofed houses, a columned hall and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t1_3.png`

Carte du monde : village de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Roman town: a few terracotta-roofed houses, a columned hall and a red banner, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t2_0.png`

Carte du monde : ville de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Roman town, grown into a real town: a few terracotta-roofed houses, a columned hall and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t2_1.png`

Carte du monde : ville de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Roman town, grown into a real town: a few terracotta-roofed houses, a columned hall and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t2_2.png`

Carte du monde : ville de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Roman town, grown into a real town: a few terracotta-roofed houses, a columned hall and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t2_3.png`

Carte du monde : ville de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Roman town, grown into a real town: a few terracotta-roofed houses, a columned hall and a red banner, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t3_0.png`

Carte du monde : ville fortifiée de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t3_1.png`

Carte du monde : ville fortifiée de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t3_2.png`

Carte du monde : ville fortifiée de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_ROME_t3_3.png`

Carte du monde : ville fortifiée de Rome assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Roman architecture: pale sandstone ashlar walls, terracotta tiled roofs, marble columns, red vexillum banners, amphorae (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t1_0.png`

Carte du monde : village de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Sultanate town: whitewashed houses with a teal dome and a minaret, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t1_1.png`

Carte du monde : village de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Sultanate town: whitewashed houses with a teal dome and a minaret, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t1_2.png`

Carte du monde : village de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Sultanate town: whitewashed houses with a teal dome and a minaret, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t1_3.png`

Carte du monde : village de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a small Sultanate town: whitewashed houses with a teal dome and a minaret, as a modest village (level 1 town), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t2_0.png`

Carte du monde : ville de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Sultanate town, grown into a real town: whitewashed houses with a teal dome and a minaret, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t2_1.png`

Carte du monde : ville de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Sultanate town, grown into a real town: whitewashed houses with a teal dome and a minaret, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t2_2.png`

Carte du monde : ville de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Sultanate town, grown into a real town: whitewashed houses with a teal dome and a minaret, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t2_3.png`

Carte du monde : ville de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a larger Sultanate town, grown into a real town: whitewashed houses with a teal dome and a minaret, more and taller buildings, a low stone wall with a simple gate around it (level 2 town, between the village and a fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t3_0.png`

Carte du monde : ville fortifiée de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 1/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 1 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t3_1.png`

Carte du monde : ville fortifiée de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 2/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 2 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t3_2.png`

Carte du monde : ville fortifiée de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 3/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 3 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

### `map/cities/siege_SULTAN_t3_3.png`

Carte du monde : ville fortifiée de Sultanat assiégée (engins et palissade autour, feux sur les remparts, fumée, projectiles), même cadrage que le sprite de ville qu'elle remplace pendant le siège — phase 4/4  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-ville.png](img/guides-carte/guide-ville.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A walled town whose footprint is 2 x 2 isometric tiles: a 2:1 diamond 90% of the image width, centered horizontally, its center at 68% of the image height; walls follow the edges of that diamond, buildings rise inside, the tallest roofs may reach the top quarter of the image. NO ground plate under the town: outside the walls the image is transparent, except a few fields, paths or trees touching the walls and the soft shadow toward the lower right. The second image is a layout guide that shows this 2 x 2 diamond in red: use it only to place the town, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a fortified capital: walls with corner towers around a palace, Sultanate architecture: whitewashed plaster walls, onion domes covered with teal mosaic, horseshoe arches, a slender minaret, gold crescents, lanterns (level 3 fortified city), UNDER SIEGE: a ring of enemy siege works around it (two catapults or a ram under a wooden shed, a palisade of sharpened stakes, a few tents and tiny soldiers), fires burning on the ramparts and roofs, columns of dark smoke rising, a stone flying from a catapult toward the walls; the town itself keeps exactly the silhouette and size of its normal world-map image, frame 4 (the catapult arm swings, the flames flicker and the smoke drifts from one frame to the next; same subject, same size and position in every frame)
```

<a id="partie-9"></a>

## 9. Points de ressource

Le point de ressource libre (sans tribu), par ressource et par biome.

### `map/resources/food_desert.png`

Carte du monde : point de ressource food (desert)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a fenced wheat field, desert variant with sand and a palm tree
```

### `map/resources/food_snow.png`

Carte du monde : point de ressource food (snow)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a fenced wheat field, snowy variant covered with snow
```

### `map/resources/food.png`

Carte du monde : point de ressource food  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a fenced wheat field
```

### `map/resources/gold_desert.png`

Carte du monde : point de ressource gold (desert)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: rocks with glittering gold nuggets, desert variant with sand and a palm tree
```

### `map/resources/gold_snow.png`

Carte du monde : point de ressource gold (snow)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: rocks with glittering gold nuggets, snowy variant covered with snow
```

### `map/resources/gold.png`

Carte du monde : point de ressource gold  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: rocks with glittering gold nuggets
```

### `map/resources/iron_desert.png`

Carte du monde : point de ressource iron (desert)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: an iron mine entrance in a rock wall with a mine cart, desert variant with sand and a palm tree
```

### `map/resources/iron_snow.png`

Carte du monde : point de ressource iron (snow)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: an iron mine entrance in a rock wall with a mine cart, snowy variant covered with snow
```

### `map/resources/iron.png`

Carte du monde : point de ressource iron  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: an iron mine entrance in a rock wall with a mine cart
```

### `map/resources/stone_desert.png`

Carte du monde : point de ressource stone (desert)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a group of grey boulders, desert variant with sand and a palm tree
```

### `map/resources/stone_snow.png`

Carte du monde : point de ressource stone (snow)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a group of grey boulders, snowy variant covered with snow
```

### `map/resources/stone.png`

Carte du monde : point de ressource stone  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a group of grey boulders
```

### `map/resources/wood_desert.png`

Carte du monde : point de ressource wood (desert)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a forest clearing with trees and a cut log, desert variant with sand and a palm tree
```

### `map/resources/wood_snow.png`

Carte du monde : point de ressource wood (snow)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a forest clearing with trees and a cut log, snowy variant covered with snow
```

### `map/resources/wood.png`

Carte du monde : point de ressource wood  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a forest clearing with trees and a cut log
```

<a id="partie-10"></a>

## 10. Camps des tribus, fondation, bannières

Camp de la tribu qui tient un point (niveaux 1 à 3, par biome), ruines après sa défaite, campement de fondation d'une ville, bannière de chaque civilisation posée sur le camp.

### `map/camps/banner_EGYPT.png`

Bannière de tribu Égypte posée sur le camp  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a square cloth banner on a wooden pole, waving, in the colors and with the emblem of the egypt people (Egyptian), nothing else
```

### `map/camps/banner_GAUL.png`

Bannière de tribu Gaule posée sur le camp  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a square cloth banner on a wooden pole, waving, in the colors and with the emblem of the gaul people (Gallic), nothing else
```

### `map/camps/banner_GREEK.png`

Bannière de tribu Grèce posée sur le camp  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a square cloth banner on a wooden pole, waving, in the colors and with the emblem of the greek people (Greek), nothing else
```

### `map/camps/banner_HUN.png`

Bannière de tribu Huns posée sur le camp  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a square cloth banner on a wooden pole, waving, in the colors and with the emblem of the hun people (Hunnic steppe), nothing else
```

### `map/camps/banner_ROME.png`

Bannière de tribu Rome posée sur le camp  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a square cloth banner on a wooden pole, waving, in the colors and with the emblem of the rome people (Roman), nothing else
```

### `map/camps/banner_SULTAN.png`

Bannière de tribu Sultanat posée sur le camp  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a square cloth banner on a wooden pole, waving, in the colors and with the emblem of the sultan people (Sultanate), nothing else
```

### `map/camps/camp1_desert.png`

Camp barbare de niveau 1 sur la carte (desert) : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a small barbarian camp: two hide tents around a campfire, a wooden totem topped with a skull, a few crude spears planted in the ground, desert variant standing on sand with a palm tree and red rocks
```

### `map/camps/camp1_snow.png`

Camp barbare de niveau 1 sur la carte (snow) : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a small barbarian camp: two hide tents around a campfire, a wooden totem topped with a skull, a few crude spears planted in the ground, snowy variant with snow on the tents and roofs and snow drifts around
```

### `map/camps/camp1.png`

Camp barbare de niveau 1 sur la carte : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a small barbarian camp: two hide tents around a campfire, a wooden totem topped with a skull, a few crude spears planted in the ground
```

### `map/camps/camp2_desert.png`

Camp barbare de niveau 2 sur la carte (desert) : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a palisaded barbarian camp: a ring of sharpened log stakes with a gate, several hide tents, a wooden watchtower, a campfire and a tall banner, desert variant standing on sand with a palm tree and red rocks
```

### `map/camps/camp2_snow.png`

Camp barbare de niveau 2 sur la carte (snow) : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a palisaded barbarian camp: a ring of sharpened log stakes with a gate, several hide tents, a wooden watchtower, a campfire and a tall banner, snowy variant with snow on the tents and roofs and snow drifts around
```

### `map/camps/camp2.png`

Camp barbare de niveau 2 sur la carte : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a palisaded barbarian camp: a ring of sharpened log stakes with a gate, several hide tents, a wooden watchtower, a campfire and a tall banner
```

### `map/camps/camp3_desert.png`

Camp barbare de niveau 3 sur la carte (desert) : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a barbarian wooden fort: a tall log palisade with two corner towers and a gate, a longhouse with a thatched roof inside, skull totems, several banners and a smoking fire, desert variant standing on sand with a palm tree and red rocks
```

### `map/camps/camp3_snow.png`

Camp barbare de niveau 3 sur la carte (snow) : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a barbarian wooden fort: a tall log palisade with two corner towers and a gate, a longhouse with a thatched roof inside, skull totems, several banners and a smoking fire, snowy variant with snow on the tents and roofs and snow drifts around
```

### `map/camps/camp3.png`

Camp barbare de niveau 3 sur la carte : remplace l'icône de ressource tant que la tribu tient le point  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a barbarian wooden fort: a tall log palisade with two corner towers and a gate, a longhouse with a thatched roof inside, skull totems, several banners and a smoking fire
```

### `map/camps/foundation_desert.png`

Carte du monde : campement de fondation (desert) pendant les 24 h de fondation d'une ville (remplace l'icône du point)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a settlers' camp where a new city is being founded: three canvas tents, a covered ox-wagon, wooden stakes and rope marking the future walls, a dug trench, piles of logs and stones, a small campfire and a banner pole, desert variant standing on sand with a palm tree and red rocks
```

### `map/camps/foundation_snow.png`

Carte du monde : campement de fondation (snow) pendant les 24 h de fondation d'une ville (remplace l'icône du point)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a settlers' camp where a new city is being founded: three canvas tents, a covered ox-wagon, wooden stakes and rope marking the future walls, a dug trench, piles of logs and stones, a small campfire and a banner pole, snowy variant with snow on the tents and roofs and snow drifts around
```

### `map/camps/foundation.png`

Carte du monde : campement de fondation pendant les 24 h de fondation d'une ville (remplace l'icône du point)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: a settlers' camp where a new city is being founded: three canvas tents, a covered ox-wagon, wooden stakes and rope marking the future walls, a dug trench, piles of logs and stones, a small campfire and a banner pole
```

### `map/camps/ruins_desert.png`

Camp barbare détruit (desert) : affiché jusqu'à la réapparition de la tribu  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the burnt remains of a barbarian camp: charred stakes, a collapsed tent, a broken totem, embers and a thin wisp of smoke, desert variant standing on sand with a palm tree and red rocks
```

### `map/camps/ruins_snow.png`

Camp barbare détruit (snow) : affiché jusqu'à la réapparition de la tribu  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the burnt remains of a barbarian camp: charred stakes, a collapsed tent, a broken totem, embers and a thin wisp of smoke, snowy variant with snow on the tents and roofs and snow drifts around
```

### `map/camps/ruins.png`

Camp barbare détruit : affiché jusqu'à la réapparition de la tribu  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: the burnt remains of a barbarian camp: charred stakes, a collapsed tent, a broken totem, embers and a thin wisp of smoke
```

<a id="partie-11"></a>

## 11. Armées en marche

L'armée sur la carte, par classe et par civilisation, le héros en tête, l'espion, le cortège de colons.

### `map/units/archer_EGYPT.png`

Carte du monde : armée en marche « archer » de Égypte (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an archer with a bow and a quiver, egypt faction with striped nemes headdress with a gold band and faction colors, marching toward the lower right
```

### `map/units/archer_GAUL.png`

Carte du monde : armée en marche « archer » de Gaule (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an archer with a bow and a quiver, gaul faction with horned helmet and long hair and faction colors, marching toward the lower right
```

### `map/units/archer_GREEK.png`

Carte du monde : armée en marche « archer » de Grèce (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an archer with a bow and a quiver, greek faction with golden Corinthian helmet with a blue crest and faction colors, marching toward the lower right
```

### `map/units/archer_HUN.png`

Carte du monde : armée en marche « archer » de Huns (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an archer with a bow and a quiver, hun faction with fur-trimmed pointed felt cap and faction colors, marching toward the lower right
```

### `map/units/archer_ROME.png`

Carte du monde : armée en marche « archer » de Rome (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an archer with a bow and a quiver, rome faction with Roman legionary helmet with a red crest and faction colors, marching toward the lower right
```

### `map/units/archer_SULTAN.png`

Carte du monde : armée en marche « archer » de Sultanat (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an archer with a bow and a quiver, sultan faction with white turban with a gem and faction colors, marching toward the lower right
```

### `map/units/archer.png`

Carte du monde : armée en marche « archer » (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an archer with a bow and a quiver, Roman style, marching toward the lower right
```

### `map/units/catapult_EGYPT.png`

Carte du monde : armée en marche « catapult » de Égypte (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a siege engineer standing next to a catapult, egypt faction with striped nemes headdress with a gold band and faction colors, marching toward the lower right
```

### `map/units/catapult_GAUL.png`

Carte du monde : armée en marche « catapult » de Gaule (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a siege engineer standing next to a catapult, gaul faction with horned helmet and long hair and faction colors, marching toward the lower right
```

### `map/units/catapult_GREEK.png`

Carte du monde : armée en marche « catapult » de Grèce (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a siege engineer standing next to a catapult, greek faction with golden Corinthian helmet with a blue crest and faction colors, marching toward the lower right
```

### `map/units/catapult_HUN.png`

Carte du monde : armée en marche « catapult » de Huns (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a siege engineer standing next to a catapult, hun faction with fur-trimmed pointed felt cap and faction colors, marching toward the lower right
```

### `map/units/catapult_ROME.png`

Carte du monde : armée en marche « catapult » de Rome (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a siege engineer standing next to a catapult, rome faction with Roman legionary helmet with a red crest and faction colors, marching toward the lower right
```

### `map/units/catapult_SULTAN.png`

Carte du monde : armée en marche « catapult » de Sultanat (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a siege engineer standing next to a catapult, sultan faction with white turban with a gem and faction colors, marching toward the lower right
```

### `map/units/catapult.png`

Carte du monde : armée en marche « catapult » (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a siege engineer standing next to a catapult, Roman style, marching toward the lower right
```

### `map/units/cavalry_EGYPT.png`

Carte du monde : armée en marche « cavalry » de Égypte (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a cavalryman riding a horse with a lance, egypt faction with striped nemes headdress with a gold band and faction colors, marching toward the lower right
```

### `map/units/cavalry_GAUL.png`

Carte du monde : armée en marche « cavalry » de Gaule (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a cavalryman riding a horse with a lance, gaul faction with horned helmet and long hair and faction colors, marching toward the lower right
```

### `map/units/cavalry_GREEK.png`

Carte du monde : armée en marche « cavalry » de Grèce (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a cavalryman riding a horse with a lance, greek faction with golden Corinthian helmet with a blue crest and faction colors, marching toward the lower right
```

### `map/units/cavalry_HUN.png`

Carte du monde : armée en marche « cavalry » de Huns (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a cavalryman riding a horse with a lance, hun faction with fur-trimmed pointed felt cap and faction colors, marching toward the lower right
```

### `map/units/cavalry_ROME.png`

Carte du monde : armée en marche « cavalry » de Rome (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a cavalryman riding a horse with a lance, rome faction with Roman legionary helmet with a red crest and faction colors, marching toward the lower right
```

### `map/units/cavalry_SULTAN.png`

Carte du monde : armée en marche « cavalry » de Sultanat (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a cavalryman riding a horse with a lance, sultan faction with white turban with a gem and faction colors, marching toward the lower right
```

### `map/units/cavalry.png`

Carte du monde : armée en marche « cavalry » (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a cavalryman riding a horse with a lance, Roman style, marching toward the lower right
```

### `map/units/hero_EGYPT.png`

Carte du monde : armée menée par le héros de Égypte (marqueur avec le héros devant la troupe)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: the egypt hero with striped nemes headdress with a gold band, golden armor and a cape, on a horse in front of two soldiers, marching toward the lower right
```

### `map/units/hero_GAUL.png`

Carte du monde : armée menée par le héros de Gaule (marqueur avec le héros devant la troupe)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: the gaul hero with horned helmet and long hair, golden armor and a cape, on a horse in front of two soldiers, marching toward the lower right
```

### `map/units/hero_GREEK.png`

Carte du monde : armée menée par le héros de Grèce (marqueur avec le héros devant la troupe)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: the greek hero with golden Corinthian helmet with a blue crest, golden armor and a cape, on a horse in front of two soldiers, marching toward the lower right
```

### `map/units/hero_HUN.png`

Carte du monde : armée menée par le héros de Huns (marqueur avec le héros devant la troupe)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: the hun hero with fur-trimmed pointed felt cap, golden armor and a cape, on a horse in front of two soldiers, marching toward the lower right
```

### `map/units/hero_ROME.png`

Carte du monde : armée menée par le héros de Rome (marqueur avec le héros devant la troupe)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: the rome hero with Roman legionary helmet with a red crest, golden armor and a cape, on a horse in front of two soldiers, marching toward the lower right
```

### `map/units/hero_SULTAN.png`

Carte du monde : armée menée par le héros de Sultanat (marqueur avec le héros devant la troupe)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: the sultan hero with white turban with a gem, golden armor and a cape, on a horse in front of two soldiers, marching toward the lower right
```

### `map/units/hoplite_EGYPT.png`

Carte du monde : armée en marche « hoplite » de Égypte (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an infantry soldier with spear and round shield, egypt faction with striped nemes headdress with a gold band and faction colors, marching toward the lower right
```

### `map/units/hoplite_GAUL.png`

Carte du monde : armée en marche « hoplite » de Gaule (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an infantry soldier with spear and round shield, gaul faction with horned helmet and long hair and faction colors, marching toward the lower right
```

### `map/units/hoplite_GREEK.png`

Carte du monde : armée en marche « hoplite » de Grèce (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an infantry soldier with spear and round shield, greek faction with golden Corinthian helmet with a blue crest and faction colors, marching toward the lower right
```

### `map/units/hoplite_HUN.png`

Carte du monde : armée en marche « hoplite » de Huns (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an infantry soldier with spear and round shield, hun faction with fur-trimmed pointed felt cap and faction colors, marching toward the lower right
```

### `map/units/hoplite_ROME.png`

Carte du monde : armée en marche « hoplite » de Rome (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an infantry soldier with spear and round shield, rome faction with Roman legionary helmet with a red crest and faction colors, marching toward the lower right
```

### `map/units/hoplite_SULTAN.png`

Carte du monde : armée en marche « hoplite » de Sultanat (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an infantry soldier with spear and round shield, sultan faction with white turban with a gem and faction colors, marching toward the lower right
```

### `map/units/hoplite.png`

Carte du monde : armée en marche « hoplite » (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small squad of three or four marching figures, each one an infantry soldier with spear and round shield, Roman style, marching toward the lower right
```

### `map/units/merchant.png`

Carte du monde : armée en marche « merchant » (aussi dans le replay de bataille)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a merchant: a wooden cart loaded with crates pulled by a horse, marching toward the lower right
```

### `map/units/settler_EGYPT.png`

Carte du monde : cortège de colons de Égypte  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right, egypt people with a black wig with kohl-lined eyes and faction colors
```

### `map/units/settler_GAUL.png`

Carte du monde : cortège de colons de Gaule  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right, gaul people with long braided hair and a moustache and faction colors
```

### `map/units/settler_GREEK.png`

Carte du monde : cortège de colons de Grèce  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right, greek people with curly hair with a headband and faction colors
```

### `map/units/settler_HUN.png`

Carte du monde : cortège de colons de Huns  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right, hun people with a fur-trimmed felt cap and faction colors
```

### `map/units/settler_ROME.png`

Carte du monde : cortège de colons de Rome  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right, rome people with a short Roman haircut and faction colors
```

### `map/units/settler_SULTAN.png`

Carte du monde : cortège de colons de Sultanat  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right, sultan people with a turban and faction colors
```

### `map/units/settler.png`

Carte du monde : cortège de colons en marche (armée partie fonder une ville ; charrette du marchand tant que ce sprite manque)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party: a covered ox-wagon with a family walking beside it carrying bundles, a man holding a wooden stake with a small flag, marching toward the lower right
```

### `map/units/spy.png`

Carte du monde : espion en mission (silhouette encapuchonnée à cheval)  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a spy: a hooded rider on a dark horse, cloak flying, riding toward the lower right
```

<a id="partie-12"></a>

## 12. Animations des armées

Cycles de marche (6 images) et images du replay de bataille (attaque, touché). Même cadrage que l'armée immobile.

### `map/units/archer_attack_0.png`

Replay : archer attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an archer with a bow and a quiver striking, frame 1
```

### `map/units/archer_attack_1.png`

Replay : archer attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an archer with a bow and a quiver striking, frame 2
```

### `map/units/archer_attack_2.png`

Replay : archer attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an archer with a bow and a quiver striking, frame 3
```

### `map/units/archer_hit_0.png`

Replay : archer touché — phase 1/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an archer with a bow and a quiver being hit and recoiling, frame 1
```

### `map/units/archer_hit_1.png`

Replay : archer touché — phase 2/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an archer with a bow and a quiver being hit and recoiling, frame 2
```

### `map/units/archer_walk_0.png`

Cycle de marche sur la carte : archer — phase 1/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an archer with a bow and a quiver) marching toward the lower right, walk cycle frame 1 of 6
```

### `map/units/archer_walk_1.png`

Cycle de marche sur la carte : archer — phase 2/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an archer with a bow and a quiver) marching toward the lower right, walk cycle frame 2 of 6
```

### `map/units/archer_walk_2.png`

Cycle de marche sur la carte : archer — phase 3/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an archer with a bow and a quiver) marching toward the lower right, walk cycle frame 3 of 6
```

### `map/units/archer_walk_3.png`

Cycle de marche sur la carte : archer — phase 4/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an archer with a bow and a quiver) marching toward the lower right, walk cycle frame 4 of 6
```

### `map/units/archer_walk_4.png`

Cycle de marche sur la carte : archer — phase 5/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an archer with a bow and a quiver) marching toward the lower right, walk cycle frame 5 of 6
```

### `map/units/archer_walk_5.png`

Cycle de marche sur la carte : archer — phase 6/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an archer with a bow and a quiver) marching toward the lower right, walk cycle frame 6 of 6
```

### `map/units/catapult_attack_0.png`

Replay : catapult attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a siege engineer standing next to a catapult striking, frame 1
```

### `map/units/catapult_attack_1.png`

Replay : catapult attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a siege engineer standing next to a catapult striking, frame 2
```

### `map/units/catapult_attack_2.png`

Replay : catapult attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a siege engineer standing next to a catapult striking, frame 3
```

### `map/units/catapult_hit_0.png`

Replay : catapult touché — phase 1/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a siege engineer standing next to a catapult being hit and recoiling, frame 1
```

### `map/units/catapult_hit_1.png`

Replay : catapult touché — phase 2/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a siege engineer standing next to a catapult being hit and recoiling, frame 2
```

### `map/units/catapult_walk_0.png`

Cycle de marche sur la carte : catapult — phase 1/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a siege engineer standing next to a catapult) marching toward the lower right, walk cycle frame 1 of 6
```

### `map/units/catapult_walk_1.png`

Cycle de marche sur la carte : catapult — phase 2/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a siege engineer standing next to a catapult) marching toward the lower right, walk cycle frame 2 of 6
```

### `map/units/catapult_walk_2.png`

Cycle de marche sur la carte : catapult — phase 3/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a siege engineer standing next to a catapult) marching toward the lower right, walk cycle frame 3 of 6
```

### `map/units/catapult_walk_3.png`

Cycle de marche sur la carte : catapult — phase 4/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a siege engineer standing next to a catapult) marching toward the lower right, walk cycle frame 4 of 6
```

### `map/units/catapult_walk_4.png`

Cycle de marche sur la carte : catapult — phase 5/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a siege engineer standing next to a catapult) marching toward the lower right, walk cycle frame 5 of 6
```

### `map/units/catapult_walk_5.png`

Cycle de marche sur la carte : catapult — phase 6/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a siege engineer standing next to a catapult) marching toward the lower right, walk cycle frame 6 of 6
```

### `map/units/cavalry_attack_0.png`

Replay : cavalry attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a cavalryman riding a horse with a lance striking, frame 1
```

### `map/units/cavalry_attack_1.png`

Replay : cavalry attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a cavalryman riding a horse with a lance striking, frame 2
```

### `map/units/cavalry_attack_2.png`

Replay : cavalry attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a cavalryman riding a horse with a lance striking, frame 3
```

### `map/units/cavalry_hit_0.png`

Replay : cavalry touché — phase 1/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a cavalryman riding a horse with a lance being hit and recoiling, frame 1
```

### `map/units/cavalry_hit_1.png`

Replay : cavalry touché — phase 2/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: a cavalryman riding a horse with a lance being hit and recoiling, frame 2
```

### `map/units/cavalry_walk_0.png`

Cycle de marche sur la carte : cavalry — phase 1/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a cavalryman riding a horse with a lance) marching toward the lower right, walk cycle frame 1 of 6
```

### `map/units/cavalry_walk_1.png`

Cycle de marche sur la carte : cavalry — phase 2/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a cavalryman riding a horse with a lance) marching toward the lower right, walk cycle frame 2 of 6
```

### `map/units/cavalry_walk_2.png`

Cycle de marche sur la carte : cavalry — phase 3/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a cavalryman riding a horse with a lance) marching toward the lower right, walk cycle frame 3 of 6
```

### `map/units/cavalry_walk_3.png`

Cycle de marche sur la carte : cavalry — phase 4/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a cavalryman riding a horse with a lance) marching toward the lower right, walk cycle frame 4 of 6
```

### `map/units/cavalry_walk_4.png`

Cycle de marche sur la carte : cavalry — phase 5/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a cavalryman riding a horse with a lance) marching toward the lower right, walk cycle frame 5 of 6
```

### `map/units/cavalry_walk_5.png`

Cycle de marche sur la carte : cavalry — phase 6/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a cavalryman riding a horse with a lance) marching toward the lower right, walk cycle frame 6 of 6
```

### `map/units/hero_EGYPT_attack_0.png`

Replay : le héros de Égypte attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the egypt hero with striped nemes headdress with a gold band, golden armor and a cape, striking with a sword, attack frame 1 of 3
```

### `map/units/hero_EGYPT_attack_1.png`

Replay : le héros de Égypte attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the egypt hero with striped nemes headdress with a gold band, golden armor and a cape, striking with a sword, attack frame 2 of 3
```

### `map/units/hero_EGYPT_attack_2.png`

Replay : le héros de Égypte attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the egypt hero with striped nemes headdress with a gold band, golden armor and a cape, striking with a sword, attack frame 3 of 3
```

### `map/units/hero_GAUL_attack_0.png`

Replay : le héros de Gaule attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the gaul hero with horned helmet and long hair, golden armor and a cape, striking with a sword, attack frame 1 of 3
```

### `map/units/hero_GAUL_attack_1.png`

Replay : le héros de Gaule attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the gaul hero with horned helmet and long hair, golden armor and a cape, striking with a sword, attack frame 2 of 3
```

### `map/units/hero_GAUL_attack_2.png`

Replay : le héros de Gaule attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the gaul hero with horned helmet and long hair, golden armor and a cape, striking with a sword, attack frame 3 of 3
```

### `map/units/hero_GREEK_attack_0.png`

Replay : le héros de Grèce attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the greek hero with golden Corinthian helmet with a blue crest, golden armor and a cape, striking with a sword, attack frame 1 of 3
```

### `map/units/hero_GREEK_attack_1.png`

Replay : le héros de Grèce attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the greek hero with golden Corinthian helmet with a blue crest, golden armor and a cape, striking with a sword, attack frame 2 of 3
```

### `map/units/hero_GREEK_attack_2.png`

Replay : le héros de Grèce attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the greek hero with golden Corinthian helmet with a blue crest, golden armor and a cape, striking with a sword, attack frame 3 of 3
```

### `map/units/hero_HUN_attack_0.png`

Replay : le héros de Huns attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the hun hero with fur-trimmed pointed felt cap, golden armor and a cape, striking with a sword, attack frame 1 of 3
```

### `map/units/hero_HUN_attack_1.png`

Replay : le héros de Huns attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the hun hero with fur-trimmed pointed felt cap, golden armor and a cape, striking with a sword, attack frame 2 of 3
```

### `map/units/hero_HUN_attack_2.png`

Replay : le héros de Huns attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the hun hero with fur-trimmed pointed felt cap, golden armor and a cape, striking with a sword, attack frame 3 of 3
```

### `map/units/hero_ROME_attack_0.png`

Replay : le héros de Rome attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the rome hero with Roman legionary helmet with a red crest, golden armor and a cape, striking with a sword, attack frame 1 of 3
```

### `map/units/hero_ROME_attack_1.png`

Replay : le héros de Rome attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the rome hero with Roman legionary helmet with a red crest, golden armor and a cape, striking with a sword, attack frame 2 of 3
```

### `map/units/hero_ROME_attack_2.png`

Replay : le héros de Rome attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the rome hero with Roman legionary helmet with a red crest, golden armor and a cape, striking with a sword, attack frame 3 of 3
```

### `map/units/hero_SULTAN_attack_0.png`

Replay : le héros de Sultanat attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the sultan hero with white turban with a gem, golden armor and a cape, striking with a sword, attack frame 1 of 3
```

### `map/units/hero_SULTAN_attack_1.png`

Replay : le héros de Sultanat attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the sultan hero with white turban with a gem, golden armor and a cape, striking with a sword, attack frame 2 of 3
```

### `map/units/hero_SULTAN_attack_2.png`

Replay : le héros de Sultanat attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: the sultan hero with white turban with a gem, golden armor and a cape, striking with a sword, attack frame 3 of 3
```

### `map/units/hoplite_attack_0.png`

Replay : hoplite attaque — phase 1/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an infantry soldier with spear and round shield striking, frame 1
```

### `map/units/hoplite_attack_1.png`

Replay : hoplite attaque — phase 2/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an infantry soldier with spear and round shield striking, frame 2
```

### `map/units/hoplite_attack_2.png`

Replay : hoplite attaque — phase 3/3  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an infantry soldier with spear and round shield striking, frame 3
```

### `map/units/hoplite_hit_0.png`

Replay : hoplite touché — phase 1/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an infantry soldier with spear and round shield being hit and recoiling, frame 1
```

### `map/units/hoplite_hit_1.png`

Replay : hoplite touché — phase 2/2  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a small battle-replay sprite: an infantry soldier with spear and round shield being hit and recoiling, frame 2
```

### `map/units/hoplite_walk_0.png`

Cycle de marche sur la carte : hoplite — phase 1/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an infantry soldier with spear and round shield) marching toward the lower right, walk cycle frame 1 of 6
```

### `map/units/hoplite_walk_1.png`

Cycle de marche sur la carte : hoplite — phase 2/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an infantry soldier with spear and round shield) marching toward the lower right, walk cycle frame 2 of 6
```

### `map/units/hoplite_walk_2.png`

Cycle de marche sur la carte : hoplite — phase 3/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an infantry soldier with spear and round shield) marching toward the lower right, walk cycle frame 3 of 6
```

### `map/units/hoplite_walk_3.png`

Cycle de marche sur la carte : hoplite — phase 4/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an infantry soldier with spear and round shield) marching toward the lower right, walk cycle frame 4 of 6
```

### `map/units/hoplite_walk_4.png`

Cycle de marche sur la carte : hoplite — phase 5/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an infantry soldier with spear and round shield) marching toward the lower right, walk cycle frame 5 of 6
```

### `map/units/hoplite_walk_5.png`

Cycle de marche sur la carte : hoplite — phase 6/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (an infantry soldier with spear and round shield) marching toward the lower right, walk cycle frame 6 of 6
```

### `map/units/merchant_walk_0.png`

Cycle de marche sur la carte : merchant — phase 1/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a merchant cart pulled by a horse) marching toward the lower right, walk cycle frame 1 of 6
```

### `map/units/merchant_walk_1.png`

Cycle de marche sur la carte : merchant — phase 2/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a merchant cart pulled by a horse) marching toward the lower right, walk cycle frame 2 of 6
```

### `map/units/merchant_walk_2.png`

Cycle de marche sur la carte : merchant — phase 3/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a merchant cart pulled by a horse) marching toward the lower right, walk cycle frame 3 of 6
```

### `map/units/merchant_walk_3.png`

Cycle de marche sur la carte : merchant — phase 4/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a merchant cart pulled by a horse) marching toward the lower right, walk cycle frame 4 of 6
```

### `map/units/merchant_walk_4.png`

Cycle de marche sur la carte : merchant — phase 5/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a merchant cart pulled by a horse) marching toward the lower right, walk cycle frame 5 of 6
```

### `map/units/merchant_walk_5.png`

Cycle de marche sur la carte : merchant — phase 6/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: (a merchant cart pulled by a horse) marching toward the lower right, walk cycle frame 6 of 6
```

### `map/units/settler_walk_0.png`

Cycle de marche sur la carte : cortège de colons — phase 1/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) marching toward the lower right, walk cycle frame 1 of 6
```

### `map/units/settler_walk_1.png`

Cycle de marche sur la carte : cortège de colons — phase 2/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) marching toward the lower right, walk cycle frame 2 of 6
```

### `map/units/settler_walk_2.png`

Cycle de marche sur la carte : cortège de colons — phase 3/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) marching toward the lower right, walk cycle frame 3 of 6
```

### `map/units/settler_walk_3.png`

Cycle de marche sur la carte : cortège de colons — phase 4/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) marching toward the lower right, walk cycle frame 4 of 6
```

### `map/units/settler_walk_4.png`

Cycle de marche sur la carte : cortège de colons — phase 5/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) marching toward the lower right, walk cycle frame 5 of 6
```

### `map/units/settler_walk_5.png`

Cycle de marche sur la carte : cortège de colons — phase 6/6  
**Taille** : 1024x1024 (fond transparent) · **Guide** : [guide-armee.png](img/guides-carte/guide-armee.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). A small group of marching figures standing directly on the ground (no base, no ground drawn), centered, feet at about 75% of the image height, overall height about 40% of the image, marching toward the lower right. The second image is a layout guide that shows the tile diamond in red: the feet stand on its center; do not draw the red diamond, the marks or the grey background.

Subject: a settlers' party (covered ox-wagon, walking family with bundles, a man with a flagged stake) marching toward the lower right, walk cycle frame 6 of 6
```

<a id="partie-13"></a>

## 13. Effets de la carte

Combat en cours, ville en feu, feu de camp, pluie, neige : par images qui bouclent.

### `map/fx/battle_0.png`

Carte : combat en cours — phase 1/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map clash of swords with dust (a battle marker), frame 1 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/battle_1.png`

Carte : combat en cours — phase 2/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map clash of swords with dust (a battle marker), frame 2 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/battle_2.png`

Carte : combat en cours — phase 3/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map clash of swords with dust (a battle marker), frame 3 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/battle_3.png`

Carte : combat en cours — phase 4/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map clash of swords with dust (a battle marker), frame 4 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/campfire_0.png`

Carte : feu de camp des tribus — phase 1/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map campfire, frame 1 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/campfire_1.png`

Carte : feu de camp des tribus — phase 2/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map campfire, frame 2 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/campfire_2.png`

Carte : feu de camp des tribus — phase 3/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map campfire, frame 3 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/campfire_3.png`

Carte : feu de camp des tribus — phase 4/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a world-map campfire, frame 4 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/fire_0.png`

Carte : ville en feu — phase 1/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a burning town (flames and black smoke), frame 1 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/fire_1.png`

Carte : ville en feu — phase 2/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a burning town (flames and black smoke), frame 2 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/fire_2.png`

Carte : ville en feu — phase 3/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a burning town (flames and black smoke), frame 3 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/fire_3.png`

Carte : ville en feu — phase 4/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a burning town (flames and black smoke), frame 4 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/rain_0.png`

Carte du monde : pluie (nappe translucide) — phase 1/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a translucent sheet of falling rain (world-map weather), frame 1 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/rain_1.png`

Carte du monde : pluie (nappe translucide) — phase 2/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a translucent sheet of falling rain (world-map weather), frame 2 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/rain_2.png`

Carte du monde : pluie (nappe translucide) — phase 3/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a translucent sheet of falling rain (world-map weather), frame 3 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/rain_3.png`

Carte du monde : pluie (nappe translucide) — phase 4/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: a translucent sheet of falling rain (world-map weather), frame 4 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/snowfall_0.png`

Carte du monde : chute de neige sur les régions enneigées — phase 1/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: falling snowflakes (world-map weather), frame 1 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/snowfall_1.png`

Carte du monde : chute de neige sur les régions enneigées — phase 2/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: falling snowflakes (world-map weather), frame 2 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/snowfall_2.png`

Carte du monde : chute de neige sur les régions enneigées — phase 3/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: falling snowflakes (world-map weather), frame 3 (same subject, same size and position in every frame, only the pose changes)
```

### `map/fx/snowfall_3.png`

Carte du monde : chute de neige sur les régions enneigées — phase 4/4  
**Taille** : 512x512 (fond transparent) · **Guide** : [guide-objet.png](img/guides-carte/guide-objet.png)

```text
Stylised 3D-rendered isometric diorama for a mobile strategy game, in exactly the look of the first reference image (an ancient-world map with a winding river, dense forests, rock outcrops and walled towns): soft realistic lighting, warm late-afternoon sun from the upper left, long soft shadows toward the lower right, natural saturated colours (lush green grass, golden dry grass, brown ploughed earth, ochre sand, deep blue water with sandy banks), detailed low-poly models with clean simple shapes and subtle ambient occlusion, no outlines, no hand-drawn strokes, no painterly brush texture. 2:1 isometric projection, camera looking down at 30 degrees, same scale as the reference (a walled town spans 2 x 2 tiles, a tree is about a fifth of a tile wide). No text, no letters, no numbers, no watermark, no user interface. Background: fully transparent (alpha channel). If transparency is not possible, a perfectly flat pure magenta (#FF00FF) background, which will be removed.

Composition: square image (1024 x 1024). The subject stands directly on the ground, WITHOUT any plot, slab, base or patch of ground under it: the ground is not drawn (transparent). Its footprint is one isometric tile: a 2:1 diamond 50% of the image width (512 px), centered horizontally, its center at 75% of the image height. The subject may rise above the diamond; it casts a soft shadow toward the lower right. The second image is a layout guide that shows this diamond in red: use it only to place the subject, do not draw the red diamond, the marks or the grey background.

Subject: A sprite sheet frame: falling snowflakes (world-map weather), frame 4 (same subject, same size and position in every frame, only the pose changes)
```

