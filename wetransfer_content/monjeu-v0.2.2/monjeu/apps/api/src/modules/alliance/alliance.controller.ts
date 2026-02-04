import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

@Controller('alliance')
@UseGuards(JwtAuthGuard)
export class AllianceController {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE ALLIANCE
  // ═══════════════════════════════════════════════════════════════════════════
  
  @Post('create')
  async createAlliance(
    @CurrentPlayer() player: any,
    @Body() dto: { tag: string; name: string; description?: string }
  ) {
    // Check if player already in alliance
    const existing = await this.prisma.allianceMember.findUnique({
      where: { playerId: player.id },
    });
    if (existing) {
      throw new BadRequestException('You are already in an alliance');
    }

    // Validate tag (3-5 uppercase letters)
    if (!/^[A-Z]{3,5}$/.test(dto.tag)) {
      throw new BadRequestException('Tag must be 3-5 uppercase letters');
    }

    // Create alliance with player as leader
    const alliance = await this.prisma.alliance.create({
      data: {
        tag: dto.tag,
        name: dto.name,
        description: dto.description || '',
        totalMembers: 1,
        totalPopulation: player.population,
        members: {
          create: {
            playerId: player.id,
            role: 'LEADER',
          },
        },
      },
      include: { members: true },
    });

    return alliance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ALLIANCE INFO
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id')
  async getAlliance(@Param('id') id: string) {
    const alliance = await this.prisma.alliance.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            player: {
              select: { id: true, name: true, population: true, faction: true },
            },
          },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        },
        diplomacy: {
          include: { allianceTo: { select: { id: true, tag: true, name: true } } },
        },
      },
    });

    if (!alliance) throw new NotFoundException('Alliance not found');
    return alliance;
  }

  @Get('tag/:tag')
  async getAllianceByTag(@Param('tag') tag: string) {
    const alliance = await this.prisma.alliance.findUnique({
      where: { tag: tag.toUpperCase() },
      include: {
        members: {
          include: {
            player: { select: { id: true, name: true, population: true } },
          },
        },
      },
    });

    if (!alliance) throw new NotFoundException('Alliance not found');
    return alliance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST ALLIANCES
  // ═══════════════════════════════════════════════════════════════════════════

  @Get()
  async listAlliances(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('sort') sort: string = 'totalPopulation'
  ) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [alliances, total] = await Promise.all([
      this.prisma.alliance.findMany({
        skip,
        take: parseInt(limit),
        orderBy: { [sort]: 'desc' },
        select: {
          id: true,
          tag: true,
          name: true,
          totalMembers: true,
          totalPopulation: true,
          isOpen: true,
        },
      }),
      this.prisma.alliance.count(),
    ]);

    return { alliances, total, page: parseInt(page), limit: parseInt(limit) };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVITE PLAYER
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/invite')
  async invitePlayer(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string,
    @Body() dto: { playerName: string }
  ) {
    // Check caller is officer+
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id, role: { in: ['LEADER', 'OFFICER'] } },
    });
    if (!membership) throw new ForbiddenException('Only officers can invite');

    // Find target player
    const target = await this.prisma.player.findUnique({
      where: { name: dto.playerName },
      include: { allianceMembership: true },
    });
    if (!target) throw new NotFoundException('Player not found');
    if (target.allianceMembership) {
      throw new BadRequestException('Player already in an alliance');
    }

    // Create invite (expires in 7 days)
    const invite = await this.prisma.allianceInvite.upsert({
      where: { allianceId_playerId: { allianceId, playerId: target.id } },
      update: {
        invitedBy: player.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      create: {
        allianceId,
        playerId: target.id,
        invitedBy: player.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return invite;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCEPT INVITE / JOIN
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/join')
  async joinAlliance(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string
  ) {
    // Check not already in alliance
    const existing = await this.prisma.allianceMember.findUnique({
      where: { playerId: player.id },
    });
    if (existing) throw new BadRequestException('Already in an alliance');

    const alliance = await this.prisma.alliance.findUnique({
      where: { id: allianceId },
    });
    if (!alliance) throw new NotFoundException('Alliance not found');

    // Check for invite or open alliance
    const invite = await this.prisma.allianceInvite.findUnique({
      where: { allianceId_playerId: { allianceId, playerId: player.id } },
    });

    if (!invite && !alliance.isOpen) {
      throw new ForbiddenException('Invitation required');
    }

    if (!alliance.isOpen && player.population < alliance.minPopulation) {
      throw new ForbiddenException('Population too low');
    }

    // Join alliance
    await this.prisma.$transaction([
      this.prisma.allianceMember.create({
        data: { allianceId, playerId: player.id, role: 'MEMBER' },
      }),
      this.prisma.alliance.update({
        where: { id: allianceId },
        data: {
          totalMembers: { increment: 1 },
          totalPopulation: { increment: player.population },
        },
      }),
      // Delete invite if exists
      ...(invite ? [this.prisma.allianceInvite.delete({ where: { id: invite.id } })] : []),
    ]);

    return { success: true, allianceId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE ALLIANCE
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('leave')
  async leaveAlliance(@CurrentPlayer() player: any) {
    const membership = await this.prisma.allianceMember.findUnique({
      where: { playerId: player.id },
      include: { alliance: true },
    });
    if (!membership) throw new BadRequestException('Not in an alliance');

    if (membership.role === 'LEADER') {
      // Check if there are other members
      const memberCount = await this.prisma.allianceMember.count({
        where: { allianceId: membership.allianceId },
      });
      
      if (memberCount > 1) {
        throw new BadRequestException('Transfer leadership first or disband');
      }
      
      // Last member - disband alliance
      await this.prisma.$transaction([
        this.prisma.allianceMember.delete({ where: { id: membership.id } }),
        this.prisma.allianceInvite.deleteMany({ where: { allianceId: membership.allianceId } }),
        this.prisma.allianceMessage.deleteMany({ where: { allianceId: membership.allianceId } }),
        this.prisma.allianceDiplomacy.deleteMany({
          where: { OR: [{ allianceFromId: membership.allianceId }, { allianceToId: membership.allianceId }] },
        }),
        this.prisma.alliance.delete({ where: { id: membership.allianceId } }),
      ]);
    } else {
      // Regular member leaving
      await this.prisma.$transaction([
        this.prisma.allianceMember.delete({ where: { id: membership.id } }),
        this.prisma.alliance.update({
          where: { id: membership.allianceId },
          data: {
            totalMembers: { decrement: 1 },
            totalPopulation: { decrement: player.population },
          },
        }),
      ]);
    }

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KICK MEMBER
  // ═══════════════════════════════════════════════════════════════════════════

  @Delete(':id/member/:memberId')
  async kickMember(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string,
    @Param('memberId') memberId: string
  ) {
    const callerMembership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id },
    });
    if (!callerMembership || callerMembership.role === 'MEMBER') {
      throw new ForbiddenException('Only officers can kick');
    }

    const targetMembership = await this.prisma.allianceMember.findUnique({
      where: { id: memberId },
      include: { player: true },
    });
    if (!targetMembership || targetMembership.allianceId !== allianceId) {
      throw new NotFoundException('Member not found');
    }

    // Can't kick leader or self
    if (targetMembership.role === 'LEADER') {
      throw new ForbiddenException('Cannot kick the leader');
    }
    if (targetMembership.playerId === player.id) {
      throw new BadRequestException('Use /leave instead');
    }
    // Officers can't kick other officers
    if (targetMembership.role === 'OFFICER' && callerMembership.role !== 'LEADER') {
      throw new ForbiddenException('Only leader can kick officers');
    }

    await this.prisma.$transaction([
      this.prisma.allianceMember.delete({ where: { id: memberId } }),
      this.prisma.alliance.update({
        where: { id: allianceId },
        data: {
          totalMembers: { decrement: 1 },
          totalPopulation: { decrement: targetMembership.player.population },
        },
      }),
    ]);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMOTE/DEMOTE
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/member/:memberId/role')
  async setMemberRole(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { role: 'OFFICER' | 'MEMBER' }
  ) {
    const callerMembership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id, role: 'LEADER' },
    });
    if (!callerMembership) throw new ForbiddenException('Only leader can change roles');

    const targetMembership = await this.prisma.allianceMember.findUnique({
      where: { id: memberId },
    });
    if (!targetMembership || targetMembership.allianceId !== allianceId) {
      throw new NotFoundException('Member not found');
    }
    if (targetMembership.role === 'LEADER') {
      throw new BadRequestException('Cannot change leader role this way');
    }

    await this.prisma.allianceMember.update({
      where: { id: memberId },
      data: { role: dto.role },
    });

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFER LEADERSHIP
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/transfer')
  async transferLeadership(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string,
    @Body() dto: { newLeaderId: string }
  ) {
    const callerMembership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id, role: 'LEADER' },
    });
    if (!callerMembership) throw new ForbiddenException('Only leader can transfer');

    const targetMembership = await this.prisma.allianceMember.findUnique({
      where: { id: dto.newLeaderId },
    });
    if (!targetMembership || targetMembership.allianceId !== allianceId) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.$transaction([
      this.prisma.allianceMember.update({
        where: { id: callerMembership.id },
        data: { role: 'OFFICER' },
      }),
      this.prisma.allianceMember.update({
        where: { id: dto.newLeaderId },
        data: { role: 'LEADER' },
      }),
    ]);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIPLOMACY
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/diplomacy')
  async setDiplomacy(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string,
    @Body() dto: { targetAllianceId: string; status: 'ALLY' | 'NEUTRAL' | 'ENEMY' | 'NAP' }
  ) {
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id, role: { in: ['LEADER', 'OFFICER'] } },
    });
    if (!membership) throw new ForbiddenException('Only officers can set diplomacy');

    if (allianceId === dto.targetAllianceId) {
      throw new BadRequestException('Cannot set diplomacy with self');
    }

    const target = await this.prisma.alliance.findUnique({ where: { id: dto.targetAllianceId } });
    if (!target) throw new NotFoundException('Target alliance not found');

    await this.prisma.allianceDiplomacy.upsert({
      where: {
        allianceFromId_allianceToId: {
          allianceFromId: allianceId,
          allianceToId: dto.targetAllianceId,
        },
      },
      update: { status: dto.status },
      create: {
        allianceFromId: allianceId,
        allianceToId: dto.targetAllianceId,
        status: dto.status,
      },
    });

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALLIANCE CHAT
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id/messages')
  async getMessages(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string,
    @Query('limit') limit: string = '50'
  ) {
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id },
    });
    if (!membership) throw new ForbiddenException('Not a member');

    const messages = await this.prisma.allianceMessage.findMany({
      where: { allianceId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    return messages.reverse();
  }

  @Post(':id/messages')
  async sendMessage(
    @CurrentPlayer() player: any,
    @Param('id') allianceId: string,
    @Body() dto: { content: string }
  ) {
    const membership = await this.prisma.allianceMember.findFirst({
      where: { allianceId, playerId: player.id },
    });
    if (!membership) throw new ForbiddenException('Not a member');

    if (!dto.content || dto.content.length > 500) {
      throw new BadRequestException('Message must be 1-500 characters');
    }

    const message = await this.prisma.allianceMessage.create({
      data: {
        allianceId,
        senderId: player.id,
        content: dto.content,
      },
    });

    return message;
  }
}
