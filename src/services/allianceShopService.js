// ============================================================
// Boutique d'alliance (décision du 26 octobre 2026) : les points d'alliance gagnés en aidant ses alliés s'y dépensent.
// Catalogue : data/alliance-shop.json — ressources (livrées dans une de ses villes, dans la limite de l'entrepôt),
// objets de héros communs (dans le sac du héros), cosmétiques gardés pour toujours : plaques de nom (dessinées par le jeu)
// et bannières (en vente une fois leur image livrée).
// ============================================================
const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const { itemsData } = require('../config/gamedata');
const { lockCity } = require('../utils/db');

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/alliance-shop.json'), 'utf-8')).items;
const FRONT = path.join(__dirname, '../../frontend');
const RES = ['wood', 'stone', 'iron', 'food'];
const RES_NAMES = { wood: 'bois', stone: 'pierre', iron: 'fer', food: 'nourriture' };

const itemDef = (key) => itemsData.find(i => i.key === key) || null;

// Une bannière n'est en vente qu'une fois son image livrée (vérifié au plus une fois par minute)
let imageCache = { at: 0, ok: new Map() };
function imageReady(rel) {
  if (!rel) return true;
  if (Date.now() - imageCache.at > 60000) imageCache = { at: Date.now(), ok: new Map() };
  if (!imageCache.ok.has(rel)) imageCache.ok.set(rel, fs.existsSync(path.join(FRONT, rel)));
  return imageCache.ok.get(rel);
}

function describe(entry) {
  if (entry.type === 'hero_item') {
    const it = itemDef(entry.item);
    const stats = Object.entries(it?.stats || {}).map(([k, v]) => `+${v} ${{ attack: 'attaque', defense: 'défense', speed: 'vitesse', logistics: 'logistique' }[k] || k}`).join(', ');
    return { name: it?.name || entry.item, description: `Objet de héros (${it?.slot || '?'}) : ${stats}`, slot: it?.slot, itemKey: entry.item };
  }
  if (entry.type === 'resources') return { name: entry.name, description: RES.filter(r => entry.give[r]).map(r => `${entry.give[r]} ${RES_NAMES[r]}`).join(', ') + ', livrés dans la ville choisie' };
  return { name: entry.name, description: entry.description || '' };
}

// Le catalogue vu par un joueur
async function shopFor(playerId) {
  const p = await prisma.player.findUnique({ where: { id: playerId }, select: { alliancePoints: true, shopCosmetics: true, nameplate: true, banner: true } });
  const owned = new Set(Array.isArray(p?.shopCosmetics) ? p.shopCosmetics : []);
  const items = catalog.filter(e => e.type !== 'hero_item' || itemDef(e.item)).map(e => ({
    key: e.key, type: e.type, price: e.price, style: e.style || null, image: e.image || null, give: e.give || null,
    ...describe(e),
    available: imageReady(e.image),
    owned: (e.type === 'nameplate' || e.type === 'banner') ? owned.has(e.key) : false,
    equipped: (e.type === 'nameplate' && p?.nameplate === e.style) || (e.type === 'banner' && p?.banner === e.key)
  }));
  return { points: p?.alliancePoints || 0, nameplate: p?.nameplate || null, banner: p?.banner || null, items };
}

// Achat : points retirés et objet remis dans la même transaction
async function buy(playerId, key, { cityId } = {}) {
  const entry = catalog.find(e => e.key === key);
  if (!entry) throw httpError(404, 'Article inconnu');
  if (!imageReady(entry.image)) throw httpError(400, 'Bientôt disponible');
  return prisma.$transaction(async (tx) => {
    // achats du joueur l'un après l'autre : « Déjà acheté » et la liste des cosmétiques lus à jour (pas d'achat perdu)
    await tx.$queryRaw`SELECT id FROM "Player" WHERE id = ${playerId} FOR NO KEY UPDATE`;
    const me = await tx.player.findUnique({ where: { id: playerId }, select: { alliancePoints: true, shopCosmetics: true } });
    const owned = Array.isArray(me?.shopCosmetics) ? me.shopCosmetics : [];
    if ((entry.type === 'nameplate' || entry.type === 'banner') && owned.includes(entry.key)) throw httpError(400, 'Déjà acheté');
    const paid = await tx.player.updateMany({ where: { id: playerId, alliancePoints: { gte: entry.price } }, data: { alliancePoints: { decrement: entry.price } } });
    if (paid.count !== 1) throw httpError(400, `Points d'alliance insuffisants (${entry.price} nécessaires, vous en avez ${me?.alliancePoints || 0})`);

    let message;
    if (entry.type === 'resources') {
      const city = cityId ? await tx.city.findFirst({ where: { id: cityId, playerId }, select: { id: true, name: true } }) : null;
      if (!city) throw httpError(400, 'Choisissez une de vos villes');
      await lockCity(tx, city.id);
      const c = await tx.city.findUnique({ where: { id: city.id }, select: { wood: true, stone: true, iron: true, food: true, maxStorage: true, maxFoodStorage: true } });
      const full = RES.filter(r => entry.give[r] && c[r] + entry.give[r] > (r === 'food' ? c.maxFoodStorage : c.maxStorage));
      if (full.length) throw httpError(400, `Pas assez de place dans ${city.name} pour : ${full.map(r => RES_NAMES[r]).join(', ')} (agrandissez l'entrepôt ou dépensez d'abord)`);
      await tx.city.update({ where: { id: city.id }, data: Object.fromEntries(RES.filter(r => entry.give[r]).map(r => [r, { increment: entry.give[r] }])) });
      message = `${entry.name} livré à ${city.name}`;
    } else if (entry.type === 'hero_item') {
      const hero = await tx.hero.findUnique({ where: { playerId }, select: { id: true } });
      if (!hero) throw httpError(400, 'Il vous faut un héros pour recevoir cet objet');
      const it = itemDef(entry.item);
      await tx.heroItem.create({ data: { heroId: hero.id, itemKey: it.key, slot: 'inventory', stats: it.stats } });
      message = `${it.name} rangé dans le sac de votre héros`;
    } else {
      await tx.player.update({ where: { id: playerId }, data: { shopCosmetics: [...owned, entry.key], ...(entry.type === 'nameplate' ? { nameplate: entry.style } : { banner: entry.key }) } });
      message = `${entry.name} achetée et mise en place`;
    }
    const left = (await tx.player.findUnique({ where: { id: playerId }, select: { alliancePoints: true } })).alliancePoints;
    return { message, points: left };
  });
}

// Choisit (ou retire, key = null) la plaque de nom ou la bannière affichée
async function equip(playerId, slot, key) {
  if (slot !== 'nameplate' && slot !== 'banner') throw httpError(400, 'Emplacement inconnu');
  if (key === null || key === undefined || key === '') {
    await prisma.player.update({ where: { id: playerId }, data: { [slot]: null } });
    return { message: slot === 'nameplate' ? 'Plaque d\'origine remise' : 'Bannière retirée' };
  }
  const entry = catalog.find(e => e.key === key && e.type === slot);
  if (!entry) throw httpError(404, 'Article inconnu');
  const me = await prisma.player.findUnique({ where: { id: playerId }, select: { shopCosmetics: true } });
  if (!(Array.isArray(me?.shopCosmetics) && me.shopCosmetics.includes(key))) throw httpError(400, 'Achetez-le d\'abord à la boutique d\'alliance');
  await prisma.player.update({ where: { id: playerId }, data: { [slot]: slot === 'nameplate' ? entry.style : entry.key } });
  return { message: `${entry.name} mise en place` };
}

// Image d'une bannière pour la carte (null si inconnue ou pas encore livrée)
const bannerImage = (key) => { const e = catalog.find(x => x.key === key && x.type === 'banner'); return e && imageReady(e.image) ? e.image : null; };

module.exports = { catalog, shopFor, buy, equip, bannerImage };
