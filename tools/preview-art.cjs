#!/usr/bin/env node
// ============================================================================
// preview-art.cjs — aperçu en jeu après un import : ville développée (toutes les familles de bâtiments aux trois
// paliers, champs, enceinte), vue d'ensemble et zoom, jour et nuit, bureau et mobile, carte, écran du héros,
// onglet Armée, écran de connexion. Captures dans <dossier de sortie>/<FACTION>-<biome>-*.png.
//   node tools/preview-art.cjs [FACTION] [biome] [dossier]      (défaut : ROME forest store/preview ; variables API_BASE, WEB_BASE, DATABASE_URL)
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright requis'); process.exit(1); }
const ROOT = path.resolve(__dirname, '..');
const T = require(path.join(ROOT, 'frontend', 'js', 'shared', 'terrain.js'));
const API = process.env.API_BASE || 'http://localhost:3000', WEB = (process.env.WEB_BASE || 'http://localhost:8083') + '/index.html';
const DB = process.env.DATABASE_URL || 'postgresql://monjeu:monjeu123@localhost:5432/monjeu';
const faction = (process.argv[2] || 'ROME').toUpperCase(), biome = process.argv[3] || 'forest';
const OUT = path.resolve(process.argv[4] || path.join(ROOT, 'store', 'preview'));
const sql = q => execSync(`psql "${DB}" -At -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
const BLOCKED = { mountain: 1, icemountain: 1, water: 1, frozen: 1, oasis: 1 };
function coordsFor(b) {
  for (let r = 2; r < 160; r += 3) for (let a = 0; a < 360; a += 25) {
    const x = Math.round(Math.cos(a * Math.PI / 180) * r), y = Math.round(Math.sin(a * Math.PI / 180) * r);
    if (T.getBiome(x, y) === b && !BLOCKED[T.getTerrainType(x, y).feature] && sql(`SELECT count(*) FROM "City" WHERE x=${x} AND y=${y}`) === '0') return [x, y];
  }
  return [0, 0];
}
const FACTION_BUILDING = { ROME: 'ROMAN_THERMAE', GAUL: 'GALLIC_BREWERY', GREEK: 'GREEK_TEMPLE', EGYPT: 'EGYPTIAN_IRRIGATION', HUN: 'HUN_WAR_TENT', SULTAN: 'SULTAN_DESERT_OUTPOST' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const uid = Math.floor(Math.random() * 1e6);
  const reg = await (await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `preview${uid}@t.fr`, password: 'Test1234!', name: `Preview${uid}`, faction }) })).json();
  if (!reg.token) throw new Error('register: ' + JSON.stringify(reg));
  const pid = reg.player.id, cityId = sql(`SELECT id FROM "City" WHERE "playerId"='${pid}'`);
  const [bx, by] = coordsFor(biome);
  sql(`UPDATE "City" SET x=${bx}, y=${by}, wood=80000,stone=80000,iron=80000,food=80000,"maxStorage"=200000,"maxFoodStorage"=200000 WHERE id='${cityId}'`);
  sql(`UPDATE "Army" SET x=${bx}, y=${by} WHERE "cityId"='${cityId}'`);
  // les trois paliers visuels représentés : niveaux 3 (palier 1), 9 (palier 2), 16 (palier 3)
  const b = [['RALLY_POINT', 1, 9], ['BARRACKS', 3, 16], ['MARKET', 5, 9], ['STABLE', 7, 3], ['WAREHOUSE', 9, 16], ['WALL', 11, 16], ['SILO', 13, 9], ['WORKSHOP', 15, 3], ['ACADEMY', 17, 9], ['HEALING_TENT', 19, 3], ['FORGE', 2, 16], ['EMBASSY', 4, 3], ['HERO_MANSION', 6, 9], ['WATCHTOWER', 8, 16], ['HIDEOUT', 10, 3], ['MILL', 12, 3], ['TREASURE_CHAMBER', 14, 9], ['RESIDENCE', 16, 16], [FACTION_BUILDING[faction] || 'TRADE_OFFICE', 18, 9]];
  for (const [k, slot, lvl] of b) sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityId}','${k}',${slot},${lvl}) ON CONFLICT DO NOTHING`);
  const fields = { LUMBER: [101, 102, 103, 104], QUARRY: [105, 106, 107, 108], IRON_MINE: [109, 110, 111, 112], FARM: [113, 114, 115, 116, 117, 118] };
  let i = 0; for (const [k, slots] of Object.entries(fields)) for (const slot of slots) { i++; if (i % 6 === 0) continue; sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityId}','${k}',${slot},${[3, 9, 16][i % 3]}) ON CONFLICT DO NOTHING`); }
  sql(`UPDATE "CityBuilding" SET level=16 WHERE "cityId"='${cityId}' AND key='MAIN_HALL'`);
  const gar = sql(`SELECT id FROM "Army" WHERE "cityId"='${cityId}' AND "isGarrison"`);
  const pre = { ROME: 'ROM', GAUL: 'GAU', GREEK: 'GRE', EGYPT: 'EGY', HUN: 'HUN', SULTAN: 'SUL' }[faction] || 'ROM';
  const units = sql(`SELECT 1`) && require(path.join(ROOT, 'data', 'units.json')).units.filter(u => u.faction === faction).slice(0, 6);
  for (const u of units) sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${gar}','${u.key}','${u.tier}',${20 + Math.floor(Math.random() * 80)}) ON CONFLICT DO NOTHING`);
  void pre;
  const browser = await chromium.launch();
  const errors = [];
  for (const [label, vp] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844, mobile: true }]]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|404|net::ERR|Failed to load resource/.test(m.text())) errors.push(`${label} console: ${m.text()}`); });
    const tag = `${faction}-${biome}-${label}`;
    const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); };
    // écran de connexion (sans jeton)
    await page.goto(WEB, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(1500); await shot('00-connexion');
    await page.evaluate((t) => { localStorage.setItem('token', t); }, reg.token);
    await page.addInitScript((a) => { window.API_SERVER = a.api; localStorage.setItem('token', a.t); }, { api: API, t: reg.token });
    await page.goto(WEB, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof currentCity !== 'undefined' && currentCity && document.getElementById('game-screen').style.display === 'flex', null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { window.isNightMode = () => false; document.body.classList.remove('night-mode'); showTab('city'); }); await page.waitForTimeout(1500); await shot('01-ville-jour');
    await page.evaluate(() => { cityCam.zoom = 1.9; cityCam.auto = false; renderCityCanvas(); }); await shot('02-ville-zoom');
    await page.evaluate(() => { resetCityCamera(); window.isNightMode = () => true; document.body.classList.add('night-mode'); renderCityCanvas(); }); await page.waitForTimeout(1000); await shot('03-ville-nuit');
    await page.evaluate(() => { window.isNightMode = () => false; document.body.classList.remove('night-mode'); });
    const r = await page.evaluate(() => { const s = citySlots.find(x => x.slot === 3); const rect = cityCanvas.getBoundingClientRect(); return { x: rect.left + s.x, y: rect.top + s.y - 6 }; });
    if (vp.mobile) await page.touchscreen.tap(r.x, r.y); else { await page.mouse.move(r.x, r.y); await page.mouse.click(r.x, r.y); }
    await shot('04-bulle'); await page.evaluate(() => hideCityActions());
    await page.evaluate(() => showTab('map')); await page.waitForTimeout(2500); await shot('05-carte');
    await page.evaluate(() => showTab('army')); await page.waitForTimeout(1200); await shot('06-armee');
    await page.evaluate(() => showTab('hero')); await page.waitForTimeout(1500); await shot('07-heros');
    await page.evaluate(() => showTab('market')); await page.waitForTimeout(1200); await shot('08-marche');
    await page.evaluate(() => { showTab('city'); openBuildPanel(21); }); await page.waitForTimeout(800); await shot('09-liste-construction');
    await page.evaluate(() => { closeBuildPanel(); showUnitInfoModal(unitsData.find(u => u.faction === player.faction)?.key); }); await page.waitForTimeout(600); await shot('10-fiche-unite');
    await ctx.close();
  }
  await browser.close();
  console.log(`${faction}/${biome} (${bx},${by}) : captures dans ${OUT}`);
  console.log(errors.length ? 'ERREURS :\n' + errors.join('\n') : 'aucune erreur console');
})().catch(e => { console.error(e); process.exit(1); });
