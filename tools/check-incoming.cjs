#!/usr/bin/env node
// ============================================================================
// check-incoming.cjs — vérifie une livraison d'images AVANT import : pour chaque fichier, le nom est-il reconnu
// (sinon suggestions), à quoi sert l'image dans le jeu, la taille livrée convient-elle, le fond est-il transparent
// (ou uni à détourer), une bande d'animation a-t-elle le bon nombre de cases.
//   node tools/check-incoming.cjs [dossier]          (défaut : art/incoming)
// Aucune image n'est modifiée. Ensuite : node tools/repaint.cjs --import=<dossier>
// ============================================================================
const fs = require('fs');
const path = require('path');
const T = require('./repaint/targets.cjs');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'art', 'incoming'));

// Dimensions et présence d'alpha sans dépendance : PNG, JPEG, WebP
function imageInfo(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.toString('ascii', 1, 4) === 'PNG') { const ct = b[25]; return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: ct === 4 || ct === 6, format: 'png' }; }
  if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), alpha: false, format: 'jpeg' }; i += 2 + b.readUInt16BE(i + 2); } return null; }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const tag = b.toString('ascii', 12, 16);
    if (tag === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false, format: 'webp' };
    if (tag === 'VP8L') { const bits = b.readUInt32LE(21); return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, alpha: !!((bits >> 28) & 1), format: 'webp' }; }
    if (tag === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), alpha: !!(b[20] & 0x10), format: 'webp' };
  }
  return null;
}
const files = [];
const walk = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(png|jpe?g|webp)$/i.test(f)) files.push(p); } };
walk(dir);
if (!files.length) { console.log(`Aucune image dans ${dir}`); process.exit(0); }
const all = T.buildAllTargets(), index = T.buildIndex(all);
const painted = new Set((() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'assets', 'images', 'painted', 'manifest.json'), 'utf8')).files; } catch (e) { return []; } })());
let ok = 0, warn = 0, bad = 0;
const lines = [];
for (const f of files.sort()) {
  const rel = path.relative(dir, f).replace(/\\/g, '/');
  const info = imageInfo(f);
  const r = T.resolveDelivered(rel, index);
  if (!r) { bad++; const sug = T.suggest(rel, index); lines.push(`✖ ${rel}\n    nom inconnu${sug.length ? ' — vouliez-vous dire : ' + sug.join(', ') : ''}`); continue; }
  if (!info) { bad++; lines.push(`✖ ${rel}\n    format d'image illisible (PNG, JPEG ou WebP attendus)`); continue; }
  const notes = [];
  if (r.store) {
    const [ew, eh] = r.store.size;
    if (info.w !== ew || info.h !== eh) { warn++; notes.push(`taille ${info.w}×${info.h}, attendu ${ew}×${eh} (sera redimensionnée)`); }
    if (r.store.file.includes('ic_stat') && !info.alpha) { warn++; notes.push('icône de notification : fond transparent requis (PNG avec alpha)'); }
    lines.push(`✔ ${rel} → ${r.store.file}\n    ${r.store.role}${notes.length ? '\n    ⚠ ' + notes.join(' ; ') : ''}`);
    ok++; continue;
  }
  const t = r.target || r.strip.targets[0];
  const n = r.strip ? r.strip.n : 1;
  const [dw, dh] = T.deliverySize(t).split('x').map(Number);
  const expectW = dw * n, ratio = info.w / info.h, expectRatio = (dw * n) / dh;
  if (Math.abs(ratio / expectRatio - 1) > 0.08) { warn++; notes.push(`proportions ${info.w}×${info.h} (${ratio.toFixed(2)}), attendu ${r.strip ? `une bande de ${n} cases ` : ''}${dw}×${dh}${r.strip ? ` (${expectW}×${dh})` : ''} ; l'image sera ajustée sans déformation, avec des marges`); }
  else if (info.w < expectW * 0.5) { warn++; notes.push(`image petite (${info.w}×${info.h}) : elle sera agrandie, le rendu risque d'être flou`); }
  const opaqueTarget = !!t.opaque;
  if (!opaqueTarget && !info.alpha) { warn++; notes.push(info.format === 'jpeg' ? 'JPEG sans transparence : fond uni magenta/vert ou couleur des coins détouré automatiquement' : 'pas de couche alpha : le fond uni sera détouré (mieux : PNG transparent)'); }
  if (opaqueTarget && info.alpha) notes.push('texture : la transparence sera ignorée (fond gris)');
  const already = r.strip ? r.strip.targets.every(x => painted.has(x.file)) : painted.has(t.file);
  const role = r.strip ? r.strip.targets[0].role.replace(/ — phase.*$/, '') + ` (bande de ${n} phases → ${r.strip.base}_0…${n - 1})` : t.role;
  lines.push(`✔ ${rel} → ${r.strip ? r.strip.base + '_<0..' + (n - 1) + '>.webp' : t.file}${already ? '  (remplace une version déjà peinte)' : ''}\n    ${role}\n    ${info.w}×${info.h} ${info.format}${info.alpha ? ', transparent' : ''}${notes.length ? '\n    ⚠ ' + notes.join(' ; ') : ''}`);
  ok++;
}
console.log(`Livraison : ${dir}\n`);
console.log(lines.join('\n'));
console.log(`\n${ok} reconnue(s), ${warn} avertissement(s), ${bad} refusée(s).`);
if (ok) console.log(`Suite : node tools/repaint.cjs --import=${path.relative(process.cwd(), dir) || '.'}   puis   node tools/preview-art.cjs <FACTION> <biome>`);
process.exit(bad ? 1 : 0);
