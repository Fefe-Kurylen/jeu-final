import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

const ITEM_SLOTS = ['WEAPON', 'ARMOR', 'BOOTS', 'MOUNT', 'ACCESSORY'] as const;
const ITEM_RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;

const RARITY_COLORS: Record<string, string> = {
  COMMON: '#9d9d9d',
  RARE: '#0070dd',
  EPIC: '#a335ee',
  LEGENDARY: '#ff8000',
};

const ITEM_TEMPLATES: Record<string, Array<{ name: string; rarity: string; stats: Record<string, number> }>> = {
  WEAPON: [
    { name: 'Épée rouillée', rarity: 'COMMON', stats: { attack: 5 } },
    { name: 'Épée de fer', rarity: 'COMMON', stats: { attack: 8 } },
    { name: 'Lame du guerrier', rarity: 'RARE', stats: { attack: 15 } },
    { name: 'Épée du champion', rarity: 'RARE', stats: { attack: 20 } },
    { name: 'Lame ancienne', rarity: 'EPIC', stats: { attack: 35 } },
    { name: 'Excalibur', rarity: 'LEGENDARY', stats: { attack: 50, defense: 10 } },
  ],
  ARMOR: [
    { name: 'Armure de cuir', rarity: 'COMMON', stats: { defense: 5 } },
    { name: 'Cotte de mailles', rarity: 'COMMON', stats: { defense: 8 } },
    { name: 'Plastron de fer', rarity: 'RARE', stats: { defense: 15 } },
    { name: 'Armure du centurion', rarity: 'RARE', stats: { defense: 20 } },
    { name: 'Armure du dragon', rarity: 'EPIC', stats: { defense: 35, attack: 5 } },
    { name: 'Aegis divine', rarity: 'LEGENDARY', stats: { defense: 50, logistics: 10 } },
  ],
  BOOTS: [
    { name: 'Sandales usées', rarity: 'COMMON', stats: { speed: 3 } },
    { name: 'Bottes de marche', rarity: 'COMMON', stats: { speed: 5 } },
    { name: 'Bottes du voyageur', rarity: 'RARE', stats: { speed: 10 } },
    { name: 'Bottes ailées', rarity: 'EPIC', stats: { speed: 20 } },
    { name: 'Bottes d\'Hermès', rarity: 'LEGENDARY', stats: { speed: 35, attack: 5 } },
  ],
  MOUNT: [
    { name: 'Âne fidèle', rarity: 'COMMON', stats: { speed: 5, logistics: 3 } },
    { name: 'Cheval de guerre', rarity: 'RARE', stats: { speed: 15, attack: 5 } },
    { name: 'Destrier noir', rarity: 'EPIC', stats: { speed: 25, attack: 10 } },
    { name: 'Pégase', rarity: 'LEGENDARY', stats: { speed: 40, attack: 15, defense: 10 } },
  ],
  ACCESSORY: [
    { name: 'Amulette simple', rarity: 'COMMON', stats: { logistics: 5 } },
    { name: 'Anneau de bronze', rarity: 'COMMON', stats: { attack: 3, defense: 3 } },
    { name: 'Pendentif du stratège', rarity: 'RARE', stats: { logistics: 15 } },
    { name: 'Anneau du commandant', rarity: 'EPIC', stats: { attack: 10, defense: 10, logistics: 10 } },
    { name: 'Couronne du roi', rarity: 'LEGENDARY', stats: { attack: 20, defense: 20, logistics: 20, speed: 10 } },
  ],
};

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getInventory(@CurrentPlayer() player: any, @Query('slot') slot?: string) {
    const items = await this.prisma.playerItem.findMany({
      where: { playerId: player.playerId },
      include: { item: true },
      orderBy: [{ equipped: 'desc' }, { acquiredAt: 'desc' }],
    });

    let filtered = items;
    if (slot) filtered = filtered.filter(i => i.item.slot === slot.toUpperCase());

    return {
      items: filtered.map(pi => ({
        id: pi.id,
        name: pi.item.name,
        slot: pi.item.slot,
        rarity: pi.item.rarity,
        color: RARITY_COLORS[pi.item.rarity],
        stats: pi.item.stats,
        equipped: pi.equipped,
      })),
      total: filtered.length,
    };
  }

  @Get('hero')
  async getHeroEquipment(@CurrentPlayer() player: any) {
    const hero = await this.prisma.hero.findFirst({ where: { ownerId: player.playerId } });
    if (!hero) throw new NotFoundException('Hero not found');

    const equipped = await this.prisma.playerItem.findMany({
      where: { playerId: player.playerId, equipped: true },
      include: { item: true },
    });

    const equipment: Record<string, any> = {};
    for (const slot of ITEM_SLOTS) {
      const item = equipped.find(e => e.item.slot === slot);
      equipment[slot] = item ? { id: item.id, name: item.item.name, rarity: item.item.rarity, stats: item.item.stats } : null;
    }

    const bonus = { attack: 0, defense: 0, speed: 0, logistics: 0 };
    for (const item of equipped) {
      const stats = item.item.stats as Record<string, number>;
      if (stats.attack) bonus.attack += stats.attack;
      if (stats.defense) bonus.defense += stats.defense;
      if (stats.speed) bonus.speed += stats.speed;
      if (stats.logistics) bonus.logistics += stats.logistics;
    }

    return {
      hero: { 
        id: hero.id, 
        name: (hero as any).name || 'Héros',
        level: hero.level, 
        xp: hero.xp, 
        baseStats: { 
          attack: (hero as any).attack || 10, 
          defense: (hero as any).defense || 10, 
          speed: (hero as any).speed || 10, 
          logistics: (hero as any).logistics || 10 
        },
        points: {
          attack: hero.atkPoints,
          defense: hero.defPoints,
          speed: hero.spdPoints,
          logistics: hero.logPoints
        }
      },
      equipment,
      bonus,
      effectiveStats: { 
        attack: ((hero as any).attack || 10) + hero.atkPoints + bonus.attack, 
        defense: ((hero as any).defense || 10) + hero.defPoints + bonus.defense, 
        speed: ((hero as any).speed || 10) + hero.spdPoints + bonus.speed, 
        logistics: ((hero as any).logistics || 10) + hero.logPoints + bonus.logistics 
      },
    };
  }

  @Post('equip/:itemId')
  async equipItem(@CurrentPlayer() player: any, @Param('itemId') playerItemId: string) {
    const playerItem = await this.prisma.playerItem.findUnique({ where: { id: playerItemId }, include: { item: true } });
    if (!playerItem) throw new NotFoundException('Item not found');
    if (playerItem.playerId !== player.playerId) throw new ForbiddenException('Not your item');
    if (playerItem.equipped) throw new BadRequestException('Already equipped');

    await this.prisma.playerItem.updateMany({ where: { playerId: player.playerId, equipped: true, item: { slot: playerItem.item.slot } }, data: { equipped: false } });
    await this.prisma.playerItem.update({ where: { id: playerItemId }, data: { equipped: true } });

    return { success: true, message: `${playerItem.item.name} équipé` };
  }

  @Post('unequip/:slot')
  async unequipSlot(@CurrentPlayer() player: any, @Param('slot') slot: string) {
    const normalizedSlot = slot.toUpperCase();
    const equipped = await this.prisma.playerItem.findFirst({ where: { playerId: player.playerId, equipped: true, item: { slot: normalizedSlot } }, include: { item: true } });
    if (!equipped) throw new BadRequestException('No item in this slot');

    await this.prisma.playerItem.update({ where: { id: equipped.id }, data: { equipped: false } });
    return { success: true, message: `${equipped.item.name} déséquipé` };
  }

  @Delete(':itemId/sell')
  async sellItem(@CurrentPlayer() player: any, @Param('itemId') playerItemId: string) {
    const playerItem = await this.prisma.playerItem.findUnique({ where: { id: playerItemId }, include: { item: true } });
    if (!playerItem) throw new NotFoundException('Item not found');
    if (playerItem.playerId !== player.playerId) throw new ForbiddenException('Not your item');
    if (playerItem.equipped) throw new BadRequestException('Unequip first');

    const value = { COMMON: 100, RARE: 500, EPIC: 2000, LEGENDARY: 10000 }[playerItem.item.rarity] || 100;
    const city = await this.prisma.city.findFirst({ where: { ownerId: player.playerId, type: 'CAPITAL' } });
    if (!city) throw new BadRequestException('No capital');

    await this.prisma.$transaction([
      this.prisma.playerItem.delete({ where: { id: playerItemId } }),
      this.prisma.city.update({ where: { id: city.id }, data: { wood: { increment: value / 4 }, stone: { increment: value / 4 }, iron: { increment: value / 4 }, food: { increment: value / 4 } } }),
    ]);

    return { success: true, message: `Vendu pour ${value} ressources` };
  }

  @Post('generate-loot')
  async generateLoot(@CurrentPlayer() player: any, @Body() dto: { rarity: string; slot?: string }) {
    const rarity = (dto.rarity || 'COMMON').toUpperCase();
    const slot = dto.slot?.toUpperCase() || ITEM_SLOTS[Math.floor(Math.random() * ITEM_SLOTS.length)];
    const templates = ITEM_TEMPLATES[slot]?.filter(t => t.rarity === rarity) || [];
    if (templates.length === 0) throw new BadRequestException('No template');

    const template = templates[Math.floor(Math.random() * templates.length)];
    let item = await this.prisma.item.findFirst({ where: { name: template.name, slot, rarity } });
    if (!item) item = await this.prisma.item.create({ data: { name: template.name, slot, rarity, stats: template.stats } });

    const playerItem = await this.prisma.playerItem.create({ data: { playerId: player.playerId, itemId: item.id, equipped: false }, include: { item: true } });
    return { success: true, item: { id: playerItem.id, name: item.name, slot: item.slot, rarity: item.rarity, stats: item.stats } };
  }

  @Post('hero/allocate')
  async allocatePoints(@CurrentPlayer() player: any, @Body() dto: { attack?: number; defense?: number; speed?: number; logistics?: number }) {
    const hero = await this.prisma.hero.findFirst({ where: { ownerId: player.playerId } });
    if (!hero) throw new NotFoundException('Hero not found');

    const totalPoints = hero.level * 5;
    const usedPoints = hero.atkPoints + hero.defPoints + hero.spdPoints + hero.logPoints;
    const available = totalPoints - usedPoints;
    const toAllocate = (dto.attack || 0) + (dto.defense || 0) + (dto.speed || 0) + (dto.logistics || 0);

    if (toAllocate > available) throw new BadRequestException(`Only ${available} points available`);
    if (toAllocate <= 0) throw new BadRequestException('Allocate at least 1 point');

    await this.prisma.hero.update({ where: { id: hero.id }, data: { atkPoints: { increment: dto.attack || 0 }, defPoints: { increment: dto.defense || 0 }, spdPoints: { increment: dto.speed || 0 }, logPoints: { increment: dto.logistics || 0 } } });
    return { success: true, remaining: available - toAllocate };
  }
}

export default InventoryController;
