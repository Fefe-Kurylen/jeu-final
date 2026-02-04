import { Body, Controller, Get, Param, Post, UseGuards, Req, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';

// Multiplicateurs de coût par tier
const COST_MULTIPLIERS: Record<string, number> = {
  base: 1.30,
  intermediate: 1.70,
  elite: 1.90,
  siege: 1.00,
};

// Temps de recrutement par tier (secondes par unité)
const RECRUIT_TIME: Record<string, number> = {
  base: 60,
  intermediate: 120,
  elite: 180,
  siege: 600,
};

// Coûts de base par défaut
const DEFAULT_UNIT_COST = { wood: 30, stone: 20, iron: 50, food: 20 };

@Controller('city')
@UseGuards(JwtAuthGuard)
export class CityController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /city/:id
   * Obtenir les détails d'une ville
   */
  @Get(':id')
  async getCity(@Req() req: any, @Param('id') id: string) {
    const playerId = req.user.playerId;

    const city = await this.prisma.city.findUnique({
      where: { id },
      include: {
        buildings: true,
        buildQueue: {
          where: { status: { in: ['RUNNING', 'QUEUED'] } },
          orderBy: { startedAt: 'asc' },
        },
        recruitQueue: {
          where: { status: { in: ['RUNNING', 'QUEUED'] } },
          orderBy: { startedAt: 'asc' },
        },
        wounded: true,
      },
    });

    if (!city) {
      throw new NotFoundException('City not found');
    }

    if (city.ownerId !== playerId) {
      throw new ForbiddenException('This city belongs to another player');
    }

    // Calculer la production horaire
    const production = { wood: 0, stone: 0, iron: 0, food: 0 };
    for (const b of city.buildings) {
      if (b.key === 'LUMBER') production.wood += b.prodPerHour;
      else if (b.key === 'QUARRY') production.stone += b.prodPerHour;
      else if (b.key === 'IRON_MINE') production.iron += b.prodPerHour;
      else if (b.key === 'FARM') production.food += b.prodPerHour;
    }

    // Calculer l'upkeep de la garnison
    const garrison = await this.prisma.army.findFirst({
      where: { cityId: id, status: 'IN_CITY' },
      include: { units: true },
    });

    let upkeepPerHour = 0;
    if (garrison) {
      for (const unit of garrison.units) {
        const rate = unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : 15;
        upkeepPerHour += unit.count * rate;
      }
    }

    return {
      id: city.id,
      name: city.name,
      type: city.type,
      x: city.x,
      y: city.y,
      resources: {
        wood: Math.floor(city.wood),
        stone: Math.floor(city.stone),
        iron: Math.floor(city.iron),
        food: Math.floor(city.food),
      },
      maxStorage: city.maxStorage,
      maxFoodStorage: city.maxFoodStorage,
      production,
      upkeepPerHour,
      netFoodPerHour: production.food - upkeepPerHour,
      wallHp: city.wallHp,
      isSieged: city.isSieged,
      buildings: city.buildings.map(b => ({
        key: b.key,
        level: b.level,
        category: b.category,
        prodPerHour: b.prodPerHour,
      })),
      buildQueue: city.buildQueue.map(q => ({
        id: q.id,
        slot: q.slot,
        buildingKey: q.buildingKey,
        targetLevel: q.targetLevel,
        status: q.status,
        startedAt: q.startedAt,
        endsAt: q.endsAt,
        remainingSec: Math.max(0, Math.floor((new Date(q.endsAt).getTime() - Date.now()) / 1000)),
      })),
      recruitQueue: city.recruitQueue.map(q => ({
        id: q.id,
        buildingKey: q.buildingKey,
        unitKey: q.unitKey,
        count: q.count,
        status: q.status,
        endsAt: q.endsAt,
        remainingSec: q.endsAt ? Math.max(0, Math.floor((new Date(q.endsAt).getTime() - Date.now()) / 1000)) : null,
      })),
      wounded: city.wounded,
      garrison: garrison ? {
        id: garrison.id,
        units: garrison.units.map(u => ({
          unitKey: u.unitKey,
          tier: u.tier,
          count: u.count,
        })),
      } : null,
    };
  }

  /**
   * POST /city/:id/build/start
   * Lancer une construction
   */
  @Post(':id/build/start')
  async buildStart(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { slot: number; buildingKey: string }
  ) {
    const playerId = req.user.playerId;

    const city = await this.prisma.city.findUnique({
      where: { id },
      include: { 
        buildings: true, 
        buildQueue: { where: { status: { in: ['RUNNING', 'QUEUED'] } } } 
      },
    });

    if (!city) throw new NotFoundException('City not found');
    if (city.ownerId !== playerId) throw new ForbiddenException('Not your city');

    // Niveau du Main Hall
    const mainHall = city.buildings.find(b => b.key === 'MAIN_HALL');
    const mainHallLevel = mainHall?.level ?? 1;

    // Niveau actuel du bâtiment
    const existing = city.buildings.find(b => b.key === dto.buildingKey);
    const currentLevel = existing?.level ?? 0;
    const targetLevel = currentLevel + 1;

    // Vérifier la limite Main Hall
    if (dto.buildingKey !== 'MAIN_HALL' && targetLevel > mainHallLevel) {
      throw new BadRequestException(
        `Cannot build ${dto.buildingKey} above Main Hall level (${mainHallLevel})`
      );
    }

    // Vérifier le niveau max (20 par défaut)
    if (targetLevel > 20) {
      throw new BadRequestException(`${dto.buildingKey} is already at max level`);
    }

    // Vérifier les slots
    const runningCount = city.buildQueue.filter(q => q.status === 'RUNNING').length;
    const queuedCount = city.buildQueue.filter(q => q.status === 'QUEUED').length;

    if (runningCount >= 2 && queuedCount >= 2) {
      throw new BadRequestException('Build queue is full');
    }

    let slot: number;
    let status: string;

    if (runningCount < 2) {
      slot = runningCount + 1;
      status = 'RUNNING';
    } else {
      slot = queuedCount + 3;
      status = 'QUEUED';
    }

    // Coûts simplifiés (niveau * 100)
    const cost = {
      wood: targetLevel * 100,
      stone: targetLevel * 80,
      iron: targetLevel * 60,
      food: targetLevel * 40,
    };

    if (city.wood < cost.wood || city.stone < cost.stone || 
        city.iron < cost.iron || city.food < cost.food) {
      throw new BadRequestException(`Not enough resources`);
    }

    // Durée (niveau * 60 secondes, simplifié)
    const durationSec = Math.round(targetLevel * 60 * Math.pow(1.2, targetLevel - 1));
    const now = new Date();
    const endsAt = status === 'RUNNING' 
      ? new Date(now.getTime() + durationSec * 1000)
      : new Date(0);

    const result = await this.prisma.$transaction([
      this.prisma.city.update({
        where: { id },
        data: {
          wood: { decrement: cost.wood },
          stone: { decrement: cost.stone },
          iron: { decrement: cost.iron },
          food: { decrement: cost.food },
        },
      }),
      this.prisma.buildQueueItem.create({
        data: {
          cityId: id,
          slot,
          buildingKey: dto.buildingKey,
          targetLevel,
          status,
          startedAt: now,
          endsAt,
        },
      }),
    ]);

    return {
      success: true,
      queueItem: {
        id: result[1].id,
        buildingKey: dto.buildingKey,
        targetLevel,
        status,
        slot,
        durationSec,
        endsAt: status === 'RUNNING' ? endsAt : null,
      },
      resourcesSpent: cost,
    };
  }

  /**
   * POST /city/:id/recruit
   * Lancer un recrutement
   */
  @Post(':id/recruit')
  async recruit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { unitKey: string; count: number; buildingKey: string }
  ) {
    const playerId = req.user.playerId;

    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException('City not found');
    if (city.ownerId !== playerId) throw new ForbiddenException('Not your city');

    if (dto.count <= 0 || dto.count > 1000) {
      throw new BadRequestException('Count must be between 1 and 1000');
    }

    // Déterminer le tier depuis le nom de l'unité
    let tier = 'base';
    if (dto.unitKey.includes('ELITE') || dto.unitKey.includes('LEGION') || dto.unitKey.includes('PRAETOR')) {
      tier = 'elite';
    } else if (dto.unitKey.includes('TRIARII') || dto.unitKey.includes('EQUITES') || dto.unitKey.includes('PRINCIP')) {
      tier = 'intermediate';
    } else if (dto.unitKey.includes('CATAPULT') || dto.unitKey.includes('MANGON') || dto.unitKey.includes('BALIST')) {
      tier = 'siege';
    }

    // Calculer les coûts
    const mult = COST_MULTIPLIERS[tier] || 1.0;
    const totalCost = {
      wood: Math.ceil(DEFAULT_UNIT_COST.wood * mult * dto.count),
      stone: Math.ceil(DEFAULT_UNIT_COST.stone * mult * dto.count),
      iron: Math.ceil(DEFAULT_UNIT_COST.iron * mult * dto.count),
      food: Math.ceil(DEFAULT_UNIT_COST.food * mult * dto.count),
    };

    if (city.wood < totalCost.wood || city.stone < totalCost.stone ||
        city.iron < totalCost.iron || city.food < totalCost.food) {
      throw new BadRequestException(`Not enough resources`);
    }

    // Vérifier le bâtiment
    const building = await this.prisma.cityBuilding.findFirst({
      where: { cityId: id, key: dto.buildingKey },
    });

    if (!building) {
      throw new BadRequestException(`Building ${dto.buildingKey} not found`);
    }

    // Calculer le temps
    const unitType = dto.unitKey.includes('CAV') || dto.unitKey.includes('EQUITES') ? 'CAV' : 'INF';
    let baseTime = RECRUIT_TIME[tier] || 60;
    if (unitType === 'CAV') baseTime = Math.ceil(baseTime * 1.25);
    const totalTime = baseTime * dto.count;

    // Vérifier s'il y a un recrutement en cours
    const running = await this.prisma.recruitmentQueueItem.findFirst({
      where: { cityId: id, buildingKey: dto.buildingKey, status: 'RUNNING' },
    });

    const now = new Date();
    const status = running ? 'QUEUED' : 'RUNNING';
    const endsAt = status === 'RUNNING' 
      ? new Date(now.getTime() + totalTime * 1000)
      : null;

    const result = await this.prisma.$transaction([
      this.prisma.city.update({
        where: { id },
        data: {
          wood: { decrement: totalCost.wood },
          stone: { decrement: totalCost.stone },
          iron: { decrement: totalCost.iron },
          food: { decrement: totalCost.food },
        },
      }),
      this.prisma.recruitmentQueueItem.create({
        data: {
          cityId: id,
          buildingKey: dto.buildingKey,
          unitKey: dto.unitKey,
          count: dto.count,
          status,
          startedAt: now,
          endsAt,
        },
      }),
    ]);

    return {
      success: true,
      queueItem: {
        id: result[1].id,
        unitKey: dto.unitKey,
        count: dto.count,
        tier,
        status,
        durationSec: totalTime,
        endsAt,
      },
      resourcesSpent: totalCost,
    };
  }

  /**
   * POST /city/:id/rename
   * Renommer une ville
   */
  @Post(':id/rename')
  async rename(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { name: string }
  ) {
    const playerId = req.user.playerId;

    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city || city.ownerId !== playerId) {
      throw new ForbiddenException('Not your city');
    }

    if (!dto.name || dto.name.length < 3 || dto.name.length > 30) {
      throw new BadRequestException('Name must be between 3 and 30 characters');
    }

    await this.prisma.city.update({
      where: { id },
      data: { name: dto.name },
    });

    return { success: true, name: dto.name };
  }
}

export default CityController;
