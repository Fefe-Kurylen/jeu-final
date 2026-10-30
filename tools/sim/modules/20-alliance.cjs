// Simulation longue — alliance : fondation et recrutement sur invitation (Ambassade 7 pour fonder, 5 pour rejoindre),
// officiers, aide d'alliance (demander, « Tout aider »), boutique d'alliance (achats, cosmétiques), messagerie (alliance,
// global, privé, amis, demandes d'amis), diplomatie (A et B en guerre, A et C alliés), et Bastion : placement par le chef ou
// un officier près des membres, convois de ravitaillement (armée « Convoi » chargée depuis la capitale), puis garnison.
// Un peu de vie aussi : un membre de C part et revient, le chef de C passe la main, le chef de B exclut puis réinvite un
// membre, un solitaire refuse une invitation. Les attaques contre le Bastion ennemi sont laissées au module de guerre.
// Chaque joueur fait au plus 6 appels par tour pour ce module ; les conditions sont vérifiées avant d'appeler.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const config = require(path.join(ROOT, 'src/config'));
const { buildingsData, unitsData, factionsData } = require(path.join(ROOT, 'src/config/gamedata'));
const fx = require(path.join(ROOT, 'src/utils/buildingEffects'));
const { getFactionBonus } = require(path.join(ROOT, 'src/utils/calculations'));
let spawnUtil = null;
const spawn = () => (spawnUtil ||= require(path.join(ROOT, 'src/utils/spawn')));   // lecture seule : la case est-elle libre (ce que montre la carte)

const RES = ['wood', 'stone', 'iron', 'food'];
const MAX_CALLS = 6;
const MAX_QUEUE = config.build.maxRunning + config.build.maxQueued;
const BASTION = config.bastion;
const CONVOY_NAME = 'Convoi';
const RECRUIT_BUILDING = { INFANTRY: 'BARRACKS', ARCHER: 'BARRACKS', CAVALRY: 'STABLE' };
const U = new Map(unitsData.map(u => [u.key, u]));
const carryOfUnit = (key) => U.get(key)?.stats?.carry || U.get(key)?.stats?.transport || 50;
const defOfUnit = (key) => U.get(key)?.stats?.defense || 0;

// noms des alliances (un jeu de noms par monde), validés par le filtre de noms du jeu
const NAMES = {
  A: [['Legio Aquila', 'AQL', 'Discipline, entraide et convois pour le Bastion.'], ['Cohors Aurea', 'AUR', 'La cohorte d\'or : on bâtit ensemble.'], ['Ordo Draconis', 'DRC', 'Ordre et vigilance.']],
  B: [['Lupi Septentrionis', 'LUP', 'Les loups chassent en meute.'], ['Fratres Lupi', 'FRL', 'Frères d\'armes, toujours unis.'], ['Ventus Orientis', 'VEN', 'Le vent de l\'est se lève.']],
  C: [['Concordia Maris', 'CMR', 'Commerce, paix et amitié avec nos voisins.'], ['Foedus Tridentis', 'TRD', 'Un pacte de marchands et de marins.'], ['Societas Portus', 'SOC', 'Le port est ouvert à nos amis.']]
};
const WANT_OFFICERS = { A: 3, B: 3, C: 2 };
// diplomatie voulue par groupe : ennemis déclarés et alliés
const ENEMIES = { A: ['B'], B: ['A'], C: [] };
const ALLIES = { A: ['C'], B: [], C: ['A'] };

const CHAT = {
  alliance: [
    'Bonjour à tous !', 'Pensez à demander de l\'aide sur vos constructions, on aide dès qu\'on passe.', 'Qui peut envoyer un convoi au Bastion cette nuit ?',
    'Merci pour les aides, ça accélère bien.', 'Je lance une recherche à l\'Académie, un petit coup de main si vous passez.', 'Attention, des armées ennemies rôdent près de chez moi.',
    'Bonne soirée, je me reconnecte demain matin.', 'Le Bastion avance bien, continuez les convois !', 'Quelqu\'un a du fer en trop ?', 'Belle progression cette semaine, bravo à tous.',
    'Je monte mon Ambassade pour recevoir plus d\'aides.', 'On reste groupés autour du Bastion.', 'Ma garnison est en place au Bastion.', 'Je suis de retour, j\'aide tout le monde.'
  ],
  global: ['Bonjour à tous, bon jeu !', 'Une belle journée pour bâtir.', 'Quelqu\'un vend de la pierre au marché ?', 'Bienvenue aux nouveaux joueurs.', 'Les invasions du week-end arrivent, préparez-vous.', 'Bonne chance à toutes les alliances.'],
  private: ['Salut, besoin d\'un coup de main ?', 'Merci pour ton aide hier !', 'Tu envoies un convoi au Bastion aujourd\'hui ?', 'Bien joué pour ta nouvelle construction.', 'On se coordonne pour le prochain week-end ?'],
  friends: ['Salut les amis, bonne partie !', 'On se retrouve ce soir ?', 'Courage à tous pour la semaine.', 'Qui est en ligne ?']
};
const CHAT_PER_DAY = 6;   // messages libres par jour, tous joueurs confondus (les annonces d'alliance en plus, rares)

// ---------- petites aides ----------
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const levelIn = (city, key) => (city?.buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const queuedLevel = (city, key) => (city?.buildQueue || []).reduce((m, q) => (q.buildingKey === key && (q.targetLevel || 0) > m ? q.targetLevel : m), 0);
const buildCost = (key, level) => { const base = buildingsData.find(b => b.key === key)?.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 }; const m = Math.pow(config.build.costMultiplierBase, level - 1); return Object.fromEntries(RES.map(r => [r, Math.floor((base[r] || 0) * m)])); };
const affordable = (city, c, margin = 1) => RES.every(r => (city[r] || 0) >= (c[r] || 0) * margin);
const storageOf = (city, r) => (r === 'food' ? city.maxFoodStorage : city.maxStorage) || 0;
const isManager = (role) => role === 'LEADER' || role === 'OFFICER';
const unitsTotal = (army) => (army?.units || []).reduce((t, u) => t + (u.count || 0), 0);
const atHome = (army, city) => !!army && !!city && army.status === 'IDLE' && army.x === city.x && army.y === city.y;
const garrisonOf = (bot, city) => bot.armies.find(a => a.isGarrison && a.cityId === city.id) || null;
const pickOf = (ctx, arr) => arr[Math.floor(ctx.rand() * arr.length)];

// un tour de joueur : au plus MAX_CALLS appels pour ce module
function session(bot) {
  let left = MAX_CALLS;
  const call = async (method, p, body) => {
    if (left <= 0) return { ok: false, status: -1, data: null, skipped: true };
    left--;
    try { return await bot.api(method, p, body); } catch (e) { return { ok: false, status: 0, data: { error: e.message } }; }
  };
  return { get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), del: (p, b) => call('DELETE', p, b), left: () => left };
}

// ---------- état du monde (lu une fois par pas) ----------
let worldCache = { step: -1, v: null };
async function worldOf(ctx) {
  if (worldCache.step === ctx.step && worldCache.v) return worldCache.v;
  const w = await ctx.prisma.worldConfig.findUnique({ where: { id: 1 }, select: { number: true, endedAt: true, readyAt: true, createdAt: true } }).catch(() => null);
  const start = w?.readyAt || w?.createdAt;
  const v = { number: w?.number || 1, ended: !w || !!w.endedAt, day: start ? Math.floor((ctx.clock.now() - new Date(start).getTime()) / 86400000) : 0 };
  if (worldCache.v && worldCache.v.number !== v.number) resetWorldCaches();
  worldCache = { step: ctx.step, v };
  return v;
}

// ---------- mémoire du module (par joueur, remise à zéro à chaque monde) ----------
function memOf(bot, w) {
  if (!bot.mem.al || bot.mem.al.w !== w.number) bot.mem.al = { w: w.number };
  return bot.mem.al;
}

// l'alliance du groupe : celle où sont la plupart des joueurs du groupe
const groupCache = new Map();
async function groupAlliance(ctx, g) {
  const key = `${ctx.step}:${g}`;
  if (groupCache.has(key)) return groupCache.get(key);
  const ids = ctx.byGroup(g).map(b => b.playerId).filter(Boolean);
  let out = null;
  if (ids.length) {
    const rows = await ctx.prisma.allianceMember.findMany({ where: { playerId: { in: ids } }, select: { allianceId: true, role: true } });
    const score = new Map();
    for (const r of rows) score.set(r.allianceId, (score.get(r.allianceId) || 0) + 1 + (r.role === 'LEADER' ? 0.5 : 0));
    let best = null;
    for (const [id, s] of score) if (!best || s > best.s) best = { id, s };
    if (best) {
      const a = await ctx.prisma.alliance.findUnique({ where: { id: best.id }, select: { id: true, tag: true, name: true, leaderId: true, _count: { select: { members: true } } } });
      if (a) out = { id: a.id, tag: a.tag, name: a.name, leaderId: a.leaderId, members: a._count.members };
    }
  }
  if (groupCache.size > 200) groupCache.clear();
  groupCache.set(key, out);
  return out;
}
const forgetGroups = () => groupCache.clear();

// ---------- caches en mémoire (non sauvegardés : au pire un appel de plus après une reprise) ----------
const askedHelp = new Map();     // joueur -> ids des constructions déjà demandées
let chatDay = { day: -1, n: 0 };
let bastionSeen = null;          // id du Bastion -> statut (événements)
function resetWorldCaches() { askedHelp.clear(); groupCache.clear(); bastionSeen = null; chatDay = { day: -1, n: 0 }; }

// ---------- Ambassade : la monter pour fonder (7) ou rejoindre (5) ----------
async function pushEmbassy(bot, S, target) {
  const city = bot.capital;
  if (!city) return false;
  const planned = Math.max(levelIn(city, 'EMBASSY'), queuedLevel(city, 'EMBASSY'));
  if (planned >= target) return false;
  if (planned + 1 > levelIn(city, 'MAIN_HALL')) return false;
  if ((city.buildQueue || []).length >= MAX_QUEUE) return false;
  const c = buildCost('EMBASSY', planned + 1);
  if (!affordable(city, c, 1.1)) return false;
  const r = await S.post(`/api/cities/${city.id}/build`, { buildingKey: 'EMBASSY' });
  if (!r.ok) return false;
  RES.forEach(k => { city[k] -= r.data?.cost?.[k] || 0; });
  (city.buildQueue ||= []).push({ buildingKey: 'EMBASSY', targetLevel: r.data?.queueItem?.targetLevel || planned + 1, status: r.data?.queueItem?.status, id: r.data?.queueItem?.id, endsAt: r.data?.queueItem?.endsAt });
  return true;
}

// ---------- hors alliance : fonder ou rejoindre ----------
async function joinTurn(bot, ctx, S, w, m) {
  const city = bot.capital;
  const emb = levelIn(city, 'EMBASSY');
  const ga = await groupAlliance(ctx, bot.group);
  const founders = ctx.byGroup(bot.group).slice(0, 2);
  if (!ga) {
    if (founders.includes(bot) || w.day > 30) {
      if (emb >= fx.allianceCreateLevel()) {
        const names = NAMES[bot.group] || NAMES.C;
        const i = (w.number - 1) % names.length;
        for (const [name, tag, description] of [names[i], names[(i + 1) % names.length]]) {
          const taken = await ctx.prisma.alliance.findFirst({ where: { OR: [{ name }, { tag }] }, select: { id: true } });
          if (taken) continue;
          const r = await S.post('/api/alliance/create', { name, tag, description });
          if (r.ok) {
            forgetGroups();
            bot.me.alliance = { allianceId: r.data?.alliance?.id, role: 'LEADER', alliance: r.data?.alliance };
            ctx.event('alliance_created', { group: bot.group, tag, name, by: bot.name });
          }
          break;
        }
      } else await pushEmbassy(bot, S, fx.allianceCreateLevel());
    } else await pushEmbassy(bot, S, fx.allianceJoinLevel());
    return;
  }
  if (emb < fx.allianceJoinLevel()) { await pushEmbassy(bot, S, fx.allianceJoinLevel()); return; }
  if (m.leftDay !== undefined && w.day - m.leftDay < 3) return;   // parti il y a peu : il prend son temps avant de revenir
  const invite = await ctx.prisma.allianceInvite.findFirst({ where: { playerId: bot.playerId, allianceId: ga.id }, select: { id: true } });
  if (!invite) return;   // le chef ou un officier l'invitera
  const r = await S.get('/api/alliance/invites');
  const it = r.ok && Array.isArray(r.data) ? r.data.find(x => x.allianceId === ga.id) : null;
  if (!it) return;
  const j = await S.post(`/api/alliance/${ga.id}/join`);
  if (j.ok) {
    forgetGroups();
    bot.me.alliance = { allianceId: ga.id, role: 'MEMBER', alliance: { id: ga.id, tag: ga.tag, name: ga.name } };
    if (m.leftDay !== undefined || m.kicked) ctx.event('alliance_rejoined', { who: bot.name, tag: ga.tag });
    m.leftDay = undefined; m.kicked = undefined;
  }
}

// ---------- chef et officiers : invitations, officiers, diplomatie, passation, exclusion ----------
async function manageTurn(bot, ctx, S, w, m, al) {
  const P = ctx.prisma;
  const group = ctx.byGroup(bot.group);
  let used = 0;
  // invitations : les joueurs du groupe sans alliance et pas encore invités
  const ids = group.map(b => b.playerId).filter(id => id && id !== bot.playerId);
  if (ids.length) {
    const [inAlliance, invited] = await Promise.all([
      P.allianceMember.findMany({ where: { playerId: { in: ids } }, select: { playerId: true } }),
      P.allianceInvite.findMany({ where: { allianceId: al.id, playerId: { in: ids } }, select: { playerId: true } })
    ]);
    const skip = new Set([...inAlliance, ...invited].map(r => r.playerId));
    for (const b of group) {
      if (used >= 2) break;
      if (!b.playerId || b === bot || skip.has(b.playerId)) continue;
      const r = await S.post('/api/alliance/invite', { playerName: b.name });
      used++;
      if (!r.ok) break;
    }
  }
  // une petite alliance tente un solitaire une fois par monde (il refusera)
  const solo = bot.group === 'C' && al.role === 'LEADER' && w.day >= 20 && used < 2 ? ctx.byGroup('SOLO').find(b => b.playerId) : null;
  if (solo && !memOf(solo, w).asked) {
    memOf(solo, w).asked = true;
    if (!(await P.allianceMember.findUnique({ where: { playerId: solo.playerId }, select: { id: true } }))) {
      const r = await S.post('/api/alliance/invite', { playerName: solo.name });
      used++;
      if (r.ok) ctx.event('alliance_invite_solo', { tag: al.tag, to: solo.name });
    }
  }
  if (used >= 2) return;
  const members = await P.allianceMember.findMany({ where: { allianceId: al.id }, select: { playerId: true, role: true, joinedAt: true }, orderBy: { joinedAt: 'asc' } });
  // officiers
  if (al.role === 'LEADER' && members.length >= 4) {
    const officers = members.filter(x => x.role === 'OFFICER').length;
    const cand = members.find(x => x.role === 'MEMBER');
    if (officers < (WANT_OFFICERS[bot.group] || 2) && cand) {
      const r = await S.post(`/api/alliance/promote/${cand.playerId}`);
      used++;
      if (r.ok) ctx.event('officer_promoted', { tag: al.tag, who: ctx.bots.find(b => b.playerId === cand.playerId)?.name || cand.playerId });
      if (used >= 2) return;
    }
  }
  // le chef de C passe la main à un officier une fois par monde (il reste officier)
  if (bot.group === 'C' && al.role === 'LEADER' && w.day >= 60 && bot === group[0] && !m.xfer) {
    const off = members.find(x => x.role === 'OFFICER');
    if (off) {
      const r = await S.post(`/api/alliance/promote/${off.playerId}`);
      used++;
      m.xfer = true;
      if (r.ok) { ctx.event('leader_transfer', { tag: al.tag, from: bot.name, to: ctx.bots.find(b => b.playerId === off.playerId)?.name }); bot.me.alliance.role = 'OFFICER'; return; }
    }
  }
  // le chef de B exclut son dernier venu une fois par monde, Bastion déjà placé (il sera réinvité aussitôt)
  if (bot.group === 'B' && al.role === 'LEADER' && w.day >= 75 && !m.kick && members.length >= BASTION.minMembers) {
    const hasBastion = await P.bastion.findFirst({ where: { allianceId: al.id, status: { not: 'DESTROYED' } }, select: { id: true } });
    const last = [...members].reverse().find(x => x.role === 'MEMBER');
    if (hasBastion && last) {
      const r = await S.post(`/api/alliance/kick/${last.playerId}`);
      used++;
      m.kick = true;
      if (r.ok) {
        forgetGroups();
        const who = ctx.bots.find(b => b.playerId === last.playerId);
        if (who) { memOf(who, w).kicked = true; }
        ctx.event('member_kicked', { tag: al.tag, who: who?.name });
      }
      if (used >= 2) return;
    }
  }
  // diplomatie, tous les 2 jours environ
  if ((m.dip || 0) <= ctx.step && used < 2) {
    const acted = await diplomacy(bot, ctx, S, al, 2 - used);
    m.dip = ctx.step + (acted ? 8 : 24);   // tout est en place : un coup d'œil tous les 6 jours
  }
  // la page de l'alliance, de temps en temps (comme le client)
  if ((m.view || 0) <= ctx.step && S.left() > 4) { m.view = ctx.step + 16; await S.get('/api/alliance/mine'); }
}

// renvoie true si quelque chose reste à faire (ou a été fait)
async function diplomacy(bot, ctx, S, al, budget) {
  const enemies = [], allies = [];
  let pending = false;
  for (const g of ENEMIES[bot.group] || []) { const x = await groupAlliance(ctx, g); if (x && x.id !== al.id) enemies.push(x); }
  for (const g of ALLIES[bot.group] || []) { const x = await groupAlliance(ctx, g); if (x && x.id !== al.id) allies.push(x); }
  if (!enemies.length && !allies.length) return true;   // l'autre alliance n'existe pas encore
  const r = await S.get('/api/alliance/diplomacy');
  budget--;
  if (!r.ok || !r.data?.canManage) return true;
  const rel = new Map((r.data.diplomacy || []).map(d => [d.allianceId, d]));
  for (const e of enemies) {
    if (rel.get(e.id)?.declared === 'ENEMY') continue;
    pending = true;
    if (budget <= 0) return true;
    const p = await S.post(`/api/alliance/diplomacy/${e.id}`, { status: 'ENEMY' });
    budget--;
    if (p.ok) ctx.event('diplomacy', { from: al.tag, to: e.tag, status: 'ENEMY' });
  }
  for (const a of allies) {
    const d = rel.get(a.id);
    if (d?.status === 'ALLY' || d?.declaredByThem === 'ENEMY' || d?.declared === 'ENEMY') continue;
    pending = true;
    if (budget <= 0) return true;
    const inc = (r.data.incoming || []).find(x => x.alliance?.id === a.id);
    if (inc) {
      const p = await S.post(`/api/alliance/diplomacy/requests/${inc.id}/accept`);
      budget--;
      if (p.ok) ctx.event('diplomacy', { from: al.tag, to: a.tag, status: 'ALLY' });
      continue;
    }
    if ((r.data.outgoing || []).some(x => x.alliance?.id === a.id)) continue;
    if (bot.group !== 'A') continue;   // A propose, C accepte
    const allyCount = [...rel.values()].filter(x => x.status === 'ALLY').length;
    if (allyCount >= (r.data.maxAllies || 3)) continue;
    const p = await S.post(`/api/alliance/diplomacy/${a.id}`, { status: 'ALLY' });
    budget--;
    if (p.ok && p.data?.event === 'accepted') ctx.event('diplomacy', { from: al.tag, to: a.tag, status: 'ALLY' });
  }
  // la fiche publique d'un ennemi, une fois par monde
  if (budget > 0 && enemies.length && !bot.mem.al.sheet) { bot.mem.al.sheet = true; await S.get(`/api/alliance/${enemies[0].id}`); }
  return pending;
}

// ---------- aide d'alliance ----------
async function helpTurn(bot, ctx, S) {
  const city = bot.capital;
  const now = ctx.clock.now();
  const emb = levelIn(city, 'EMBASSY');
  if (fx.allianceHelpMax(emb) > 0) {
    const asked = askedHelp.get(bot.name) || new Set();
    let fresh = false;
    for (const c of bot.cities) {
      const items = c.buildQueue || [];
      const running = items.filter(q => q.id && q.status === 'RUNNING' && new Date(q.endsAt).getTime() > now + 120000);
      if (running.some(q => !asked.has(q.id))) fresh = true;
      if (items.some(q => !q.status) && items.filter(q => q.status === 'RUNNING').length < config.build.maxRunning) fresh = true;   // lancé à l'instant
    }
    if (!fresh) {
      const research = await ctx.prisma.researchQueueItem.findMany({ where: { playerId: bot.playerId, status: 'RUNNING', endsAt: { gt: new Date(now + 120000) } }, select: { id: true } }).catch(() => []);
      fresh = research.some(r => !asked.has(r.id));
      if (fresh) research.forEach(r => asked.add(r.id));
    }
    if (fresh) {
      const r = await S.post('/api/alliance/help/request', {});
      if (r.ok) {
        for (const c of bot.cities) for (const q of c.buildQueue || []) if (q.id) asked.add(q.id);
        if (asked.size > 60) { const keep = [...asked].slice(-30); asked.clear(); keep.forEach(x => asked.add(x)); }
        askedHelp.set(bot.name, asked);
      }
    }
  }
  if ((bot.me.allianceHelpPending || 0) > 0) await S.post('/api/alliance/help/all');
}

// ---------- boutique d'alliance ----------
async function shopTurn(bot, ctx, S, m) {
  const pts = bot.me.alliancePoints || 0;
  if (pts < 80 || (m.shop || 0) > ctx.step || S.left() < 2) return;
  m.shop = ctx.step + 6 + Math.floor(ctx.rand() * 4);
  const r = await S.get('/api/alliance/shop');
  if (!r.ok || !Array.isArray(r.data?.items)) return;
  const points = r.data.points || 0;
  const items = r.data.items.filter(i => i.available && i.price <= points);
  const city = bot.capital;
  const persona = hash(bot.name) % 4;
  let choice = null;
  if (persona === 0) {   // collectionneur : plaques puis bannières
    choice = items.filter(i => (i.type === 'nameplate' || i.type === 'banner') && !i.owned).sort((a, b) => a.price - b.price)[0] || null;
    const next = r.data.items.filter(i => (i.type === 'nameplate' || i.type === 'banner') && !i.owned && i.available).sort((a, b) => a.price - b.price)[0];
    if (!choice && next && points < next.price && ctx.rand() < 0.8) choice = 'save';   // il économise pour la suivante
  } else if (persona === 1 && bot.me.hero && !bot.me.hero.diedAt && (m.heroItems || 0) < 6) {
    const gear = items.filter(i => i.type === 'hero_item');
    if (gear.length) choice = pickOf(ctx, gear);
  }
  if (!choice && city) {
    const space = (i) => RES.every(k => !(i.give?.[k]) || (city[k] || 0) + i.give[k] <= storageOf(city, k) * 0.97);
    const res = items.filter(i => i.type === 'resources' && space(i));
    const convoy = res.find(i => i.key === 'res_convoy');
    if (convoy && ctx.rand() < 0.5) choice = convoy;
    else if (res.length) {
      const ratio = (i) => { const k = RES.find(x => i.give?.[x]); return k ? (city[k] || 0) / Math.max(1, storageOf(city, k)) : 1; };
      choice = res.filter(i => i.key !== 'res_convoy').sort((a, b) => ratio(a) - ratio(b))[0] || convoy || null;
    }
  }
  if (choice && choice !== 'save') {
    const b = await S.post('/api/alliance/shop/buy', { key: choice.key, ...(choice.type === 'resources' ? { cityId: city.id } : {}) });
    if (b.ok && choice.type === 'hero_item') m.heroItems = (m.heroItems || 0) + 1;
    if (b.ok && choice.type === 'resources') RES.forEach(k => { city[k] += choice.give?.[k] || 0; });
    return;
  }
  // changer de plaque de temps en temps (cosmétiques gardés d'un monde à l'autre)
  const owned = r.data.items.filter(i => i.type === 'nameplate' && i.owned && !i.equipped);
  if (owned.length && ctx.rand() < 0.3 && S.left() > 0) await S.post('/api/alliance/shop/equip', { slot: 'nameplate', key: pickOf(ctx, owned).key });
}

// ---------- messagerie et amis ----------
async function socialTurn(bot, ctx, S, w, m, al) {
  const P = ctx.prisma;
  // demandes d'amis reçues : acceptées
  if (S.left() >= 2) {
    const pending = await P.friendship.count({ where: { addresseeId: bot.playerId, status: 'PENDING' } }).catch(() => 0);
    if (pending) {
      const r = await S.get('/api/friends');
      const inc = r.ok ? r.data?.incoming?.[0] : null;
      if (inc) await S.post(`/api/friends/requests/${inc.id}/accept`);
    }
  }
  // une demande d'ami à un membre de l'alliance, une ou deux fois par monde
  if (al && (m.fr || 0) < 2 && w.day >= 8 && ctx.rand() < 0.04 && S.left() > 0) {
    m.fr = (m.fr || 0) + 1;
    const mates = ctx.bots.filter(b => b !== bot && b.group === bot.group && b.playerId);
    const mate = mates.length ? pickOf(ctx, mates) : null;
    if (mate) {
      const known = await P.friendship.findFirst({ where: { OR: [{ requesterId: bot.playerId, addresseeId: mate.playerId }, { requesterId: mate.playerId, addresseeId: bot.playerId }] }, select: { id: true } });
      if (!known) await S.post('/api/friends/requests', { playerId: mate.playerId });
    }
  }
  // quelques messages par jour, tous joueurs confondus
  const day = ctx.clock.day();
  if (chatDay.day !== day) chatDay = { day, n: 0 };
  if (chatDay.n >= CHAT_PER_DAY || ctx.rand() > 0.045 || S.left() < 1) return;
  let channel = 'global', texts = CHAT.global;
  const roll = ctx.rand();
  if (al && roll < 0.55) { channel = 'alliance'; texts = CHAT.alliance; }
  else if (roll < 0.72) { channel = 'global'; texts = CHAT.global; }
  else if (roll < 0.87) {
    const mates = ctx.bots.filter(b => b !== bot && b.playerId && (al ? b.group === bot.group : true));
    const to = mates.length ? pickOf(ctx, mates) : null;
    if (to) { channel = `private:${to.playerId}`; texts = CHAT.private; }
  } else {
    const friends = await P.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: bot.playerId }, { addresseeId: bot.playerId }] } }).catch(() => 0);
    if (friends) { channel = 'friends'; texts = CHAT.friends; } else if (al) { channel = 'alliance'; texts = CHAT.alliance; }
  }
  // avant d'écrire dans l'alliance, on lit le fil (comme le client)
  if (channel === 'alliance' && S.left() >= 3 && ctx.rand() < 0.4) {
    const r = await S.get('/api/chat/messages?channel=alliance');
    if (r.ok) await S.post('/api/chat/read', { channel: 'alliance' });
  }
  let text = pickOf(ctx, texts);
  if (text === m.lastMsg) text = texts[(texts.indexOf(text) + 1) % texts.length];
  const r = await S.post('/api/chat/messages', { channel, text });
  if (r.ok) { chatDay.n++; m.lastMsg = text; }
}

// annonce dans le chat de l'alliance (fondation, Bastion placé…)
async function announce(bot, S, text) {
  if (S.left() < 1) return;
  await S.post('/api/chat/messages', { channel: 'alliance', text });
}

// ---------- Bastion ----------
async function findBastionSpot(ctx, allianceId) {
  const P = ctx.prisma;
  const caps = await P.city.findMany({ where: { isCapital: true, player: { alliance: { allianceId } } }, select: { x: true, y: true } });
  if (!caps.length) return null;
  // la capitale la plus centrale de l'alliance : les convois de tous marchent le moins possible
  let center = caps[0], best = Infinity;
  for (const c of caps) { const d = caps.reduce((t, o) => t + Math.hypot(o.x - c.x, o.y - c.y), 0); if (d < best) { best = d; center = c; } }
  const others = await P.bastion.findMany({ where: { NOT: { allianceId } }, select: { x: true, y: true } });
  let tried = 0;
  for (let r = 5; r <= 16; r += 2) {
    const n = 8 + r;
    const off = Math.floor(ctx.rand() * n);
    for (let k = 0; k < n; k++) {
      const a = ((k + off) / n) * Math.PI * 2;
      const x = Math.round(center.x + r * Math.cos(a)), y = Math.round(center.y + r * Math.sin(a));
      if (x < config.map.minCoord + 2 || y < config.map.minCoord + 2 || x > config.map.maxCoord - 3 || y > config.map.maxCoord - 3) continue;
      if (others.some(o => Math.abs(o.x - x) <= 2 && Math.abs(o.y - y) <= 2)) continue;
      if (++tried > 80) return null;
      if (await spawn().footprintFree(x, y)) return { x, y };
    }
  }
  return null;
}

// unités de base que la capitale peut former, la meilleure pour `score`
function bestRecruit(city, faction, score) {
  const ok = unitsData.filter(u => u.faction === faction && u.tier === 'base' && RECRUIT_BUILDING[u.class] && levelIn(city, RECRUIT_BUILDING[u.class]) > 0);
  return ok.sort((a, b) => score(b) - score(a))[0] || null;
}
async function recruit(bot, S, city, unit, want) {
  if (!unit || want < 10 || city.isSieged) return false;
  const building = RECRUIT_BUILDING[unit.class];
  if ((city.recruitQueue || []).filter(q => q.buildingKey === building).length >= 3) return false;
  const per = config.recruit.baseCosts[unit.class] || config.recruit.baseCosts.INFANTRY;
  const mult = config.recruit.tierCostMultipliers?.base || 1;
  // jamais plus que ce qui dépasse un tiers du stockage : la construction continue
  const can = Math.min(...RES.map(r => Math.floor(Math.max(0, (city[r] || 0) - storageOf(city, r) / 3) / Math.max(1, Math.ceil(per[r] * mult)))));
  const count = Math.min(want, 80, can);
  if (count < 10) return false;
  const r = await S.post(`/api/cities/${city.id}/recruit`, { unitKey: unit.key, count });
  if (!r.ok) return false;
  RES.forEach(k => { city[k] -= r.data?.cost?.[k] || 0; });
  (city.recruitQueue ||= []).push({ buildingKey: building, unitKey: unit.key, count });
  return true;
}

// emplacement libre de la Place de rassemblement (le plus haut : les premiers restent aux armées de campagne)
function freeSlot(bot, city) {
  const max = fx.maxArmies(city.buildings || []);
  const used = new Set(bot.armies.filter(a => !a.isGarrison && a.cityId === city.id).map(a => a.slot));
  for (let s = max; s >= 1; s--) if (!used.has(s)) return s;
  return null;
}

// l'armée du module dans la capitale (créée au besoin sur un emplacement libre)
async function moduleArmy(bot, S, m, city) {
  let army = bot.armies.find(a => a.id === m.cv) || bot.armies.find(a => !a.isGarrison && a.name === CONVOY_NAME && a.cityId === city.id);
  if (army) { m.cv = army.id; return army; }
  if (S.left() < 2) return null;
  const slot = freeSlot(bot, city);
  if (!slot) return null;
  const r = await S.post('/api/army/create', { cityId: city.id, slot, name: CONVOY_NAME });
  if (!r.ok || !r.data?.army) return null;
  army = { ...r.data.army, units: [] };
  bot.armies.push(army);
  m.cv = army.id;
  return army;
}

// fait passer des unités de la garnison dans l'armée (2 types au plus) ; keepPct : part laissée à la ville ;
// want(u) : combien en prendre de ce type, moved(n, u) : ce qui est passé
async function fillArmy(bot, S, army, city, { order, want, moved, keepPct }) {
  const gar = garrisonOf(bot, city);
  if (!gar || !atHome(army, city)) return 0;
  let total = 0, calls = 0;
  const pool = (gar.units || []).filter(u => u.count > 0 && U.get(u.unitKey) && U.get(u.unitKey).class !== 'SIEGE').sort((a, b) => order(b) - order(a));
  for (const u of pool) {
    if (calls >= 2 || S.left() < 2) break;
    const take = Math.min(Math.floor(u.count * (1 - keepPct)), Math.max(0, Math.ceil(want(u))));
    if (take <= 0) continue;
    const cur = (army.units || []).find(x => x.unitKey === u.unitKey)?.count || 0;
    const r = await S.post(`/api/army/${army.id}/set-unit`, { unitKey: u.unitKey, count: cur + take });
    calls++;
    if (!r.ok) break;
    const got = Math.max(0, (r.data?.newCount ?? cur + take) - cur);
    u.count -= got;
    const row = (army.units ||= []).find(x => x.unitKey === u.unitKey);
    if (row) row.count += got; else army.units.push({ unitKey: u.unitKey, count: got });
    total += got;
    moved(got, u);
  }
  return total;
}

function carryCapacity(army, city, faction, bastionActive) {
  const base = (army.units || []).reduce((t, u) => t + (u.count || 0) * carryOfUnit(u.unitKey), 0);
  const mult = (1 + getFactionBonus(faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(city.buildings || []) / 100) * (bastionActive ? 1 + BASTION.bonuses.carryPct / 100 : 1);
  return Math.floor(base * mult * 0.98);
}

async function supplyTurn(bot, ctx, S, m, city, bastion) {
  if (city.isSieged) return;
  const faction = bot.me.faction || bot.faction;
  const TARGET = 12000;   // charge visée par convoi
  let army = await moduleArmy(bot, S, m, city);
  let borrowed = false;
  if (!army && !freeSlot(bot, city)) {
    // toutes les places sont prises par les armées de campagne : l'une d'elles, au repos en ville, porte le convoi
    army = bot.armies.filter(a => !a.isGarrison && a.cityId === city.id && atHome(a, city) && unitsTotal(a) > 0)
      .sort((a, b) => carryCapacity(b, city, faction, false) - carryCapacity(a, city, faction, false))[0] || null;
    borrowed = !!army;
  }
  if (!army) return;
  if (!atHome(army, city)) return;   // en route : on attend son retour
  // des porteurs : d'abord la garnison, sinon un lot de recrues
  let cap = carryCapacity(army, city, faction, false);
  if (borrowed && cap < 3000) return;
  if (cap < TARGET && !borrowed) {
    let missing = TARGET - cap;
    await fillArmy(bot, S, army, city, { order: (u) => carryOfUnit(u.unitKey) * 1000 + u.count, want: (u) => missing / carryOfUnit(u.unitKey), moved: (n, u) => { missing -= n * carryOfUnit(u.unitKey); }, keepPct: 0.25 });
    cap = carryCapacity(army, city, faction, false);
    if (cap < TARGET * 0.6) {
      const unit = bestRecruit(city, faction, (u) => (u.stats?.transport || 0) * 10 - (config.recruit.baseCosts[u.class]?.iron || 0) / 10);
      const queued = (city.recruitQueue || []).filter(q => q.unitKey === unit?.key).reduce((t, q) => t + (q.count || 0), 0);
      const garCount = (garrisonOf(bot, city)?.units || []).filter(u => u.unitKey === unit?.key).reduce((t, u) => t + u.count, 0);
      if (unit && S.left() > 1) await recruit(bot, S, city, unit, Math.ceil((TARGET - cap) / carryOfUnit(unit.key)) - queued - garCount);
    }
    if (cap < 1500) return;
  }
  if (S.left() < 2) return;
  const g = await S.get('/api/bastion');
  const b = g.ok ? g.data?.bastion : null;
  if (!b || b.id !== bastion.id || b.status !== 'FUNDING') return;
  // ce qui manque encore (un convoi en trop rapporte son surplus), et ce que la ville peut donner sans s'arrêter de bâtir
  const need = Object.fromEntries(RES.map(r => [r, Math.max(0, (b.cost?.[r] || 0) - (b.delivered?.[r] || 0))]));
  const totalNeed = RES.reduce((t, r) => t + need[r], 0);
  if (totalNeed <= 0) return;
  // la réserve gardée pour bâtir ; quand il ne manque presque plus rien, chacun se serre la ceinture pour finir
  const hungry = (city.foodBalance?.net ?? city.foodBalance?.balance ?? 1) < 0;
  const last = totalNeed < 0.1 * RES.reduce((t, r) => t + (b.cost?.[r] || 0), 0);
  const keep = (r) => (r === 'food' ? (hungry ? 0.5 : last ? 0.2 : 0.4) : last ? 0.15 : 0.3);
  const spare = Object.fromEntries(RES.map(r => [r, Math.max(0, Math.floor((city[r] || 0) - storageOf(city, r) * keep(r)))]));
  const load = Object.fromEntries(RES.map(r => [r, 0]));
  let room = cap;
  for (let pass = 0; pass < 3 && room > 0; pass++) {
    const open = RES.filter(r => load[r] < Math.min(spare[r], need[r]));
    const w = open.reduce((t, r) => t + need[r], 0);
    if (!w) break;
    let added = 0;
    for (const r of open) {
      const add = Math.min(Math.floor(room * need[r] / w), Math.min(spare[r], need[r]) - load[r]);
      if (add > 0) { load[r] += add; added += add; }
    }
    room -= added;
    if (!added) break;
  }
  const total = RES.reduce((t, r) => t + load[r], 0);
  if (total < (last ? 500 : 1000)) return;
  const s = await S.post(`/api/bastion/${b.id}/send`, { armyId: army.id, mission: 'SUPPLY', resources: load });
  if (s.ok) { RES.forEach(r => { city[r] -= load[r]; }); army.status = 'TRANSPORTING'; if (borrowed) m.borrowed = (m.borrowed || 0) + 1; }
}

// garnison au Bastion : son armée (le convoi devenu inutile), complétée par des unités de la ville
async function garrisonTurn(bot, ctx, S, w, m, city, target, own) {
  if (city.isSieged || target.isSieged) return;
  const faction = bot.me.faction || bot.faction;
  const there = bot.armies.find(a => a.targetBastionId === target.id && ['STATIONED', 'SUPPORTING'].includes(a.status));
  if (there) {
    // relève : rappelée de temps en temps, elle repartira au tour suivant
    if (there.status === 'STATIONED' && m.gs !== undefined && w.day - m.gs > 30 && ctx.rand() < 0.1) {
      const r = await S.post(`/api/army/${there.id}/return`);
      if (r.ok) { m.gs = undefined; m.relief = (m.relief || 0) + 1; }
    }
    return;
  }
  const army = await moduleArmy(bot, S, m, city);
  if (!army || !atHome(army, city)) return;
  // compléter avec une partie des défenseurs de la ville (la moitié au plus de chaque type)
  if (unitsTotal(army) < 80) {
    let missing = 80 - unitsTotal(army);
    await fillArmy(bot, S, army, city, { order: (u) => defOfUnit(u.unitKey) * 1000 + u.count, want: () => missing, moved: (n) => { missing -= n; }, keepPct: 0.5 });
  }
  if (unitsTotal(army) < 30) {
    const unit = bestRecruit(city, faction, (u) => (u.stats?.defense || 0));
    const queued = (city.recruitQueue || []).filter(q => q.unitKey === unit?.key).reduce((t, q) => t + (q.count || 0), 0);
    if (unit && queued < 40 && S.left() > 1) await recruit(bot, S, city, unit, 60 - queued);
    return;
  }
  if (S.left() < 1) return;
  if (own) {
    if (S.left() < 2) return;
    const g = await S.get('/api/bastion');
    const b = g.ok ? g.data?.bastion : null;
    if (!b || b.id !== target.id || b.status === 'FUNDING' || b.status === 'DESTROYED' || b.isSieged) return;
  }
  const r = await S.post(`/api/bastion/${target.id}/send`, { armyId: army.id, mission: 'GARRISON' });
  if (r.ok) { army.status = 'SUPPORTING'; m.gs = w.day; m.garrisons = (m.garrisons || 0) + 1; }
}

async function bastionTurn(bot, ctx, S, w, m, al) {
  const P = ctx.prisma;
  const city = bot.capital;
  if (!city || S.left() < 1) return;
  const members = await P.allianceMember.count({ where: { allianceId: al.id } });
  const b = await P.bastion.findUnique({ where: { allianceId: al.id }, select: { id: true, status: true, isSieged: true, cooldownUntil: true, x: true, y: true } });
  const now = ctx.clock.now();
  // placement (chef ou officier) : 15 membres, pas de Bastion debout, délai après une chute passé
  if (isManager(al.role) && members >= BASTION.minMembers && (!b || (b.status === 'DESTROYED' && (!b.cooldownUntil || new Date(b.cooldownUntil).getTime() <= now))) && (m.placeTry || 0) <= ctx.step && S.left() >= 3) {
    m.placeTry = ctx.step + 4;
    const g = await S.get('/api/bastion');
    if (!g.ok || !g.data?.canPlace || g.data.members < g.data.minMembers || (g.data.bastion && g.data.bastion.status !== 'DESTROYED')) return;
    const spot = await findBastionSpot(ctx, al.id);
    if (!spot) return;
    const r = await S.post('/api/bastion/place', spot);
    if (r.ok) {
      ctx.event('bastion_placed', { tag: al.tag, by: bot.name, x: spot.x, y: spot.y, members, again: !!b });
      await announce(bot, S, `Le Bastion est placé en (${spot.x}, ${spot.y}) : envoyez vos convois !`);
    }
    return;
  }
  // on prépare des porteurs un peu avant le placement
  if (!b || b.status === 'DESTROYED') {
    if (members >= BASTION.minMembers - 2 && (m.prep || 0) <= ctx.step) {
      m.prep = ctx.step + 4;
      const faction = bot.me.faction || bot.faction;
      const unit = bestRecruit(city, faction, (u) => (u.stats?.transport || 0));
      const have = (garrisonOf(bot, city)?.units || []).reduce((t, u) => t + u.count, 0) + (city.recruitQueue || []).reduce((t, q) => t + (q.count || 0), 0);
      if (unit && have < 120 && S.left() > 1) await recruit(bot, S, city, unit, 120 - have);
    }
    return;
  }
  if (b.status === 'FUNDING') { await supplyTurn(bot, ctx, S, m, city, b); return; }
  // Bastion bâti ou en chantier : deux membres sur trois y postent une armée, les autres libèrent leur convoi
  const garrisoner = hash(bot.name) % 3 !== 0;
  if (garrisoner) { await garrisonTurn(bot, ctx, S, w, m, city, b, true); return; }
  const army = bot.armies.find(a => a.id === m.cv);
  if (army && atHome(army, city) && S.left() > 0) {
    const r = await S.del(`/api/army/${army.id}/disband`);
    if (r.ok) m.cv = undefined;
  }
}

// un ou deux membres de C tiennent garnison au Bastion de leurs alliés de A
async function allyGarrisonTurn(bot, ctx, S, w, m, al) {
  if (bot.group !== 'C' || hash(bot.name) % 3 !== 1 || !bot.capital) return;
  const A = await groupAlliance(ctx, 'A');
  if (!A) return;
  const rows = await ctx.prisma.allianceDiplomacy.findMany({ where: { OR: [{ allianceId: al.id, targetAllianceId: A.id }, { allianceId: A.id, targetAllianceId: al.id }] }, select: { status: true } });
  if (rows.length < 2 || !rows.every(r => r.status === 'ALLY')) return;
  const b = await ctx.prisma.bastion.findUnique({ where: { allianceId: A.id }, select: { id: true, status: true, isSieged: true } });
  if (!b || !['BUILDING', 'ACTIVE'].includes(b.status)) return;
  await garrisonTurn(bot, ctx, S, w, m, bot.capital, b, false);
}

// ---------- solitaires ----------
async function soloTurn(bot, ctx, S, w, m) {
  const inv = await ctx.prisma.allianceInvite.findFirst({ where: { playerId: bot.playerId }, select: { id: true } });
  if (inv && !bot.me.alliance) {
    const r = await S.get('/api/alliance/invites');
    const it = r.ok && Array.isArray(r.data) ? r.data[0] : null;
    if (it) { const d = await S.post(`/api/alliance/invites/${it.id}/decline`); if (d.ok) ctx.event('invite_declined', { who: bot.name, tag: it.alliance?.tag }); }
  }
  await socialTurn(bot, ctx, S, w, m, null);
}

// Avant l'économie (fichier 05-alliance-embassy.cjs) : un joueur qui veut rejoindre son alliance monte d'abord son
// Ambassade (5 pour rejoindre, 7 pour le fondateur), sinon l'économie remplit la file avant lui à chaque connexion
async function embassyFirst(bot, ctx) {
  if (!bot.me || !bot.capital || bot.me.alliance || !NAMES[bot.group]) return;
  const w = await worldOf(ctx);
  if (w.ended) return;
  const ga = await groupAlliance(ctx, bot.group);
  const founder = !ga && (ctx.byGroup(bot.group).slice(0, 2).includes(bot) || w.day > 30);
  const target = founder ? fx.allianceCreateLevel() : fx.allianceJoinLevel();
  if (levelIn(bot.capital, 'EMBASSY') >= target) return;
  const S = session(bot);
  await pushEmbassy(bot, S, target);
}

module.exports = {
  name: 'alliance',
  embassyFirst,
  async act(bot, ctx) {
    if (!bot.me || !bot.cities?.length || !bot.capital) return;
    const w = await worldOf(ctx);
    if (w.ended) return;
    const m = memOf(bot, w);
    const S = session(bot);
    if (bot.group === 'SOLO' || !NAMES[bot.group]) { await soloTurn(bot, ctx, S, w, m); return; }
    const mine = bot.me.alliance;
    if (!mine) { await joinTurn(bot, ctx, S, w, m); return; }
    const al = { id: mine.allianceId, role: mine.role, tag: mine.alliance?.tag || '?' };
    // un membre de C s'en va une fois par monde (il reviendra sur invitation quelques jours plus tard)
    if (bot.group === 'C' && al.role !== 'LEADER' && bot === ctx.byGroup('C')[2] && w.day >= 45 && !m.left) {
      m.left = true;
      const r = await S.post('/api/alliance/leave');
      if (r.ok) { forgetGroups(); m.leftDay = w.day; bot.me.alliance = null; ctx.event('member_left', { who: bot.name, tag: al.tag }); return; }
    }
    if (isManager(al.role)) await manageTurn(bot, ctx, S, w, m, al);
    await helpTurn(bot, ctx, S);
    await bastionTurn(bot, ctx, S, w, m, al);
    await allyGarrisonTurn(bot, ctx, S, w, m, al);
    await shopTurn(bot, ctx, S, m);
    await socialTurn(bot, ctx, S, w, m, al);
  },
  async afterStep(ctx) {
    const w = await worldOf(ctx);
    // événements du Bastion (chantier financé, achevé, rasé)
    const rows = await ctx.prisma.bastion.findMany({ select: { id: true, status: true, wood: true, stone: true, iron: true, food: true, alliance: { select: { tag: true } } } });
    if (!bastionSeen) bastionSeen = new Map(rows.map(r => [r.id, r.status]));
    for (const r of rows) {
      const before = bastionSeen.get(r.id);
      if (before && before !== r.status) {
        const kind = { BUILDING: 'bastion_funded', ACTIVE: 'bastion_built', DESTROYED: 'bastion_destroyed' }[r.status];
        if (kind) ctx.event(kind, { tag: r.alliance?.tag });
      }
      bastionSeen.set(r.id, r.status);
    }
    // point d'étape tous les 7 jours
    const day = ctx.clock.day();
    if (day % 7 === 0 && ctx.step % Math.round(24 / ctx.OPT.stepHours) === 0) {
      const al = await ctx.prisma.alliance.findMany({ select: { tag: true, _count: { select: { members: true } } } });
      const helps = await ctx.prisma.allianceHelp.count().catch(() => 0);
      const chat = await ctx.prisma.chatMessage.count().catch(() => 0);
      const bs = rows.map(r => `${r.alliance?.tag}:${r.status}(${Math.round((r.wood + r.stone + r.iron + r.food) / 1000)}k)`).join(' ');
      ctx.say(`alliance : monde ${w.number} j${w.day} · ${al.map(a => `${a.tag} ${a._count.members}`).join(', ') || 'aucune alliance'} · aides ${helps} · messages ${chat} · Bastions ${bs || 'aucun'}`);
    }
  }
};
