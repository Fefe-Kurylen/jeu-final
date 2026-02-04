import { Controller, Get, Post, Body, Param, Query, UseGuards, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

// Configuration
const MAX_EXPEDITION_QUEUE = 15;
const EXPEDITION_EXPIRE_HOURS = 24;
const XP_PER_ENEMY_KILLED = 0.25;

// Difficulty settings
const DIFFICULTY_CONFIG = {
  EASY: { power: [500, 1500], duration: [1800, 3600], xpMult: 1, lootChance: { COMMON: 20, RARE: 5, EPIC: 1, LEGENDARY: 0 } },
  NORMAL: { power: [1500, 4000], duration: [3600, 5400], xpMult: 1.5, lootChance: { COMMON: 15, RARE: 10, EPIC: 3, LEGENDARY: 0.5 } },
  HARD: { power: [4000, 10000], duration: [5400, 7200], xpMult: 2, lootChance: { COMMON: 10, RARE: 15, EPIC: 5, LEGENDARY: 1 } },
  NIGHTMARE: { power: [10000, 25000], duration: [7200, 10800], xpMult: 3, lootChance: { COMMON: 5, RARE: 10, EPIC: 10, LEGENDARY: 3 } },
};

@Controller('expedition')
@UseGuards(JwtAuthGuard)
export class ExpeditionController {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST AVAILABLE EXPEDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('available')
  async listAvailable(@CurrentPlayer() player: any) {
    const expeditions = await this.prisma.expedition.findMany({
      where: {
        playerId: player.id,
        status: 'AVAILABLE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return expeditions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET EXPEDITION DETAILS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id')
  async getExpedition(@CurrentPlayer() player: any, @Param('id') id: string) {
    const expedition = await this.prisma.expedition.findUnique({
      where: { id },
      include: { instances: true },
    });

    if (!expedition || expedition.playerId !== player.id) {
      throw new NotFoundException('Expedition not found');
    }

    return expedition;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // START EXPEDITION
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/start')
  async startExpedition(
    @CurrentPlayer() player: any,
    @Param('id') expeditionId: string,
    @Body() dto: { armyId: string }
  ) {
    // Check expedition exists and is available
    const expedition = await this.prisma.expedition.findUnique({
      where: { id: expeditionId },
    });

    if (!expedition || expedition.playerId !== player.id) {
      throw new NotFoundException('Expedition not found');
    }

    if (expedition.status !== 'AVAILABLE') {
      throw new BadRequestException('Expedition not available');
    }

    if (expedition.expiresAt < new Date()) {
      throw new BadRequestException('Expedition has expired');
    }

    // Check army exists and has hero
    const army = await this.prisma.army.findUnique({
      where: { id: dto.armyId },
      include: { units: true, owner: { include: { hero: true } } },
    });

    if (!army || army.ownerId !== player.id) {
      throw new NotFoundException('Army not found');
    }

    if (army.status !== 'IDLE' && army.status !== 'IN_CITY') {
      throw new BadRequestException('Army is busy');
    }

    if (!army.heroId) {
      throw new BadRequestException('Hero required for expedition');
    }

    if (army.units.length === 0) {
      throw new BadRequestException('Army has no units');
    }

    // Create expedition instance
    const endsAt = new Date(Date.now() + expedition.durationSec * 1000);

    await this.prisma.$transaction([
      this.prisma.expeditionInstance.create({
        data: {
          expeditionId: expedition.id,
          armyId: army.id,
          playerId: player.id,
          endsAt,
          status: 'TRAVELING',
        },
      }),
      this.prisma.expedition.update({
        where: { id: expeditionId },
        data: { status: 'IN_PROGRESS' },
      }),
      this.prisma.army.update({
        where: { id: army.id },
        data: { status: 'MOVING', orderType: 'MOVE' },
      }),
    ]);

    return { success: true, endsAt };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST ACTIVE EXPEDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('active/list')
  async listActive(@CurrentPlayer() player: any) {
    const instances = await this.prisma.expeditionInstance.findMany({
      where: {
        playerId: player.id,
        status: 'TRAVELING',
      },
      include: { expedition: true },
      orderBy: { endsAt: 'asc' },
    });

    return instances;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST COMPLETED EXPEDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('completed/list')
  async listCompleted(
    @CurrentPlayer() player: any,
    @Query('limit') limit: string = '20'
  ) {
    const instances = await this.prisma.expeditionInstance.findMany({
      where: {
        playerId: player.id,
        status: 'COMPLETED',
      },
      include: { expedition: true },
      orderBy: { endsAt: 'desc' },
      take: parseInt(limit),
    });

    return instances;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATE NEW EXPEDITION (Admin/System endpoint)
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('generate')
  async generateExpedition(@CurrentPlayer() player: any) {
    // Check queue size
    const queueCount = await this.prisma.expedition.count({
      where: { playerId: player.id, status: 'AVAILABLE' },
    });

    if (queueCount >= MAX_EXPEDITION_QUEUE) {
      throw new BadRequestException(`Max ${MAX_EXPEDITION_QUEUE} expeditions in queue`);
    }

    // Random difficulty
    const difficulties = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'] as const;
    const weights = [40, 35, 20, 5];
    const roll = Math.random() * 100;
    let cumulative = 0;
    let difficulty: typeof difficulties[number] = 'EASY';
    
    for (let i = 0; i < difficulties.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) {
        difficulty = difficulties[i];
        break;
      }
    }

    const config = DIFFICULTY_CONFIG[difficulty];
    const enemyPower = Math.floor(config.power[0] + Math.random() * (config.power[1] - config.power[0]));
    const durationSec = Math.floor(config.duration[0] + Math.random() * (config.duration[1] - config.duration[0]));

    // Generate enemy composition
    const infantry = 40 + Math.floor(Math.random() * 20);
    const archers = 20 + Math.floor(Math.random() * 20);
    const cavalry = 100 - infantry - archers;

    // Determine loot tier
    const lootRoll = Math.random() * 100;
    let lootTier = 'COMMON';
    if (lootRoll < config.lootChance.LEGENDARY) lootTier = 'LEGENDARY';
    else if (lootRoll < config.lootChance.EPIC + config.lootChance.LEGENDARY) lootTier = 'EPIC';
    else if (lootRoll < config.lootChance.RARE + config.lootChance.EPIC + config.lootChance.LEGENDARY) lootTier = 'RARE';

    // Calculate rewards
    const baseXp = Math.floor(enemyPower * XP_PER_ENEMY_KILLED / 100);
    const xpReward = Math.floor(baseXp * config.xpMult);
    
    const resourceMult = { EASY: 1, NORMAL: 2, HARD: 4, NIGHTMARE: 8 }[difficulty];
    const resourceReward = {
      wood: Math.floor((500 + Math.random() * 1500) * resourceMult),
      stone: Math.floor((500 + Math.random() * 1500) * resourceMult),
      iron: Math.floor((300 + Math.random() * 1000) * resourceMult),
      food: Math.floor((200 + Math.random() * 800) * resourceMult),
    };

    const expedition = await this.prisma.expedition.create({
      data: {
        playerId: player.id,
        difficulty,
        enemyPower,
        enemyComp: { infantry, archers, cavalry },
        durationSec,
        expiresAt: new Date(Date.now() + EXPEDITION_EXPIRE_HOURS * 60 * 60 * 1000),
        lootTier,
        xpReward,
        resourceReward,
        status: 'AVAILABLE',
      },
    });

    return expedition;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET EXPEDITION STATS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('stats/summary')
  async getStats(@CurrentPlayer() player: any) {
    const [available, inProgress, completed, totalXp] = await Promise.all([
      this.prisma.expedition.count({
        where: { playerId: player.id, status: 'AVAILABLE' },
      }),
      this.prisma.expeditionInstance.count({
        where: { playerId: player.id, status: 'TRAVELING' },
      }),
      this.prisma.expeditionInstance.count({
        where: { playerId: player.id, status: 'COMPLETED' },
      }),
      this.prisma.expeditionInstance.aggregate({
        where: { playerId: player.id, status: 'COMPLETED' },
        _sum: { xpGained: true },
      }),
    ]);

    return {
      available,
      inProgress,
      completed,
      totalXpGained: totalXp._sum.xpGained || 0,
      maxQueue: MAX_EXPEDITION_QUEUE,
    };
  }
}
