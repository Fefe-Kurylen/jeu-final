import { Controller, Get, Post, Body, Param, UseGuards, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

// Configuration (from GDD)
const MIN_MEMBERS_FOR_BASTION = 30;
const BASTION_BUILD_TIME_DAYS = 3;
const BASTION_COOLDOWN_DAYS = 7;
const BASTION_WALL_MULTIPLIER = 50; // 50x wall level 20

// Resource requirements
const BASTION_RESOURCES = {
  wood: 500000,
  stone: 500000,
  iron: 500000,
  food: 250000,
};

// Bonuses when bastion is active
const BASTION_BONUSES = {
  productionBonus: 0.10,      // +10% production
  armySpeedBonus: 0.05,       // +5% army speed
  transportTaxRemoved: true,  // No tax between members
  transportCapacityBonus: 10, // +10 transport capacity
  garrisonDefenseBonus: 0.10, // +10% defense in garrison
};

@Controller('bastion')
@UseGuards(JwtAuthGuard)
export class BastionController {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET BASTION STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':allianceId')
  async getBastionStatus(
    @CurrentPlayer() player: any,
    @Param('allianceId') allianceId: string
  ) {
    // Verify player is in alliance
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this alliance');
    }

    const alliance = await this.prisma.alliance.findUnique({
      where: { id: allianceId },
    });

    const bastion = await this.prisma.bastion.findUnique({
      where: { allianceId },
      include: {
        contributions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        garrison: true,
      },
    });

    // Calculate progress
    let progress = null;
    if (bastion) {
      progress = {
        wood: Math.min(100, (bastion.woodContributed / bastion.woodRequired) * 100),
        stone: Math.min(100, (bastion.stoneContributed / bastion.stoneRequired) * 100),
        iron: Math.min(100, (bastion.ironContributed / bastion.ironRequired) * 100),
        food: Math.min(100, (bastion.foodContributed / bastion.foodRequired) * 100),
        total: Math.min(100, (
          (bastion.woodContributed / bastion.woodRequired) +
          (bastion.stoneContributed / bastion.stoneRequired) +
          (bastion.ironContributed / bastion.ironRequired) +
          (bastion.foodContributed / bastion.foodRequired)
        ) / 4 * 100),
      };
    }

    return {
      bastion,
      progress,
      requirements: {
        minMembers: MIN_MEMBERS_FOR_BASTION,
        currentMembers: alliance?.totalMembers || 0,
        canStart: (alliance?.totalMembers || 0) >= MIN_MEMBERS_FOR_BASTION,
        resources: BASTION_RESOURCES,
      },
      bonuses: bastion?.status === 'ACTIVE' ? BASTION_BONUSES : null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIATE BASTION (Place location)
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':allianceId/initiate')
  async initiateBastion(
    @CurrentPlayer() player: any,
    @Param('allianceId') allianceId: string,
    @Body() dto: { x: number; y: number }
  ) {
    // Verify player is officer+
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id, role: { in: ['LEADER', 'OFFICER'] } },
    });
    if (!membership) {
      throw new ForbiddenException('Only officers can initiate bastion');
    }

    // Check alliance has enough members
    const alliance = await this.prisma.alliance.findUnique({
      where: { id: allianceId },
    });
    if (!alliance || alliance.totalMembers < MIN_MEMBERS_FOR_BASTION) {
      throw new BadRequestException(`Need at least ${MIN_MEMBERS_FOR_BASTION} members`);
    }

    // Check no existing bastion or in cooldown
    const existingBastion = await this.prisma.bastion.findUnique({
      where: { allianceId },
    });
    if (existingBastion) {
      if (existingBastion.status === 'COOLDOWN' && existingBastion.cooldownEndsAt) {
        if (existingBastion.cooldownEndsAt > new Date()) {
          throw new BadRequestException(`Bastion in cooldown until ${existingBastion.cooldownEndsAt}`);
        }
        // Cooldown ended, can rebuild
        await this.prisma.bastion.delete({ where: { id: existingBastion.id } });
      } else if (existingBastion.status !== 'DESTROYED') {
        throw new BadRequestException('Bastion already exists');
      }
    }

    // Verify location is valid (not on city or node)
    const cityAtLocation = await this.prisma.city.findFirst({
      where: { x: dto.x, y: dto.y },
    });
    if (cityAtLocation) {
      throw new BadRequestException('Cannot place bastion on a city');
    }

    const nodeAtLocation = await this.prisma.resourceNode.findFirst({
      where: { x: dto.x, y: dto.y },
    });
    if (nodeAtLocation) {
      throw new BadRequestException('Cannot place bastion on a resource node');
    }

    // Create bastion in PLANNING status
    const bastion = await this.prisma.bastion.create({
      data: {
        allianceId,
        x: dto.x,
        y: dto.y,
        status: 'PLANNING',
        woodRequired: BASTION_RESOURCES.wood,
        stoneRequired: BASTION_RESOURCES.stone,
        ironRequired: BASTION_RESOURCES.iron,
        foodRequired: BASTION_RESOURCES.food,
      },
    });

    return bastion;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRIBUTE RESOURCES
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':allianceId/contribute')
  async contributeResources(
    @CurrentPlayer() player: any,
    @Param('allianceId') allianceId: string,
    @Body() dto: { cityId: string; wood?: number; stone?: number; iron?: number; food?: number }
  ) {
    // Verify player is in alliance
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this alliance');
    }

    // Check bastion exists and is in PLANNING status
    const bastion = await this.prisma.bastion.findUnique({
      where: { allianceId },
    });
    if (!bastion || bastion.status !== 'PLANNING') {
      throw new BadRequestException('Bastion not accepting contributions');
    }

    // Check city ownership
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
    });
    if (!city || city.ownerId !== player.id) {
      throw new ForbiddenException('City not found or not yours');
    }

    // Validate and cap contributions
    const wood = Math.min(dto.wood || 0, city.wood, bastion.woodRequired - bastion.woodContributed);
    const stone = Math.min(dto.stone || 0, city.stone, bastion.stoneRequired - bastion.stoneContributed);
    const iron = Math.min(dto.iron || 0, city.iron, bastion.ironRequired - bastion.ironContributed);
    const food = Math.min(dto.food || 0, city.food, bastion.foodRequired - bastion.foodContributed);

    if (wood + stone + iron + food <= 0) {
      throw new BadRequestException('No valid resources to contribute');
    }

    // Execute contribution
    await this.prisma.$transaction([
      // Deduct from city
      this.prisma.city.update({
        where: { id: dto.cityId },
        data: {
          wood: { decrement: wood },
          stone: { decrement: stone },
          iron: { decrement: iron },
          food: { decrement: food },
        },
      }),
      // Add to bastion
      this.prisma.bastion.update({
        where: { id: bastion.id },
        data: {
          woodContributed: { increment: wood },
          stoneContributed: { increment: stone },
          ironContributed: { increment: iron },
          foodContributed: { increment: food },
        },
      }),
      // Record contribution
      this.prisma.bastionContribution.create({
        data: {
          bastionId: bastion.id,
          playerId: player.id,
          wood,
          stone,
          iron,
          food,
        },
      }),
    ]);

    // Check if fully funded
    const updatedBastion = await this.prisma.bastion.findUnique({ where: { id: bastion.id } });
    if (
      updatedBastion &&
      updatedBastion.woodContributed >= updatedBastion.woodRequired &&
      updatedBastion.stoneContributed >= updatedBastion.stoneRequired &&
      updatedBastion.ironContributed >= updatedBastion.ironRequired &&
      updatedBastion.foodContributed >= updatedBastion.foodRequired
    ) {
      // Start building
      const completedAt = new Date(Date.now() + BASTION_BUILD_TIME_DAYS * 24 * 60 * 60 * 1000);
      await this.prisma.bastion.update({
        where: { id: bastion.id },
        data: {
          status: 'BUILDING',
          buildingStartedAt: new Date(),
          completedAt,
        },
      });
    }

    return { success: true, contributed: { wood, stone, iron, food } };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GARRISON ARMY
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':allianceId/garrison')
  async garrisonArmy(
    @CurrentPlayer() player: any,
    @Param('allianceId') allianceId: string,
    @Body() dto: { armyId: string }
  ) {
    // Verify player is in alliance
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this alliance');
    }

    // Check bastion is active
    const bastion = await this.prisma.bastion.findUnique({
      where: { allianceId },
    });
    if (!bastion || bastion.status !== 'ACTIVE') {
      throw new BadRequestException('Bastion not active');
    }

    // Check army
    const army = await this.prisma.army.findUnique({
      where: { id: dto.armyId },
    });
    if (!army || army.ownerId !== player.id) {
      throw new NotFoundException('Army not found');
    }
    if (army.status !== 'IDLE' && army.status !== 'IN_CITY') {
      throw new BadRequestException('Army is busy');
    }

    // Check if already garrisoned
    const existingGarrison = await this.prisma.bastionGarrison.findUnique({
      where: { armyId: dto.armyId },
    });
    if (existingGarrison) {
      throw new BadRequestException('Army already in garrison');
    }

    // Add to garrison
    await this.prisma.$transaction([
      this.prisma.bastionGarrison.create({
        data: {
          bastionId: bastion.id,
          armyId: army.id,
          playerId: player.id,
        },
      }),
      this.prisma.army.update({
        where: { id: army.id },
        data: {
          status: 'GARRISONED',
          x: bastion.x,
          y: bastion.y,
        },
      }),
    ]);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WITHDRAW FROM GARRISON
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':allianceId/withdraw')
  async withdrawArmy(
    @CurrentPlayer() player: any,
    @Param('allianceId') allianceId: string,
    @Body() dto: { armyId: string }
  ) {
    const garrison = await this.prisma.bastionGarrison.findUnique({
      where: { armyId: dto.armyId },
    });
    if (!garrison || garrison.playerId !== player.id) {
      throw new NotFoundException('Army not in garrison or not yours');
    }

    // Remove from garrison and return army
    const army = await this.prisma.army.findUnique({ where: { id: dto.armyId } });
    
    await this.prisma.$transaction([
      this.prisma.bastionGarrison.delete({ where: { id: garrison.id } }),
      this.prisma.army.update({
        where: { id: dto.armyId },
        data: {
          status: 'RETURNING',
          targetX: null,
          targetY: null,
        },
      }),
    ]);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET CONTRIBUTION LEADERBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':allianceId/leaderboard')
  async getLeaderboard(
    @CurrentPlayer() player: any,
    @Param('allianceId') allianceId: string
  ) {
    // Verify player is in alliance
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this alliance');
    }

    const bastion = await this.prisma.bastion.findUnique({
      where: { allianceId },
    });
    if (!bastion) {
      throw new NotFoundException('No bastion found');
    }

    // Aggregate contributions by player
    const contributions = await this.prisma.bastionContribution.groupBy({
      by: ['playerId'],
      where: { bastionId: bastion.id },
      _sum: {
        wood: true,
        stone: true,
        iron: true,
        food: true,
      },
    });

    // Calculate total and sort
    const leaderboard = contributions.map(c => ({
      playerId: c.playerId,
      wood: c._sum.wood || 0,
      stone: c._sum.stone || 0,
      iron: c._sum.iron || 0,
      food: c._sum.food || 0,
      total: (c._sum.wood || 0) + (c._sum.stone || 0) + (c._sum.iron || 0) + (c._sum.food || 0),
    })).sort((a, b) => b.total - a.total);

    // Get player names
    const playerIds = leaderboard.map(l => l.playerId);
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, name: true },
    });
    const playerMap = new Map(players.map(p => [p.id, p.name]));

    return leaderboard.map(l => ({
      ...l,
      playerName: playerMap.get(l.playerId) || 'Unknown',
    }));
  }
}
