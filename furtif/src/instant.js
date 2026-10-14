// Réponses instantanées calculées localement : calculatrice, conversions simples, date/heure.
// Aucun appel réseau : la requête ne quitte jamais le serveur pour ces réponses.

const UNITS = {
  km: ['m', 1000], m: ['m', 1], cm: ['m', 0.01], mm: ['m', 0.001], mi: ['m', 1609.344], miles: ['m', 1609.344], ft: ['m', 0.3048], pieds: ['m', 0.3048], in: ['m', 0.0254], pouces: ['m', 0.0254],
  kg: ['kg', 1], g: ['kg', 0.001], t: ['kg', 1000], lb: ['kg', 0.45359237], lbs: ['kg', 0.45359237], oz: ['kg', 0.028349523],
  l: ['l', 1], ml: ['l', 0.001], gal: ['l', 3.785411784],
  h: ['s', 3600], min: ['s', 60], s: ['s', 1], j: ['s', 86400], jours: ['s', 86400],
};

export function instantAnswer(q) {
  const s = q.trim().toLowerCase();

  // Date / heure
  if (/^(quelle )?(heure|date)( est[- ]il| sommes[- ]nous)?\s*\??$/.test(s)) {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' });
    return { type: 'time', title: fmt.format(now), text: 'Heure de Paris' };
  }

  // Conversion d'unités : "10 km en miles", "3 lb en kg"
  const conv = s.match(/^([\d.,]+)\s*([a-zé]+)\s+(?:en|to|in|vers)\s+([a-zé]+)$/);
  if (conv) {
    const [, n, from, to] = conv;
    const a = UNITS[from], b = UNITS[to];
    if (a && b && a[0] === b[0]) {
      const v = parseFloat(n.replace(',', '.')) * a[1] / b[1];
      return { type: 'convert', title: `${fmtNum(v)} ${to}`, text: `${n} ${from} = ${fmtNum(v)} ${to}` };
    }
  }
  const temp = s.match(/^(-?[\d.,]+)\s*°?\s*([cf])\s+(?:en|to|in|vers)\s+°?\s*([cf])$/);
  if (temp) {
    const v = parseFloat(temp[1].replace(',', '.'));
    const r = temp[2] === temp[3] ? v : temp[2] === 'c' ? v * 9 / 5 + 32 : (v - 32) * 5 / 9;
    return { type: 'convert', title: `${fmtNum(r)} °${temp[3].toUpperCase()}`, text: `${temp[1]} °${temp[2].toUpperCase()} = ${fmtNum(r)} °${temp[3].toUpperCase()}` };
  }

  // Calculatrice : uniquement chiffres, opérateurs, parenthèses, % et ^
  if (/^[\d\s+\-*/().,%^×÷]+$/.test(s) && /\d/.test(s) && /[+\-*/^×÷%]/.test(s)) {
    try {
      const v = evaluate(s.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/'));
      if (Number.isFinite(v)) return { type: 'calc', title: fmtNum(v), text: `${q.trim()} =` };
    } catch { /* expression invalide */ }
  }
  return null;
}

function fmtNum(v) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 }).format(v);
}

// Évaluateur arithmétique par descente récursive (pas d'eval).
function evaluate(src) {
  let i = 0;
  const peek = () => src[i];
  const skip = () => { while (src[i] === ' ') i++; };
  function number() {
    skip();
    if (peek() === '(') { i++; const v = expr(); skip(); if (src[i++] !== ')') throw new Error(')'); return v; }
    if (peek() === '-') { i++; return -number(); }
    const m = /^\d*\.?\d+/.exec(src.slice(i));
    if (!m) throw new Error('nombre attendu');
    i += m[0].length;
    let v = parseFloat(m[0]);
    skip();
    if (peek() === '%') { i++; v /= 100; }
    return v;
  }
  function power() { let b = number(); skip(); while (peek() === '^') { i++; b = Math.pow(b, number()); skip(); } return b; }
  function term() {
    let v = power(); skip();
    while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = power(); v = op === '*' ? v * r : v / r; skip(); }
    return v;
  }
  function expr() {
    let v = term(); skip();
    while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; skip(); }
    return v;
  }
  const v = expr(); skip();
  if (i !== src.length) throw new Error('fin inattendue');
  return v;
}
