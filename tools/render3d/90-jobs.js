// ============================================================================
// 90-jobs.js — liste des sprites à rendre : { id, category, out, frame, model, args, cam?, quality? }
// ============================================================================
(function () {
  const FACTIONS = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
  const BIOMES = ['forest', 'desert', 'snow'];
  function list() {
    const jobs = [];
    // Bâtiments : faction × (normal, neige)
    for (const key of window.BUILDING_KEYS) for (const f of FACTIONS) {
      jobs.push({ id: `building/${f}/${key}`, category: 'buildings', out: `buildings/${f}/${key}.webp`, frame: 'building', model: 'building:' + key, args: [f, { snow: false }] });
      jobs.push({ id: `building/${f}/${key}_snow`, category: 'buildings', out: `buildings/${f}/${key}_snow.webp`, frame: 'building', model: 'building:' + key, args: [f, { snow: true, biome: 'snow' }] });
    }
    // Parcelles
    for (const b of BIOMES) for (const v of [0, 1]) jobs.push({ id: `plot/${b}/${v}`, category: 'plots', out: `plots/${b}_${v}.webp`, frame: 'plot', model: 'plot', args: [b, v] });
    // Champs : type × palier × biome
    if (window.FIELD_KEYS) for (const type of window.FIELD_KEYS) for (const tier of [1, 2, 3]) for (const b of BIOMES) jobs.push({ id: `field/${b}/${type}_${tier}`, category: 'fields', out: `fields/${b}/${type}_${tier}.webp`, frame: 'field', model: 'field:' + type, args: [tier, b] });
    // Décors
    if (window.PROP_KEYS) for (const p of window.PROP_KEYS) jobs.push({ id: `prop/${p}`, category: 'props', out: `props/${p}.webp`, frame: 'prop', model: 'prop:' + p, args: [] });
    // Carte
    if (window.MAP_JOBS) for (const j of window.MAP_JOBS()) jobs.push(j);
    // Figurines, icônes, UI, scènes
    for (const src of ['FIGURE_JOBS', 'ICON_JOBS', 'UI_JOBS', 'SCENE_JOBS']) if (window[src]) for (const j of window[src]()) jobs.push(j);
    return jobs;
  }
  window.JOBS = { list, FACTIONS, BIOMES };
})();
