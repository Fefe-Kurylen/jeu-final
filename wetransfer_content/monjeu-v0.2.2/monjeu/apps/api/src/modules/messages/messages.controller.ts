import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_SUBJECT_LENGTH = 100;

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET INBOX
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('inbox')
  async getInbox(
    @CurrentPlayer() player: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total, unreadCount] = await Promise.all([
      this.prisma.playerMessage.findMany({
        where: { receiverId: player.playerId },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { id: true, name: true, faction: true } },
        },
      }),
      this.prisma.playerMessage.count({
        where: { receiverId: player.playerId },
      }),
      this.prisma.playerMessage.count({
        where: { receiverId: player.playerId, readAt: null },
      }),
    ]);

    return {
      messages: messages.map(m => ({
        id: m.id,
        subject: m.subject,
        preview: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
        sender: m.sender,
        createdAt: m.createdAt,
        isRead: m.readAt !== null,
      })),
      total,
      unreadCount,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SENT MESSAGES
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('sent')
  async getSent(
    @CurrentPlayer() player: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      this.prisma.playerMessage.findMany({
        where: { senderId: player.playerId },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          receiver: { select: { id: true, name: true, faction: true } },
        },
      }),
      this.prisma.playerMessage.count({
        where: { senderId: player.playerId },
      }),
    ]);

    return {
      messages: messages.map(m => ({
        id: m.id,
        subject: m.subject,
        preview: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
        receiver: m.receiver,
        createdAt: m.createdAt,
        readAt: m.readAt,
      })),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SINGLE MESSAGE
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id')
  async getMessage(
    @CurrentPlayer() player: any,
    @Param('id') messageId: string
  ) {
    const message = await this.prisma.playerMessage.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, name: true, faction: true } },
        receiver: { select: { id: true, name: true, faction: true } },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check access
    if (message.senderId !== player.playerId && message.receiverId !== player.playerId) {
      throw new ForbiddenException('Access denied');
    }

    // Mark as read if receiver viewing
    if (message.receiverId === player.playerId && !message.readAt) {
      await this.prisma.playerMessage.update({
        where: { id: messageId },
        data: { readAt: new Date() },
      });
    }

    return {
      id: message.id,
      subject: message.subject,
      content: message.content,
      sender: message.sender,
      receiver: message.receiver,
      createdAt: message.createdAt,
      readAt: message.readAt,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEND MESSAGE
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('send')
  async sendMessage(
    @CurrentPlayer() player: any,
    @Body() dto: {
      receiverName?: string;
      receiverId?: string;
      subject: string;
      content: string;
    }
  ) {
    // Validate
    if (!dto.subject || dto.subject.length === 0) {
      throw new BadRequestException('Subject required');
    }
    if (!dto.content || dto.content.length === 0) {
      throw new BadRequestException('Content required');
    }
    if (dto.subject.length > MAX_SUBJECT_LENGTH) {
      throw new BadRequestException(`Subject max ${MAX_SUBJECT_LENGTH} characters`);
    }
    if (dto.content.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Content max ${MAX_MESSAGE_LENGTH} characters`);
    }

    // Find receiver
    let receiver;
    if (dto.receiverId) {
      receiver = await this.prisma.player.findUnique({
        where: { id: dto.receiverId },
      });
    } else if (dto.receiverName) {
      receiver = await this.prisma.player.findFirst({
        where: { name: { equals: dto.receiverName, mode: 'insensitive' } },
      });
    } else {
      throw new BadRequestException('Receiver required');
    }

    if (!receiver) {
      throw new NotFoundException('Player not found');
    }

    if (receiver.id === player.playerId) {
      throw new BadRequestException('Cannot message yourself');
    }

    // Create message
    const message = await this.prisma.playerMessage.create({
      data: {
        senderId: player.playerId,
        receiverId: receiver.id,
        subject: dto.subject.trim(),
        content: dto.content.trim(),
      },
    });

    return {
      success: true,
      messageId: message.id,
      message: `Message envoyé à ${receiver.name}`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPLY TO MESSAGE
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/reply')
  async replyMessage(
    @CurrentPlayer() player: any,
    @Param('id') messageId: string,
    @Body() dto: { content: string }
  ) {
    const original = await this.prisma.playerMessage.findUnique({
      where: { id: messageId },
      include: { sender: true },
    });

    if (!original) {
      throw new NotFoundException('Message not found');
    }

    if (original.receiverId !== player.playerId) {
      throw new ForbiddenException('Can only reply to received messages');
    }

    if (!dto.content || dto.content.length === 0) {
      throw new BadRequestException('Content required');
    }
    if (dto.content.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Content max ${MAX_MESSAGE_LENGTH} characters`);
    }

    // Create reply
    const subject = original.subject.startsWith('Re: ')
      ? original.subject
      : `Re: ${original.subject}`;

    const reply = await this.prisma.playerMessage.create({
      data: {
        senderId: player.playerId,
        receiverId: original.senderId,
        subject: subject.substring(0, MAX_SUBJECT_LENGTH),
        content: dto.content.trim(),
      },
    });

    return {
      success: true,
      messageId: reply.id,
      message: `Réponse envoyée à ${original.sender.name}`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE MESSAGE
  // ═══════════════════════════════════════════════════════════════════════════

  @Delete(':id')
  async deleteMessage(
    @CurrentPlayer() player: any,
    @Param('id') messageId: string
  ) {
    const message = await this.prisma.playerMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== player.playerId && message.receiverId !== player.playerId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.playerMessage.delete({
      where: { id: messageId },
    });

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARK ALL AS READ
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('mark-all-read')
  async markAllRead(@CurrentPlayer() player: any) {
    const result = await this.prisma.playerMessage.updateMany({
      where: {
        receiverId: player.playerId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { success: true, count: result.count };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET UNREAD COUNT
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('unread/count')
  async getUnreadCount(@CurrentPlayer() player: any) {
    const count = await this.prisma.playerMessage.count({
      where: {
        receiverId: player.playerId,
        readAt: null,
      },
    });

    return { unreadCount: count };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH PLAYERS (for autocomplete)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('players/search')
  async searchPlayers(
    @CurrentPlayer() player: any,
    @Query('q') query: string
  ) {
    if (!query || query.length < 2) {
      return { players: [] };
    }

    const players = await this.prisma.player.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
        id: { not: player.playerId },
      },
      take: 10,
      select: { id: true, name: true, faction: true },
    });

    return { players };
  }
}

export default MessagesController;
