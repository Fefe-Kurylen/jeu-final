import { Controller, Post, Body, Get, UseGuards, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES = '7d';

// DTOs
interface RegisterDto {
  email: string;
  password: string;
  name: string;
  faction: 'ROME' | 'GAUL' | 'GREEK' | 'EGYPT' | 'HUN' | 'SULTAN';
}

interface LoginDto {
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService) {}

  /**
   * POST /auth/register
   * Créer un nouveau compte + joueur
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    // Validation
    if (!dto.email || !dto.password || !dto.name || !dto.faction) {
      throw new BadRequestException('Missing required fields: email, password, name, faction');
    }

    if (dto.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    if (dto.name.length < 3 || dto.name.length > 20) {
      throw new BadRequestException('Name must be between 3 and 20 characters');
    }

    const validFactions = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
    if (!validFactions.includes(dto.faction)) {
      throw new BadRequestException(`Invalid faction. Must be one of: ${validFactions.join(', ')}`);
    }

    // Check if email already exists
    const existingAccount = await this.prisma.account.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingAccount) {
      throw new BadRequestException('Email already registered');
    }

    // Check if name already exists
    const existingPlayer = await this.prisma.player.findUnique({
      where: { name: dto.name },
    });
    if (existingPlayer) {
      throw new BadRequestException('Player name already taken');
    }

    // Hash password
    const passHash = await bcrypt.hash(dto.password, 10);

    // Create account + player in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          email: dto.email.toLowerCase(),
          passHash,
        },
      });

      const player = await tx.player.create({
        data: {
          accountId: account.id,
          name: dto.name,
          faction: dto.faction,
        },
      });

      return { account, player };
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        accountId: result.account.id, 
        playerId: result.player.id,
        faction: result.player.faction,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return {
      success: true,
      token,
      player: {
        id: result.player.id,
        name: result.player.name,
        faction: result.player.faction,
      },
    };
  }

  /**
   * POST /auth/login
   * Connexion avec email/password
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Missing email or password');
    }

    const account = await this.prisma.account.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { player: true },
    });

    if (!account) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, account.passHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!account.player) {
      throw new UnauthorizedException('No player associated with this account');
    }

    const token = jwt.sign(
      {
        accountId: account.id,
        playerId: account.player.id,
        faction: account.player.faction,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return {
      success: true,
      token,
      player: {
        id: account.player.id,
        name: account.player.name,
        faction: account.player.faction,
        population: account.player.population,
      },
    };
  }

  /**
   * GET /auth/me
   * Obtenir les infos du joueur connecté
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    const playerId = req.user?.playerId;
    if (!playerId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        cities: {
          select: {
            id: true,
            name: true,
            type: true,
            x: true,
            y: true,
          },
        },
        hero: true,
      },
    });

    if (!player) {
      throw new UnauthorizedException('Player not found');
    }

    return {
      id: player.id,
      name: player.name,
      faction: player.faction,
      population: player.population,
      cities: player.cities,
      hero: player.hero ? {
        id: player.hero.id,
        level: player.hero.level,
        xp: player.hero.xp,
        atkPoints: player.hero.atkPoints,
        defPoints: player.hero.defPoints,
        logPoints: player.hero.logPoints,
        spdPoints: player.hero.spdPoints,
      } : null,
    };
  }

  /**
   * POST /auth/refresh
   * Rafraîchir le token JWT
   */
  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(@Req() req: any) {
    const { accountId, playerId, faction } = req.user;

    const token = jwt.sign(
      { accountId, playerId, faction },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return { token };
  }
}

export default AuthController;
