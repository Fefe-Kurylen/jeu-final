import { Controller, Get, Param, Query, UseGuards, Req, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /reports/battles
   * Liste des rapports de bataille du joueur
   */
  @Get('battles')
  async getBattleReports(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    const playerId = req.user.playerId;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      this.prisma.battleReport.findMany({
        where: {
          OR: [
            { attackerId: playerId, visibleToAttacker: true },
            { defenderId: playerId, visibleToDefender: true },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.battleReport.count({
        where: {
          OR: [
            { attackerId: playerId, visibleToAttacker: true },
            { defenderId: playerId, visibleToDefender: true },
          ],
        },
      }),
    ]);

    return {
      reports: reports.map(r => ({
        id: r.id,
        createdAt: r.createdAt,
        type: r.type,
        winner: r.winner,
        isAttacker: r.attackerId === playerId,
        rounds: r.rounds,
        summary: this.extractBattleSummary(r.payload as any),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * GET /reports/battles/:id
   * Détails d'un rapport de bataille
   */
  @Get('battles/:id')
  async getBattleReport(@Req() req: any, @Param('id') id: string) {
    const playerId = req.user.playerId;

    const report = await this.prisma.battleReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Vérifier la visibilité
    const canView =
      (report.attackerId === playerId && report.visibleToAttacker) ||
      (report.defenderId === playerId && report.visibleToDefender);

    if (!canView) {
      throw new ForbiddenException('You cannot view this report');
    }

    return {
      id: report.id,
      createdAt: report.createdAt,
      type: report.type,
      winner: report.winner,
      isAttacker: report.attackerId === playerId,
      rounds: report.rounds,
      attackerArmyId: report.attackerArmyId,
      defenderArmyId: report.defenderArmyId,
      payload: report.payload,
    };
  }

  /**
   * GET /reports/spy
   * Liste des rapports d'espionnage
   */
  @Get('spy')
  async getSpyReports(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    const playerId = req.user.playerId;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      this.prisma.spyReport.findMany({
        where: { attackerId: playerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.spyReport.count({
        where: { attackerId: playerId },
      }),
    ]);

    return {
      reports: reports.map(r => ({
        id: r.id,
        createdAt: r.createdAt,
        targetType: r.targetType,
        targetX: r.targetX,
        targetY: r.targetY,
        summary: this.extractSpySummary(r.payload as any),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * GET /reports/spy/:id
   * Détails d'un rapport d'espionnage
   */
  @Get('spy/:id')
  async getSpyReport(@Req() req: any, @Param('id') id: string) {
    const playerId = req.user.playerId;

    const report = await this.prisma.spyReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.attackerId !== playerId) {
      throw new ForbiddenException('You cannot view this report');
    }

    return {
      id: report.id,
      createdAt: report.createdAt,
      targetType: report.targetType,
      targetX: report.targetX,
      targetY: report.targetY,
      payload: report.payload,
    };
  }

  /**
   * GET /reports/unread-count
   * Nombre de rapports non lus
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const playerId = req.user.playerId;

    // Pour simplifier, on compte les rapports des dernières 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [battles, spy] = await Promise.all([
      this.prisma.battleReport.count({
        where: {
          createdAt: { gte: since },
          OR: [
            { attackerId: playerId, visibleToAttacker: true },
            { defenderId: playerId, visibleToDefender: true },
          ],
        },
      }),
      this.prisma.spyReport.count({
        where: {
          createdAt: { gte: since },
          attackerId: playerId,
        },
      }),
    ]);

    return {
      battles,
      spy,
      total: battles + spy,
    };
  }

  // Helpers
  private extractBattleSummary(payload: any): any {
    if (!payload) return {};

    return {
      attackerLosses: payload.attacker?.killed ? 
        Object.values(payload.attacker.killed).reduce((a: number, b: any) => a + (b || 0), 0) : 0,
      defenderLosses: payload.defender?.killed ?
        Object.values(payload.defender.killed).reduce((a: number, b: any) => a + (b || 0), 0) : 0,
      loot: payload.loot || null,
    };
  }

  private extractSpySummary(payload: any): any {
    if (!payload) return {};

    if (payload.targetType === 'CITY') {
      return {
        cityName: payload.city?.name,
        defenderCount: payload.city?.defenders?.length || 0,
      };
    }

    if (payload.targetType === 'RESOURCE') {
      return {
        nodeKind: payload.node?.kind,
        nodeLevel: payload.node?.level,
        tribePower: payload.node?.tribePower,
      };
    }

    return {};
  }
}

export default ReportsController;
