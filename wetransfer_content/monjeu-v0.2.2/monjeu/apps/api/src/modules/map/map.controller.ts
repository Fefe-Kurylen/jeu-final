import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';

@Controller('map')
export class MapController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /map/viewport
   * Obtenir les données de la carte dans une zone
   */
  @Get('viewport')
  @UseGuards(JwtAuthGuard)
  async getViewport(
    @Query('x') x: string,
    @Query('y') y: string,
    @Query('zoom') zoom: string = '1'
  ) {
    const centerX = parseInt(x) || 0;
    const centerY = parseInt(y) || 0;
    const zoomLevel = parseInt(zoom) || 1;

    // Rayon de vue selon le zoom (zoom 1 = 10 cases, zoom 2 = 20 cases, etc.)
    const radius = 10 * zoomLevel;

    const minX = centerX - radius;
    const maxX = centerX + radius;
    const minY = centerY - radius;
    const maxY = centerY + radius;

    // Récupérer les villes dans la zone
    const cities = await this.prisma.city.findMany({
      where: {
        x: { gte: minX, lte: maxX },
        y: { gte: minY, lte: maxY },
      },
      select: {
        id: true,
        x: true,
        y: true,
        name: true,
        type: true,
        ownerId: true,
        isSieged: true,
        owner: {
          select: {
            name: true,
            faction: true,
          },
        },
      },
    });

    // Récupérer les nœuds de ressources dans la zone
    const resourceNodes = await this.prisma.resourceNode.findMany({
      where: {
        x: { gte: minX, lte: maxX },
        y: { gte: minY, lte: maxY },
      },
      select: {
        id: true,
        x: true,
        y: true,
        kind: true,
        level: true,
        filledPct: true,
        tribePower: true,
      },
    });

    // Récupérer les armées en mouvement dans la zone
    const armies = await this.prisma.army.findMany({
      where: {
        status: { in: ['MOVING', 'SIEGING', 'RETURNING'] },
        OR: [
          { x: { gte: minX, lte: maxX }, y: { gte: minY, lte: maxY } },
          { targetX: { gte: minX, lte: maxX }, targetY: { gte: minY, lte: maxY } },
        ],
      },
      select: {
        id: true,
        x: true,
        y: true,
        targetX: true,
        targetY: true,
        status: true,
        arrivalAt: true,
        ownerId: true,
        owner: {
          select: {
            name: true,
            faction: true,
          },
        },
      },
    });

    // Récupérer les tiles de terrain
    const tiles = await this.prisma.worldTile.findMany({
      where: {
        x: { gte: minX, lte: maxX },
        y: { gte: minY, lte: maxY },
      },
    });

    return {
      viewport: {
        centerX,
        centerY,
        zoom: zoomLevel,
        minX,
        maxX,
        minY,
        maxY,
      },
      cities: cities.map(c => ({
        id: c.id,
        x: c.x,
        y: c.y,
        name: c.name,
        type: c.type,
        isSieged: c.isSieged,
        owner: {
          id: c.ownerId,
          name: c.owner.name,
          faction: c.owner.faction,
        },
      })),
      resourceNodes: resourceNodes.map(n => ({
        id: n.id,
        x: n.x,
        y: n.y,
        kind: n.kind,
        level: n.level,
        filledPct: n.filledPct,
        tribePower: n.tribePower,
      })),
      armies: armies.map(a => ({
        id: a.id,
        x: a.x,
        y: a.y,
        targetX: a.targetX,
        targetY: a.targetY,
        status: a.status,
        arrivalAt: a.arrivalAt,
        owner: {
          id: a.ownerId,
          name: a.owner.name,
          faction: a.owner.faction,
        },
      })),
      tiles: tiles.map(t => ({
        x: t.x,
        y: t.y,
        terrain: t.terrain,
        passable: t.passable,
      })),
    };
  }

  /**
   * GET /map/search
   * Rechercher un joueur ou une ville sur la carte
   */
  @Get('search')
  @UseGuards(JwtAuthGuard)
  async search(@Query('q') query: string) {
    if (!query || query.length < 2) {
      return { results: [] };
    }

    // Rechercher des joueurs
    const players = await this.prisma.player.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
      },
      take: 5,
      select: {
        id: true,
        name: true,
        faction: true,
        cities: {
          take: 1,
          select: { x: true, y: true },
        },
      },
    });

    // Rechercher des villes
    const cities = await this.prisma.city.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
      },
      take: 5,
      select: {
        id: true,
        name: true,
        x: true,
        y: true,
        owner: {
          select: { name: true, faction: true },
        },
      },
    });

    return {
      results: [
        ...players.map(p => ({
          type: 'player',
          id: p.id,
          name: p.name,
          faction: p.faction,
          x: p.cities[0]?.x ?? 0,
          y: p.cities[0]?.y ?? 0,
        })),
        ...cities.map(c => ({
          type: 'city',
          id: c.id,
          name: c.name,
          ownerName: c.owner.name,
          faction: c.owner.faction,
          x: c.x,
          y: c.y,
        })),
      ],
    };
  }

  /**
   * GET /map/world-info
   * Informations générales sur le monde
   */
  @Get('world-info')
  async getWorldInfo() {
    const world = await this.prisma.worldState.findFirst();
    
    const playerCount = await this.prisma.player.count();
    const cityCount = await this.prisma.city.count();
    const nodeCount = await this.prisma.resourceNode.count();

    return {
      bounds: {
        minX: world?.minX ?? -100,
        maxX: world?.maxX ?? 100,
        minY: world?.minY ?? -100,
        maxY: world?.maxY ?? 100,
      },
      stats: {
        players: playerCount,
        cities: cityCount,
        resourceNodes: nodeCount,
      },
      joinDeadline: world?.joinDeadline,
      maxPlayers: world?.maxPlayers ?? 1000,
    };
  }
}

export default MapController;
