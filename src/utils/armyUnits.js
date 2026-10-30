// Lignes d'unités d'armée après un combat (assauts de ville et de Bastion)

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

// Lignes d'unités fusionnées par type (plusieurs camps peuvent amener le même type)
function mergeUnits(rows) {
  const m = {};
  for (const u of rows) if (u.count > 0) (m[u.unitKey] ||= { unitKey: u.unitKey, tier: u.tier, count: 0 }).count += u.count;
  return Object.values(m);
}

module.exports = { survivalRatio, applyLosses, mergeUnits };
