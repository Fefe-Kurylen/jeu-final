#!/usr/bin/env node
// Équipe du jeu (décision du 29 octobre 2026) : nomme le premier administrateur, ou change un rôle en ligne de commande.
//   node tools/admin.cjs <e-mail ou pseudo> ADMIN|MODERATOR|PLAYER
//   node tools/admin.cjs --list            membres de l'équipe
// Ensuite, l'écran d'administration (Paramètres › Administration) gère l'équipe, les sanctions et le monde.
process.chdir(require('path').join(__dirname, '..'));
const prisma = require('../src/config/database');
const { ROLES, writeLog } = require('../src/services/adminService');

(async () => {
  const [who, roleArg] = process.argv.slice(2);
  if (!who || who === '--help') { console.log('Usage : node tools/admin.cjs <e-mail ou pseudo> ADMIN|MODERATOR|PLAYER   ·   node tools/admin.cjs --list'); return 0; }
  if (who === '--list') {
    const team = await prisma.account.findMany({ where: { role: { in: ['MODERATOR', 'ADMIN'] } }, select: { email: true, role: true, player: { select: { name: true } } } });
    if (!team.length) console.log('Aucun membre de l\'équipe.');
    for (const t of team) console.log(`${t.role.padEnd(9)} ${t.player?.name || '?'} <${t.email}>`);
    return 0;
  }
  const role = String(roleArg || '').toUpperCase();
  if (!ROLES.includes(role)) { console.error(`Rôle inconnu : ${roleArg} (ADMIN, MODERATOR ou PLAYER)`); return 1; }
  const account = who.includes('@')
    ? await prisma.account.findUnique({ where: { email: who.toLowerCase() }, include: { player: true } })
    : (await prisma.player.findUnique({ where: { name: who }, include: { account: { include: { player: true } } } }))?.account;
  if (!account) { console.error(`Compte introuvable : ${who}`); return 1; }
  if (account.bannedAt) { console.error('Ce compte est banni.'); return 1; }
  await prisma.account.update({ where: { id: account.id }, data: { role } });
  await writeLog(prisma, { accountId: null, name: 'ligne de commande' }, 'ROLE', { accountId: account.id, name: account.player?.name || account.email }, { from: account.role, to: role });
  console.log(`${account.player?.name || account.email} : ${account.role} → ${role}`);
  return 0;
})().then(code => prisma.$disconnect().then(() => process.exit(code)), e => { console.error(e.message); process.exit(1); });
