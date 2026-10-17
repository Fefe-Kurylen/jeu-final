// Browser smoke test: every tab, taps on city/fields/map, panning, settings, no console errors, on desktop and phone.
// Needs: the API (API_BASE), a static server for frontend/ (WEB_BASE), psql access (DATABASE_URL) and Playwright
// (NODE_PATH pointing to a node_modules that contains it, e.g. NODE_PATH=/opt/node-tools/node_modules).
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const API = process.env.API_BASE || 'http://localhost:3000', WEB = (process.env.WEB_BASE || 'http://localhost:8083') + '/index.html';
const DB = process.env.DATABASE_URL || 'postgresql://monjeu:monjeu123@localhost:5432/monjeu';
const sql = q => execSync(`psql "${DB}" -At -c ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
(async () => {
  const uid = Math.floor(Math.random() * 1e6);
  const reg = await (await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `smk${uid}@t.fr`, password: 'Test1234!', name: `Smk${uid}`, faction: 'GAUL' }) })).json();
  const pid = reg.player.id, cityId = sql(`SELECT id FROM "City" WHERE "playerId"='${pid}'`);
  sql(`UPDATE "City" SET wood=50000,stone=50000,iron=50000,food=50000,"maxStorage"=100000,"maxFoodStorage"=100000 WHERE id='${cityId}'`);
  for (const [k, slot, lvl] of [['BARRACKS', 3, 5], ['WALL', 11, 4], ['LUMBER', 101, 3], ['FARM', 113, 2]]) sql(`INSERT INTO "CityBuilding"(id,"cityId",key,slot,level) VALUES (gen_random_uuid(),'${cityId}','${k}',${slot},${lvl}) ON CONFLICT DO NOTHING`);
  const errors = [], failed = [], out = [];
  const b = await chromium.launch();
  for (const [label, vp] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844, mobile: true }]]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
    const page = await ctx.newPage();
    await page.addInitScript((a) => { window.API_SERVER = a.api; localStorage.setItem('token', a.t); }, { api: API, t: reg.token });
    page.on('console', m => { if (m.type() === 'error') errors.push(`[${label}] ${m.text().slice(0, 160)}`); });
    page.on('pageerror', e => errors.push(`[${label}] PAGEERROR: ${e.message.slice(0, 200)}`));
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('fonts.g')) failed.push(`[${label}] ${r.status()} ${r.url().replace(API, '').replace(WEB.replace('/index.html', ''), '')}`); });
    await page.goto(WEB, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof currentCity !== 'undefined' && currentCity && document.getElementById('game-screen').style.display === 'flex', null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    for (const tab of ['fields', 'city', 'map', 'army', 'reports', 'ranking', 'inventory', 'hero', 'alliance', 'market']) { await page.evaluate(t => showTab(t), tab); await page.waitForTimeout(600); const t = await page.evaluate(() => document.getElementById('game-screen').innerText); for (const w of ['undefined', 'NaN', '[object Object]']) if (t.includes(w)) out.push(`${label} ${tab}: contains "${w}"`); }
    // city: click slot 3 (barracks) and an empty slot 5 via pointer
    await page.evaluate(() => showTab('city')); await page.waitForTimeout(800);
    for (const sn of [3, 5, 0]) {
      const r = await page.evaluate((sn) => { const s = citySlots.find(x => x.slot === sn); const rect = cityCanvas.getBoundingClientRect(); return { x: rect.left + s.x, y: rect.top + s.y - 6 }; }, sn);
      if (vp.mobile) await page.touchscreen.tap(r.x, r.y); else { await page.mouse.move(r.x, r.y); await page.mouse.click(r.x, r.y); }
      await page.waitForTimeout(500);
      const bubble = await page.evaluate(() => { const el = document.getElementById('city-actions'); return el && el.style.display !== 'none' ? el.innerText.replace(/\s+/g, ' ').slice(0, 60) : 'none'; });
      await page.evaluate(() => document.querySelector('#city-actions .ca-btn.primary')?.click()); await page.waitForTimeout(500);
      out.push(`${label} city slot ${sn}: bubble=[${bubble}] -> ` + (await page.evaluate(() => (document.getElementById('build-panel-title')?.innerText || '').replace(/\s+/g, ' ').slice(0, 40))) + ' | ' + (await page.evaluate(() => document.getElementById('build-panel')?.style.display)));
      await page.evaluate(() => closeBuildPanel());
    }
    // pan: drag on empty terrain must not open a panel
    const c = await page.evaluate(() => { const rect = cityCanvas.getBoundingClientRect(); return { x: rect.left + 60, y: rect.top + 60 }; });
    if (vp.mobile) { await page.touchscreen.tap(c.x, c.y); } else { await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 80, c.y + 40, { steps: 6 }); await page.mouse.up(); }
    await page.waitForTimeout(400);
    out.push(`${label} after pan/empty tap: panel=` + (await page.evaluate(() => document.getElementById('build-panel')?.style.display)) + ' cam=' + (await page.evaluate(() => JSON.stringify(cityCam))));
    // fields (same scene): tap field 101 (lumber) and 113 (farm), then the bubble's primary button
    await page.evaluate(() => showTab('fields')); await page.waitForTimeout(800);
    for (const sn of [101, 113]) {
      const r = await page.evaluate((sn) => { const s = citySlots.find(x => x.slot === sn); const rect = cityCanvas.getBoundingClientRect(); return { x: rect.left + s.x, y: rect.top + s.y - 4 }; }, sn);
      if (vp.mobile) await page.touchscreen.tap(r.x, r.y); else { await page.mouse.move(r.x, r.y); await page.mouse.click(r.x, r.y); }
      await page.waitForTimeout(500);
      const bubble = await page.evaluate(() => { const el = document.getElementById('city-actions'); return el && el.style.display !== 'none' ? el.innerText.replace(/\s+/g, ' ').slice(0, 40) : 'none'; });
      await page.evaluate(() => document.querySelector('#city-actions .ca-btn.primary')?.click()); await page.waitForTimeout(500);
      out.push(`${label} field ${sn}: view=` + (await page.evaluate(() => currentCityView)) + ` bubble=[${bubble}] panel=` + (await page.evaluate(() => (document.getElementById('build-panel-title')?.innerText || '').replace(/\s+/g, ' ').slice(0, 30))));
      await page.evaluate(() => closeBuildPanel());
    }
    // map click on own city
    await page.evaluate(() => showTab('map')); await page.waitForTimeout(2000);
    const mp = await page.evaluate(() => { const p = window.mapWorldToScreen(currentCity.x, currentCity.y); const rect = mapCanvas.getBoundingClientRect(); return { x: rect.left + p.x, y: rect.top + p.y - 0.6 * 32 * mapZoomLevel }; });
    await page.mouse.click(mp.x, mp.y); await page.waitForTimeout(500);
    out.push(`${label} map click -> ` + (await page.evaluate(() => (document.getElementById('map-panel-content')?.innerText || '').replace(/\s+/g, ' ').slice(0, 50))));
    await page.evaluate(() => showTab('city')); await page.waitForTimeout(500);
    await page.evaluate(() => openSettings()); await page.waitForTimeout(300); out.push(`${label} settings modal=` + (await page.evaluate(() => document.getElementById('modal').style.display))); await page.evaluate(() => closeModal());
    await ctx.close();
  }
  await b.close();
  console.log(out.join('\n'));
  const realErrors = [...new Set(errors)].filter(e => !/ERR_ABORTED|net::ERR_FAILED/.test(e));
  const realFailed = [...new Set(failed)];
  console.log('--- console errors ---'); console.log(realErrors.join('\n') || '(none)');
  console.log('--- failed requests ---'); console.log(realFailed.join('\n') || '(none)');
  const bad = out.filter(l => /contains "/.test(l));
  if (realErrors.length || realFailed.length || bad.length) { console.log('SMOKE FAILED'); process.exit(1); }
  console.log('SMOKE OK');
})().catch(e => { console.error(e); process.exit(1); });
