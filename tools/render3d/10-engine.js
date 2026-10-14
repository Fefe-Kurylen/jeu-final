// ============================================================================
// 10-engine.js — moteur de rendu des sprites 2.5D (exécuté dans Chromium headless par build-3d.cjs).
// Caméras orthographiques fixes (isométrique 2:1 pour la ville et la carte, 3/4 pour les figurines,
// face pour les icônes), lumière du jour avec ombres douces, sol « attrape-ombres » transparent,
// contour à l'encre calculé après coup, sortie WebP avec transparence.
// ============================================================================
(function () {
  const T = window.THREE;
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  const renderer = new T.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;

  // ---- Cadres : taille 1× en px, ancre (fraction), pixels par unité monde, préréglage de caméra ----
  // L'unité monde = 1 « unité iso » de l'ancien générateur : une parcelle de ville = 2×2 unités.
  const TILE_PX = 100;                   // largeur à l'écran (1×) d'une parcelle de 2 unités en vue iso
  const PX_PER_UNIT_ISO = TILE_PX / (2 * Math.SQRT2);   // projection iso : (x−z)/√2 → écran
  const FRAMES = {
    building: { w: 130, h: 180, ax: 0.5, ay: 0.75, cam: 'iso', ppu: PX_PER_UNIT_ISO },
    field:    { w: 130, h: 180, ax: 0.5, ay: 0.75, cam: 'iso', ppu: PX_PER_UNIT_ISO },
    plot:     { w: 130, h: 180, ax: 0.5, ay: 0.75, cam: 'iso', ppu: PX_PER_UNIT_ISO },
    prop:     { w: 64,  h: 96,  ax: 0.5, ay: 0.92, cam: 'iso', ppu: PX_PER_UNIT_ISO * 1.4 },
    map:      { w: 256, h: 256, ax: 0.5, ay: 0.797, cam: 'iso', ppu: PX_PER_UNIT_ISO * 1.6 },
    figure:   { w: 128, h: 192, ax: 0.5, ay: 0.94, cam: 'three-quarter', ppu: 80 },
    bust:     { w: 64,  h: 64,  ax: 0.5, ay: 0.5,  cam: 'bust', ppu: 70 },
    icon:     { w: 64,  h: 64,  ax: 0.5, ay: 0.5,  cam: 'icon', ppu: 26 },
    ui:       { w: 192, h: 192, ax: 0.5, ay: 0.5,  cam: 'front', ppu: 1 },
    scene:    { w: 640, h: 360, ax: 0.5, ay: 0.5,  cam: 'iso', ppu: PX_PER_UNIT_ISO },
    sceneP:   { w: 540, h: 960, ax: 0.5, ay: 0.5,  cam: 'iso', ppu: PX_PER_UNIT_ISO * 1.6 },
    sceneL:   { w: 960, h: 540, ax: 0.5, ay: 0.62, cam: 'iso', ppu: PX_PER_UNIT_ISO * 1.3 },
    stage:    { w: 256, h: 384, ax: 0.5, ay: 0.9,  cam: 'three-quarter', ppu: 125 },
    header:   { w: 240, h: 120, ax: 0.5, ay: 0.7,  cam: 'iso', ppu: PX_PER_UNIT_ISO * 1.1 },
    battlefield: { w: 640, h: 240, ax: 0.5, ay: 0.62, cam: 'iso', ppu: PX_PER_UNIT_ISO * 0.9 },
    button:   { w: 160, h: 56,  ax: 0.5, ay: 0.5,  cam: 'front', ppu: 1 },
    frame:    { w: 192, h: 192, ax: 0.5, ay: 0.5,  cam: 'front', ppu: 1 },
    plate:    { w: 160, h: 96,  ax: 0.5, ay: 0.5,  cam: 'front', ppu: 1 }
  };
  const SCALE = 2;   // rendu 2× (écrans haute densité)

  // ---- Scène ----
  const scene = new T.Scene();
  const sun = new T.DirectionalLight(0xfff1d6, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new T.HemisphereLight(0xcfe3ff, 0x9a7a4a, 0.85);
  scene.add(hemi);
  const fill = new T.DirectionalLight(0xffe6c8, 0.35);   // lumière de retour : la face droite reste lisible
  scene.add(fill);
  const catcher = new T.Mesh(new T.PlaneGeometry(60, 60), new T.ShadowMaterial({ opacity: 0.38 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  scene.add(catcher);
  let content = new T.Group();
  scene.add(content);

  function setupLights(preset, extent) {
    const d = Math.max(4, extent * 1.4);
    if (preset === 'iso' || preset === 'three-quarter') {
      sun.position.set(-2.6, 14, 7.5).normalize().multiplyScalar(40);   // soleil haut (ombres courtes), à gauche et devant : face gauche éclairée
      fill.position.set(10, 6, -4);
    } else if (preset === 'bust') {
      sun.position.set(-4, 8, 10).normalize().multiplyScalar(40);
      fill.position.set(6, 3, 8);
    } else {   // icon / front
      sun.position.set(-3, 9, 10).normalize().multiplyScalar(40);
      fill.position.set(6, 4, 8);
    }
    sun.target.position.set(0, 0, 0);
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d; sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 100 + extent * 3;
    sun.shadow.camera.updateProjectionMatrix();
  }

  // Caméra orthographique : l'origine du monde tombe sur l'ancre du cadre
  function makeCamera(frame, opts = {}) {
    const W = frame.w, H = frame.h, ppu = opts.ppu || frame.ppu;
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    const halfW = W / ppu / 2, halfH = H / ppu / 2;
    const ax = opts.ax ?? frame.ax, ay = opts.ay ?? frame.ay;
    // bornes en « unités écran » : l'origine projetée est à (ax, ay) du cadre
    cam.left = -W / ppu * ax; cam.right = W / ppu * (1 - ax);
    cam.top = H / ppu * ay; cam.bottom = -H / ppu * (1 - ay);
    const pitch = (opts.pitch ?? (frame.cam === 'iso' ? 30 : frame.cam === 'three-quarter' ? 18 : frame.cam === 'bust' ? 6 : frame.cam === 'icon' ? 28 : 0)) * Math.PI / 180;
    const yaw = (opts.yaw ?? (frame.cam === 'iso' ? 45 : frame.cam === 'three-quarter' ? 28 : frame.cam === 'icon' ? 30 : 0)) * Math.PI / 180;
    const dist = 120;
    const target = new T.Vector3(opts.tx || 0, opts.ty || 0, opts.tz || 0);
    cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    void halfW; void halfH;
    return cam;
  }

  // ---- Contour à l'encre : silhouette alpha dilatée en brun sombre sous le rendu ----
  function outline(src, w, h, px, color) {
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const x = out.getContext('2d');
    // masque teinté
    const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
    const m = mask.getContext('2d');
    m.drawImage(src, 0, 0);
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = color; m.fillRect(0, 0, w, h);
    const r = px;
    for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; x.drawImage(mask, Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r)); }
    x.globalAlpha = 1;
    x.drawImage(src, 0, 0);
    return out;
  }

  // Rendu d'un travail : { frame, build(T, group, helpers) -> {extent?}, opts }
  async function renderJob(job) {
    const frame = FRAMES[job.frame];
    const W = Math.round(frame.w * SCALE), H = Math.round(frame.h * SCALE);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    renderer.setSize(W, H, false);
    scene.remove(content);
    content = new T.Group();
    scene.add(content);
    const built = job.build(content) || {};
    const extent = built.extent || 6;
    const preset = frame.cam;
    setupLights(preset, extent);
    catcher.visible = built.shadowCatcher !== false;
    const cam = makeCamera(frame, Object.assign({}, job.cam || {}, built.cam || {}));
    renderer.render(scene, cam);
    // post : contour
    const twoD = document.createElement('canvas'); twoD.width = W; twoD.height = H;
    const c2 = twoD.getContext('2d');
    if (built.outline !== false) c2.drawImage(outline(canvas, W, H, Math.max(1, Math.round((built.outlinePx || 1.4) * SCALE)), built.outlineColor || 'rgba(46,28,14,0.9)'), 0, 0);
    else c2.drawImage(canvas, 0, 0);
    // nettoyage GPU
    content.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    return twoD.toDataURL('image/webp', job.quality || 0.9);
  }

  window.R3D = { T, scene, renderer, FRAMES, SCALE, renderJob, makeCamera };
})();
