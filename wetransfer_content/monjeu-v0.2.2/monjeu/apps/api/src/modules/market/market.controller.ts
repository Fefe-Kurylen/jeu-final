import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

const VALID_RESOURCES = ['wood', 'stone', 'iron', 'food'];
const MIN_TRADE_AMOUNT = 100;
const MAX_TRADE_AMOUNT = 100000;

@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST OFFERS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('offers')
  async listOffers(
    @Query('offerType') offerType?: string,
    @Query('wantType') wantType?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50'
  ) {
    const where: any = { status: 'OPEN' };
    
    if (offerType && VALID_RESOURCES.includes(offerType)) {
      where.offerType = offerType;
    }
    if (wantType && VALID_RESOURCES.includes(wantType)) {
      where.wantType = wantType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [offers, total] = await Promise.all([
      this.prisma.marketOffer.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketOffer.count({ where }),
    ]);

    // Calculate exchange rates for display
    const offersWithRates = offers.map(o => ({
      ...o,
      rate: (o.wantAmount / o.offerAmount).toFixed(2),
    }));

    return { offers: offersWithRates, total, page: parseInt(page) };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MY OFFERS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('my-offers')
  async myOffers(@CurrentPlayer() player: any) {
    const offers = await this.prisma.marketOffer.findMany({
      where: { sellerId: player.id },
      orderBy: { createdAt: 'desc' },
    });

    return offers;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE OFFER
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('offer')
  async createOffer(
    @CurrentPlayer() player: any,
    @Body() dto: {
      cityId: string;
      offerType: string;
      offerAmount: number;
      wantType: string;
      wantAmount: number;
    }
  ) {
    // Validate resource types
    if (!VALID_RESOURCES.includes(dto.offerType)) {
      throw new BadRequestException('Invalid offer type');
    }
    if (!VALID_RESOURCES.includes(dto.wantType)) {
      throw new BadRequestException('Invalid want type');
    }
    if (dto.offerType === dto.wantType) {
      throw new BadRequestException('Cannot trade same resource');
    }

    // Validate amounts
    if (dto.offerAmount < MIN_TRADE_AMOUNT || dto.offerAmount > MAX_TRADE_AMOUNT) {
      throw new BadRequestException(`Amount must be between ${MIN_TRADE_AMOUNT} and ${MAX_TRADE_AMOUNT}`);
    }
    if (dto.wantAmount < MIN_TRADE_AMOUNT || dto.wantAmount > MAX_TRADE_AMOUNT) {
      throw new BadRequestException(`Amount must be between ${MIN_TRADE_AMOUNT} and ${MAX_TRADE_AMOUNT}`);
    }

    // Check city ownership and resources
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
    if (!city || city.ownerId !== player.id) {
      throw new ForbiddenException('City not found or not yours');
    }

    const currentResource = city[dto.offerType as keyof typeof city] as number;
    if (currentResource < dto.offerAmount) {
      throw new BadRequestException(`Not enough ${dto.offerType}`);
    }

    // Check for market building
    const market = await this.prisma.cityBuilding.findFirst({
      where: { cityId: dto.cityId, key: 'MARKET' },
    });
    if (!market) {
      throw new BadRequestException('Build a Market first');
    }

    // Deduct resources and create offer
    await this.prisma.$transaction([
      this.prisma.city.update({
        where: { id: dto.cityId },
        data: { [dto.offerType]: { decrement: dto.offerAmount } },
      }),
      this.prisma.marketOffer.create({
        data: {
          sellerId: player.id,
          sellerCityId: dto.cityId,
          offerType: dto.offerType,
          offerAmount: dto.offerAmount,
          wantType: dto.wantType,
          wantAmount: dto.wantAmount,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      }),
    ]);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCEPT OFFER
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('offer/:id/accept')
  async acceptOffer(
    @CurrentPlayer() player: any,
    @Param('id') offerId: string,
    @Body() dto: { cityId: string }
  ) {
    const offer = await this.prisma.marketOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.status !== 'OPEN') {
      throw new NotFoundException('Offer not found or already completed');
    }

    if (offer.sellerId === player.id) {
      throw new BadRequestException('Cannot accept your own offer');
    }

    // Check buyer's city
    const buyerCity = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
    if (!buyerCity || buyerCity.ownerId !== player.id) {
      throw new ForbiddenException('City not found or not yours');
    }

    // Check buyer has resources
    const buyerResource = buyerCity[offer.wantType as keyof typeof buyerCity] as number;
    if (buyerResource < offer.wantAmount) {
      throw new BadRequestException(`Not enough ${offer.wantType}`);
    }

    // Get seller's city
    const sellerCity = await this.prisma.city.findUnique({ where: { id: offer.sellerCityId } });
    if (!sellerCity) {
      // Seller city gone - cancel offer and refund
      await this.prisma.marketOffer.update({
        where: { id: offerId },
        data: { status: 'CANCELLED' },
      });
      throw new BadRequestException('Seller city no longer exists');
    }

    // Execute trade
    await this.prisma.$transaction([
      // Buyer pays
      this.prisma.city.update({
        where: { id: dto.cityId },
        data: { 
          [offer.wantType]: { decrement: offer.wantAmount },
          [offer.offerType]: { increment: offer.offerAmount },
        },
      }),
      // Seller receives
      this.prisma.city.update({
        where: { id: offer.sellerCityId },
        data: { [offer.wantType]: { increment: offer.wantAmount } },
      }),
      // Mark offer completed
      this.prisma.marketOffer.update({
        where: { id: offerId },
        data: { status: 'COMPLETED' },
      }),
      // Record history
      this.prisma.tradeHistory.create({
        data: {
          offerId: offer.id,
          sellerId: offer.sellerId,
          buyerId: player.id,
          offerType: offer.offerType,
          offerAmount: offer.offerAmount,
          wantType: offer.wantType,
          wantAmount: offer.wantAmount,
        },
      }),
    ]);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCEL OFFER
  // ═══════════════════════════════════════════════════════════════════════════

  @Delete('offer/:id')
  async cancelOffer(
    @CurrentPlayer() player: any,
    @Param('id') offerId: string
  ) {
    const offer = await this.prisma.marketOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.sellerId !== player.id) throw new ForbiddenException('Not your offer');
    if (offer.status !== 'OPEN') {
      throw new BadRequestException('Offer already completed or cancelled');
    }

    // Refund resources
    await this.prisma.$transaction([
      this.prisma.city.update({
        where: { id: offer.sellerCityId },
        data: { [offer.offerType]: { increment: offer.offerAmount } },
      }),
      this.prisma.marketOffer.update({
        where: { id: offerId },
        data: { status: 'CANCELLED' },
      }),
    ]);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRADE HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('history')
  async tradeHistory(
    @CurrentPlayer() player: any,
    @Query('limit') limit: string = '50'
  ) {
    const history = await this.prisma.tradeHistory.findMany({
      where: {
        OR: [{ sellerId: player.id }, { buyerId: player.id }],
      },
      orderBy: { completedAt: 'desc' },
      take: parseInt(limit),
    });

    return history;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKET RATES (average exchange rates)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('rates')
  async marketRates() {
    const rates: Record<string, Record<string, number>> = {};

    for (const from of VALID_RESOURCES) {
      rates[from] = {};
      for (const to of VALID_RESOURCES) {
        if (from === to) {
          rates[from][to] = 1;
          continue;
        }

        // Get average rate from recent trades
        const recentTrades = await this.prisma.tradeHistory.findMany({
          where: { offerType: from, wantType: to },
          orderBy: { completedAt: 'desc' },
          take: 20,
        });

        if (recentTrades.length > 0) {
          const avgRate = recentTrades.reduce((sum, t) => sum + t.wantAmount / t.offerAmount, 0) / recentTrades.length;
          rates[from][to] = parseFloat(avgRate.toFixed(3));
        } else {
          // Default rates if no trades
          rates[from][to] = 1;
        }
      }
    }

    return rates;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER MARKET (NPC) - INSTANT TRADES WITH TAX
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('server/exchange')
  async serverExchange(
    @CurrentPlayer() player: any,
    @Body() dto: {
      cityId: string;
      sellType: string;
      sellAmount: number;
      buyType: string;
    }
  ) {
    // Validate resource types
    if (!VALID_RESOURCES.includes(dto.sellType)) {
      throw new BadRequestException('Invalid sell type');
    }
    if (!VALID_RESOURCES.includes(dto.buyType)) {
      throw new BadRequestException('Invalid buy type');
    }
    if (dto.sellType === dto.buyType) {
      throw new BadRequestException('Cannot exchange same resource');
    }

    // Validate amount
    if (dto.sellAmount < MIN_TRADE_AMOUNT) {
      throw new BadRequestException(`Minimum ${MIN_TRADE_AMOUNT} resources`);
    }

    // Check city and market
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
      include: { buildings: true },
    });
    if (!city || city.ownerId !== player.id) {
      throw new ForbiddenException('City not found or not yours');
    }

    const market = city.buildings.find(b => b.key === 'MARKET');
    if (!market) {
      throw new BadRequestException('Build a Market first');
    }

    // Check resources
    const currentResource = city[dto.sellType as keyof typeof city] as number;
    if (currentResource < dto.sellAmount) {
      throw new BadRequestException(`Not enough ${dto.sellType}`);
    }

    // Calculate tax based on market level
    // Base tax: 30%, -1% per level, min 10%
    const baseTax = 30;
    const taxReduction = market.level * 1;
    const taxPercent = Math.max(10, baseTax - taxReduction);
    const tax = dto.sellAmount * (taxPercent / 100);
    const afterTax = dto.sellAmount - tax;

    // Server gives 1:1 exchange rate after tax
    const buyAmount = Math.floor(afterTax);

    // Check storage capacity
    const currentBuyResource = city[dto.buyType as keyof typeof city] as number;
    const maxStorage = dto.buyType === 'food' ? city.maxFoodStorage : city.maxStorage;
    if (currentBuyResource + buyAmount > maxStorage) {
      throw new BadRequestException(`Not enough storage for ${dto.buyType}`);
    }

    // Execute exchange
    await this.prisma.city.update({
      where: { id: dto.cityId },
      data: {
        [dto.sellType]: { decrement: dto.sellAmount },
        [dto.buyType]: { increment: buyAmount },
      },
    });

    // Record in trade history
    await this.prisma.tradeHistory.create({
      data: {
        offerId: 'SERVER',
        sellerId: 'SERVER',
        buyerId: player.id,
        offerType: dto.buyType,
        offerAmount: buyAmount,
        wantType: dto.sellType,
        wantAmount: dto.sellAmount,
      },
    });

    return {
      success: true,
      sold: { type: dto.sellType, amount: dto.sellAmount },
      received: { type: dto.buyType, amount: buyAmount },
      tax: { percent: taxPercent, amount: Math.floor(tax) },
      marketLevel: market.level,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRADE ROUTES (Auto-transfer between own cities)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('routes')
  async listRoutes(@CurrentPlayer() player: any) {
    const routes = await this.prisma.tradeRoute.findMany({
      where: { playerId: player.id },
      orderBy: { createdAt: 'desc' },
    });

    // Get city names
    const cityIds = [...new Set(routes.flatMap(r => [r.fromCityId, r.toCityId]))];
    const cities = await this.prisma.city.findMany({
      where: { id: { in: cityIds } },
      select: { id: true, name: true },
    });
    const cityMap = new Map(cities.map(c => [c.id, c.name]));

    return routes.map(r => ({
      ...r,
      fromCityName: cityMap.get(r.fromCityId) || 'Unknown',
      toCityName: cityMap.get(r.toCityId) || 'Unknown',
    }));
  }

  @Post('routes')
  async createRoute(
    @CurrentPlayer() player: any,
    @Body() dto: {
      fromCityId: string;
      toCityId: string;
      resourceType: string;
      percentage?: number;
      intervalHours?: number;
    }
  ) {
    // Validate resource type
    if (!VALID_RESOURCES.includes(dto.resourceType)) {
      throw new BadRequestException('Invalid resource type');
    }

    // Validate cities belong to player
    const [fromCity, toCity] = await Promise.all([
      this.prisma.city.findUnique({ where: { id: dto.fromCityId } }),
      this.prisma.city.findUnique({ where: { id: dto.toCityId } }),
    ]);

    if (!fromCity || fromCity.ownerId !== player.id) {
      throw new ForbiddenException('Source city not found or not yours');
    }
    if (!toCity || toCity.ownerId !== player.id) {
      throw new ForbiddenException('Destination city not found or not yours');
    }
    if (dto.fromCityId === dto.toCityId) {
      throw new BadRequestException('Cannot create route to same city');
    }

    // Validate percentage (1-30%)
    const percentage = Math.min(30, Math.max(1, dto.percentage || 5));
    const intervalHours = Math.min(24, Math.max(1, dto.intervalHours || 2));

    // Check max routes (limit 10 per player)
    const routeCount = await this.prisma.tradeRoute.count({
      where: { playerId: player.id },
    });
    if (routeCount >= 10) {
      throw new BadRequestException('Max 10 trade routes');
    }

    // Create or update route
    const route = await this.prisma.tradeRoute.upsert({
      where: {
        fromCityId_toCityId_resourceType: {
          fromCityId: dto.fromCityId,
          toCityId: dto.toCityId,
          resourceType: dto.resourceType,
        },
      },
      update: { percentage, intervalHours, isActive: true },
      create: {
        playerId: player.id,
        fromCityId: dto.fromCityId,
        toCityId: dto.toCityId,
        resourceType: dto.resourceType,
        percentage,
        intervalHours,
      },
    });

    return route;
  }

  @Post('routes/:id/toggle')
  async toggleRoute(
    @CurrentPlayer() player: any,
    @Param('id') routeId: string
  ) {
    const route = await this.prisma.tradeRoute.findUnique({ where: { id: routeId } });
    if (!route || route.playerId !== player.id) {
      throw new NotFoundException('Route not found');
    }

    const updated = await this.prisma.tradeRoute.update({
      where: { id: routeId },
      data: { isActive: !route.isActive },
    });

    return updated;
  }

  @Delete('routes/:id')
  async deleteRoute(
    @CurrentPlayer() player: any,
    @Param('id') routeId: string
  ) {
    const route = await this.prisma.tradeRoute.findUnique({ where: { id: routeId } });
    if (!route || route.playerId !== player.id) {
      throw new NotFoundException('Route not found');
    }

    await this.prisma.tradeRoute.delete({ where: { id: routeId } });
    return { success: true };
  }
}
