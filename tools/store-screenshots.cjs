#!/usr/bin/env node
// Captures pour les fiches App Store / Google Play, prises dans le jeu réel (API locale + frontend servi).
//   node tools/store-screenshots.cjs [apiUrl] [webUrl]
// Sorties : store/screenshots/<taille>/<n>-<vue>.png (6,7" 1290×2796 et 6,5" 1242×2688), avec un bandeau titre.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright requis : npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const API = process.argv[2] || 'http://localhost:3000';
const WEB = process.argv[3] || 'http://localhost:8083/index.html';
const OUT = path.join(__dirname, '..', 'store', 'screenshots');
const SIZES = [{ name: '6.7', width: 430, height: 932, scale: 3 }, { name: '6.5', width: 414, height: 896, scale: 3 }];
const SHOTS = [
  { tab: 'city', title: 'Bâtissez votre cité', sub: 'Six civilisations, chacune avec son architecture' },
  { tab: 'fields', title: 'Développez vos terres', sub: 'Fermes, forêts, carrières et mines' },
  { tab: 'map', title: 'Explorez un monde vivant', sub: 'Prairies, déserts et terres gelées', zoom: 1.5 },
  { tab: 'army', title: 'Levez vos armées', sub: 'Infanterie, archers, cavalerie, engins de siège' },
  { tab: 'hero', title: 'Envoyez votre héros', sub: 'Expéditions, butin et expérience' },
  { tab: 'ranking', title: 'Grimpez au classement', sub: 'Alliances, diplomatie et conquêtes' }
];

async function seededAccount() {
  const uid = Math.floor(Math.random() * 1e6);
  const reg = await (await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `store${uid}@t.fr`, password: 'Store1234!', name: `Imperator${uid}`, faction: 'ROME' }) })).json();
  if (!reg.token) throw new Error('register: ' + JSON.stringify(reg));
  // Enrichit la ville quand une base locale est accessible (DATABASE_URL), sinon la ville de départ suffit
  const db = process.env.DATABASE_URL;
  if (db) {
    const sql = q => execSync(`psql "${db}" -At -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
    const cityId = sql(`SELECT id FROM "City" WHERE "playerId"='${reg.player.id}'`);
    sql(`UPDATE "City" SET wood=120000,stone=120000,iron=120000,food=120000,"maxStorage"=200000,"maxFoodStorage"=200000 WHERE id='${cityId}'`);
    sql(`UPDATE "CityBuilding" SET level=15 WHERE "cityId"='${cityId}' AND key='MAIN_HALL'`);
    const b = [['BARRACKS', 1, 12], ['RALLY_POINT', 2, 8], ['MARKET', 3, 9], ['WAREHOUSE', 4, 14], ['SILO', 5, 14], ['ACADEMY', 6, 7], ['STABLE', 7, 8], ['WORKSHOP', 8, 5], ['FORGE', 9, 9], ['HEALING_TENT', 10, 4], ['WALL', 11, 12], ['HERO_MANSION', 12, 6], ['MILL', 13, 5], ['EMBASSY', 14, 3], ['WATCHTOWER', 15, 6], ['RESIDENCE', 16, 5], ['TREASURE_CHAMBER', 17, 3], ['ROMAN_THERMAE', 18, 4], ['BAKERY', 19, 4],
      ['LUMBER', 101, 12], ['LUMBER', 102, 9], ['LUMBER', 103, 15], ['LUMBER', 104, 7], ['QUARRY', 105, 10], ['QUARRY', 106, 14], ['QUARRY', 107, 8], ['QUARRY', 108, 5], ['IRON_MINE', 109, 11], ['IRON_MINE', 110, 15], ['IRON_MINE', 111, 6], ['IRON_MINE', 112, 9], ['FARM', 113, 12], ['FARM', 114, 16], ['FARM', 115, 9], ['FARM', 116, 14], ['FARM', 117, 7], ['FARM', 118, 11]];
    for (const [k, slot, lvl] of b) sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityId}','${k}',${slot},${lvl}) ON CONFLICT DO NOTHING`);
    const gar = sql(`SELECT id FROM "Army" WHERE "cityId"='${cityId}' AND "isGarrison"`);
    sql(`INSERT INTO "ArmyUnit"(id,"armyId","unitKey",tier,count) VALUES (gen_random_uuid(),'${gar}','ROM_INF_LEGIONNAIRE','elite',340),(gen_random_uuid(),'${gar}','ROM_ARC_VETERAN','intermediate',120),(gen_random_uuid(),'${gar}','ROM_CAV_EQUITES','base',80),(gen_random_uuid(),'${gar}','ROM_SIEGE_CATAPULTE','siege',6) ON CONFLICT DO NOTHING`);
  }
  return reg.token;
}

(async () => {
  const token = await seededAccount();
  const browser = await chromium.launch();
  for (const size of SIZES) {
    const dir = path.join(OUT, size.name);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(({ token, api }) => { window.API_SERVER = api; localStorage.setItem('token', token); }, { token, api: API });
    await page.goto(WEB, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof currentCity !== 'undefined' && currentCity && document.getElementById('game-screen').style.display === 'flex', null, { timeout: 30000 });
    await page.evaluate(() => { isNightMode = () => false; });
    await page.waitForTimeout(2500);
    let n = 1;
    for (const shot of SHOTS) {
      await page.evaluate((t) => showTab(t), shot.tab);
      await page.waitForTimeout(shot.tab === 'map' ? 3000 : 1500);
      if (shot.zoom) { await page.evaluate((z) => { mapZoomLevel = z; mapOffsetX = currentCity.x; mapOffsetY = currentCity.y; scheduleMapRender(true); }, shot.zoom); await page.waitForTimeout(1500); }
      // Bandeau marketing en haut (retiré après la capture)
      await page.evaluate(({ title, sub }) => {
        const b = document.createElement('div'); b.id = 'store-banner';
        b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;padding:env(safe-area-inset-top,20px) 16px 14px;background:linear-gradient(180deg,rgba(20,14,6,0.96),rgba(20,14,6,0.75) 80%,rgba(20,14,6,0));color:#ffd700;text-align:center;font-family:Cinzel,serif;';
        b.innerHTML = `<div style="font-size:30px;font-weight:700;text-shadow:0 2px 6px #000;margin-top:34px">${title}</div><div style="font-size:16px;color:#e8d8b0;font-family:'Crimson Text',Georgia,serif;margin-top:4px">${sub}</div>`;
        document.body.appendChild(b);
      }, shot);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(dir, `${n}-${shot.tab}.png`) });
      await page.evaluate(() => document.getElementById('store-banner')?.remove());
      n++;
    }
    await ctx.close();
    console.log(`${size.name}" : ${n - 1} captures dans ${dir}`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
