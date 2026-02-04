import { Controller, Post, Get, Patch, Body, Param, UseGuards, Req, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';

// Configuration initiale du joueur
const STARTING_RESOURCES = {
  wood: 800,
  stone: 800,
  iron: 800,
  food: 800,
};

const STARTING_BUILDINGS = [
  { key: 'MAIN_HALL', level: 1 },
  { key: 'FARM', level: 3 },
  { key: 'LUMBER', level: 2 },
  { key: 'QUARRY', level: 2 },
  { key: 'IRON_MINE', level: 2 },
  { key: 'BARRACKS', level: 1 },
  { key: 'WAREHOUSE', level: 1 },
  { key: 'SILO', level: 1 },
];

const STARTING_UNITS = [
  { unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 10 },
];

// Faction-specific starting units
const FACTION_STARTING_UNITS: Record<string, Array<{ unitKey: string; tier: string; count: number }>> = {
  ROME: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 10 }],
  GAUL: [{ unitKey: 'GAU_INF_GUERRIER', tier: 'base', count: 10 }],
  GREEK: [{ unitKey: 'GRE_INF_HOPLITE', tier: 'base', count: 10 }],
  EGYPT: [{ unitKey: 'EGY_INF_MEDJAY', tier: 'base', count: 10 }],
  HUN: [{ unitKey: 'HUN_CAV_CAVALIER', tier: 'base', count: 8 }],
  SULTAN: [{ unitKey: 'SUL_INF_GHAZI', tier: 'base', count: 10 }],
};

@Controller('player')
export class PlayerController {
  constructor(private prisma: PrismaService) {}

  /**
   * POST /player/bootstrap
   * Initialise le joueur avec sa capitale, héros et armée de départ
   */
  @Post('bootstrap')
  @UseGuards(JwtAuthGuard)
  async bootstrap(@Req() req: any) {
    const playerId = req.user.playerId;
    const faction = req.user.faction;

    // Vérifier que le joueur n'a pas déjà de ville
    const existingCities = await this.prisma.city.count({
      where: { ownerId: playerId },
    });

    if (existingCities > 0) {
      throw new BadRequestException('Player already has cities. Bootstrap can only be called once.');
    }

    // Trouver une position libre sur la carte
    const position = await this.findFreePosition();

    // Créer tout dans une transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Créer la capitale
      const city = await tx.city.create({
        data: {
          ownerId: playerId,
          type: 'CAPITAL',
          name: `${faction} Capital`,
          x: position.x,
          y: position.y,
          wood: STARTING_RESOURCES.wood,
          stone: STARTING_RESOURCES.stone,
          iron: STARTING_RESOURCES.iron,
          food: STARTING_RESOURCES.food,
        },
      });

      // 2. Créer les bâtiments de départ
      for (const building of STARTING_BUILDINGS) {
        await tx.cityBuilding.create({
          data: {
            cityId: city.id,
            key: building.key,
            level: building.level,
            category: 'BASE',
            prodPerHour: this.getInitialProdPerHour(building.key, building.level),
          },
        });
      }

      // 3. Créer le héros
      const heroNames = {
        ROME: 'Marcus Aurelius',
        GAUL: 'Vercingétorix',
        GREEK: 'Achilles',
        EGYPT: 'Ramsès',
        HUN: 'Attila',
        SULTAN: 'Saladin',
      };
      
      const hero = await tx.hero.create({
        data: {
          ownerId: playerId,
          name: heroNames[faction] || 'Héros',
          level: 1,
          xp: 0,
          attack: 10,
          defense: 10,
          speed: 10,
          logistics: 10,
          atkPoints: 5,
          defPoints: 5,
          logPoints: 5,
          spdPoints: 5,
        },
      });

      // 4. Créer l'armée de garnison
      const army = await tx.army.create({
        data: {
          ownerId: playerId,
          cityId: city.id,
          x: city.x,
          y: city.y,
          status: 'IN_CITY',
          originCityId: city.id,
          heroId: hero.id,
        },
      });

      // 5. Ajouter les unités de départ
      const startingUnits = FACTION_STARTING_UNITS[faction] || STARTING_UNITS;
      for (const unit of startingUnits) {
        await tx.armyUnit.create({
          data: {
            armyId: army.id,
            unitKey: unit.unitKey,
            tier: unit.tier,
            count: unit.count,
          },
        });
      }

      // 6. Calculer la population initiale
      let population = 0;
      for (const b of STARTING_BUILDINGS) {
        population += b.level * 2; // Simplifié
      }
      await tx.player.update({
        where: { id: playerId },
        data: { population },
      });

      return { city, hero, army };
    });

    return {
      success: true,
      message: 'Bootstrap completed! Your capital has been created.',
      city: {
        id: result.city.id,
        name: result.city.name,
        x: result.city.x,
        y: result.city.y,
        resources: {
          wood: result.city.wood,
          stone: result.city.stone,
          iron: result.city.iron,
          food: result.city.food,
        },
      },
      hero: {
        id: result.hero.id,
        level: result.hero.level,
      },
      army: {
        id: result.army.id,
        status: result.army.status,
      },
    };
  }

  /**
   * GET /player/profile
   * Obtenir le profil complet du joueur
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
    const playerId = req.user.playerId;

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        cities: {
          include: {
            buildings: true,
            buildQueue: { where: { status: { in: ['RUNNING', 'QUEUED'] } } },
            recruitQueue: { where: { status: { in: ['RUNNING', 'QUEUED'] } } },
          },
        },
        armies: {
          include: { units: true },
        },
        hero: true,
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return {
      id: player.id,
      name: player.name,
      faction: player.faction,
      population: player.population,
      createdAt: player.createdAt,
      cities: player.cities.map(city => ({
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
        wallHp: city.wallHp,
        isSieged: city.isSieged,
        buildings: city.buildings.map(b => ({
          key: b.key,
          level: b.level,
          prodPerHour: b.prodPerHour,
        })),
        buildQueue: city.buildQueue,
        recruitQueue: city.recruitQueue,
      })),
      armies: player.armies.map(army => ({
        id: army.id,
        status: army.status,
        x: army.x,
        y: army.y,
        cityId: army.cityId,
        hasHero: army.heroId !== null,
        units: army.units.map(u => ({
          unitKey: u.unitKey,
          tier: u.tier,
          count: u.count,
        })),
      })),
      hero: player.hero ? {
        id: player.hero.id,
        level: player.hero.level,
        xp: player.hero.xp,
        stats: {
          attack: player.hero.atkPoints,
          defense: player.hero.defPoints,
          logistics: player.hero.logPoints,
          speed: player.hero.spdPoints,
        },
        hpPct: player.hero.hpPct,
        actionPct: player.hero.actionPct,
      } : null,
    };
  }

  /**
   * GET /player/ranking
   * Classement des joueurs par population
   */
  @Get('ranking')
  async getRanking() {
    const players = await this.prisma.player.findMany({
      orderBy: { population: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        faction: true,
        population: true,
        _count: { select: { cities: true } },
      },
    });

    return players.map((p, index) => ({
      rank: index + 1,
      id: p.id,
      name: p.name,
      faction: p.faction,
      population: p.population,
      cityCount: p._count.cities,
    }));
  }

  /**
   * PATCH /player/hero/assign-points
   * Assigner des points de stats au héros
   */
  @Patch('hero/assign-points')
  @UseGuards(JwtAuthGuard)
  async assignHeroPoints(@Req() req: any, @Body() body: { stat: string; points: number }) {
    const playerId = req.user.playerId;

    const hero = await this.prisma.hero.findUnique({
      where: { ownerId: playerId },
    });

    if (!hero) {
      throw new NotFoundException('Hero not found. Did you bootstrap?');
    }

    const validStats = ['attack', 'defense', 'logistics', 'speed'];
    if (!validStats.includes(body.stat)) {
      throw new BadRequestException(`Invalid stat. Must be one of: ${validStats.join(', ')}`);
    }

    // Calculer les points disponibles (2 par niveau)
    const totalPoints = hero.level * 2 + 20; // 20 points de base
    const usedPoints = hero.atkPoints + hero.defPoints + hero.logPoints + hero.spdPoints;
    const available = totalPoints - usedPoints;

    if (body.points > available) {
      throw new BadRequestException(`Not enough points. Available: ${available}`);
    }

    const statField = {
      attack: 'atkPoints',
      defense: 'defPoints',
      logistics: 'logPoints',
      speed: 'spdPoints',
    }[body.stat]!;

    await this.prisma.hero.update({
      where: { id: hero.id },
      data: { [statField]: { increment: body.points } },
    });

    return { success: true, message: `Added ${body.points} points to ${body.stat}` };
  }

  // Helpers
  private async findFreePosition(): Promise<{ x: number; y: number }> {
    // Chercher dans une zone de spawn (centre de la carte)
    const world = await this.prisma.worldState.findFirst();
    const minX = world?.minX ?? -100;
    const maxX = world?.maxX ?? 100;
    const minY = world?.minY ?? -100;
    const maxY = world?.maxY ?? 100;

    // Chercher une position libre (pas de ville, pas de nœud ressource)
    for (let attempts = 0; attempts < 1000; attempts++) {
      const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
      const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

      const existingCity = await this.prisma.city.findFirst({
        where: { x, y },
      });

      const existingNode = await this.prisma.resourceNode.findFirst({
        where: { x, y },
      });

      if (!existingCity && !existingNode) {
        return { x, y };
      }
    }

    throw new BadRequestException('Could not find free position on map');
  }

  private getInitialProdPerHour(key: string, level: number): number {
    // Production par heure selon le bâtiment
    const prodBuildings: Record<string, boolean> = {
      FARM: true,
      LUMBER: true,
      QUARRY: true,
      IRON_MINE: true,
    };

    if (!prodBuildings[key]) return 0;

    // Courbe simplifiée: 20 * level^1.5
    return Math.round(20 * Math.pow(level, 1.5));
  }
}

export default PlayerController;
