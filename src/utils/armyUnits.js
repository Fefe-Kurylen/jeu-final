// Lignes d'unités d'armée après un combat (tous les combats au moteur de bataille)

// Part des soldats d'un type qui survit au combat (0 si le type n'y était pas)
function survivalRatio(finalUnits, key) {
  const r = finalUnits.find(u => u.key === key);
  return r && r.initial > 0 ? r.remaining / r.initial : 0;
}

// Pertes appliquées ligne par ligne avec la part de survie de son type
async function applyLosses(tx, units, finalUnits) {
  for (const unit of units) {
    const newCount = Math.round(unit.count * survivalRatio(finalUnits, unit.unitKey));
    if (newCount <= 0) await tx.armyUnit.deleteMany({ where: { id: unit.id } });
    else if (newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
  }
}

// Pertes du moteur de bataille réparties entre les armées qui ont combattu ensemble (décision du 2 novembre 2026, deuxième
// simulation de 200 jours, G3) : pour chaque type d'unité, les morts du moteur (finalUnits) se partagent au prorata des
// soldats de chaque armée, au plus fort reste. Le total de chaque type est exact : une petite ligne ne survit plus à force
// d'arrondis. Un type absent du combat ne perd rien. `armies` : [{ units: [{ unitKey, count }] }] ; rend pour chaque armée
// [{ unit, killed }] (killed > 0 seulement), dans l'ordre de `armies`.
function splitLosses(armies, finalUnits) {
  const out = armies.map(() => []);
  const byKey = new Map();
  armies.forEach((a, i) => { for (const u of a.units || []) if (u.count > 0) { if (!byKey.has(u.unitKey)) byKey.set(u.unitKey, []); byKey.get(u.unitKey).push({ i, u }); } });
  for (const [key, rows] of byKey) {
    const f = (finalUnits || []).find(x => x.key === key);
    const total = rows.reduce((t, r) => t + r.u.count, 0);
    const dead = f && f.initial > 0 ? Math.min(total, Math.round(f.killed * total / f.initial)) : 0;
    if (dead <= 0) continue;
    const shares = rows.map(r => ({ r, exact: dead * r.u.count / total }));
    let given = 0;
    for (const sh of shares) { sh.n = Math.floor(sh.exact); given += sh.n; }
    shares.slice().sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach(sh => { if (given < dead) { sh.n++; given++; } });
    for (const sh of shares) if (sh.n > 0) out[sh.r.i].push({ unit: sh.r.u, killed: Math.min(sh.n, sh.r.u.count) });
  }
  return out;
}

// Écrit les pertes du moteur de chaque armée (splitLosses) : lignes vidées supprimées, les autres diminuées ; le compte de
// chaque ligne en mémoire suit (rapports écrits après). Rend pour chaque armée { total, killed: [{ key, killed, remaining }] }.
async function applyEngineLosses(tx, armies, finalUnits) {
  const out = [];
  for (const losses of splitLosses(armies, finalUnits)) {
    let total = 0; const killed = [];
    for (const { unit, killed: n } of losses) {
      total += n; killed.push({ key: unit.unitKey, killed: n, remaining: unit.count - n });
      if (n >= unit.count) await tx.armyUnit.deleteMany({ where: { id: unit.id } }); else await tx.armyUnit.update({ where: { id: unit.id }, data: { count: { decrement: n } } });
      unit.count -= n;
    }
    out.push({ total, killed });
  }
  return out;
}

// Lignes d'unités fusionnées par type (plusieurs camps peuvent amener le même type)
function mergeUnits(rows) {
  const m = {};
  for (const u of rows) if (u.count > 0) (m[u.unitKey] ||= { unitKey: u.unitKey, tier: u.tier, count: 0 }).count += u.count;
  return Object.values(m);
}

module.exports = { survivalRatio, applyLosses, splitLosses, applyEngineLosses, mergeUnits };
