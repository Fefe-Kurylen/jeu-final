import { Controller, Get, Post, Param, Query, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

// ============================================================================
// QUEST DEFINITIONS
// ============================================================================

const QUEST_DEFINITIONS = {
  // Daily Quests
  DAILY_BUILD_1: {
    id: 'DAILY_BUILD_1',
    type: 'DAILY',
    name: 'Constructeur du jour',
    description: 'Terminer 1 construction',
    target: 1,
    targetType: 'BUILD',
    rewards: { wood: 500, stone: 500, iron: 500, food: 500, xp: 10 },
  },
  DAILY_RECRUIT_10: {
    id: 'DAILY_RECRUIT_10',
    type: 'DAILY',
    name: 'Recruteur du jour',
    description: 'Recruter 10 unités',
    target: 10,
    targetType: 'RECRUIT',
    rewards: { wood: 300, stone: 300, iron: 300, food: 1000, xp: 15 },
  },
  DAILY_ATTACK_1: {
    id: 'DAILY_ATTACK_1',
    type: 'DAILY',
    name: 'Guerrier du jour',
    description: 'Lancer 1 attaque',
    target: 1,
    targetType: 'ATTACK',
    rewards: { wood: 200, stone: 200, iron: 500, food: 300, xp: 20 },
  },
  DAILY_EXPEDITION_1: {
    id: 'DAILY_EXPEDITION_1',
    type: 'DAILY',
    name: 'Explorateur du jour',
    description: 'Compléter 1 expédition',
    target: 1,
    targetType: 'EXPEDITION',
    rewards: { wood: 400, stone: 400, iron: 400, food: 400, xp: 25 },
  },

  // Weekly Quests
  WEEKLY_BUILD_10: {
    id: 'WEEKLY_BUILD_10',
    type: 'WEEKLY',
    name: 'Maître bâtisseur',
    description: 'Terminer 10 constructions',
    target: 10,
    targetType: 'BUILD',
    rewards: { wood: 5000, stone: 5000, iron: 5000, food: 5000, xp: 100 },
  },
  WEEKLY_RECRUIT_100: {
    id: 'WEEKLY_RECRUIT_100',
    type: 'WEEKLY',
    name: 'Commandant',
    description: 'Recruter 100 unités',
    target: 100,
    targetType: 'RECRUIT',
    rewards: { wood: 3000, stone: 3000, iron: 3000, food: 10000, xp: 150 },
  },
  WEEKLY_ATTACK_10: {
    id: 'WEEKLY_ATTACK_10',
    type: 'WEEKLY',
    name: 'Conquérant',
    description: 'Lancer 10 attaques',
    target: 10,
    targetType: 'ATTACK',
    rewards: { wood: 2000, stone: 2000, iron: 5000, food: 3000, xp: 200 },
  },
  WEEKLY_EXPEDITION_5: {
    id: 'WEEKLY_EXPEDITION_5',
    type: 'WEEKLY',
    name: 'Aventurier',
    description: 'Compléter 5 expéditions',
    target: 5,
    targetType: 'EXPEDITION',
    rewards: { wood: 4000, stone: 4000, iron: 4000, food: 4000, xp: 250 },
  },

  // Achievement Quests (one-time)
  ACH_FIRST_BUILD: {
    id: 'ACH_FIRST_BUILD',
    type: 'ACHIEVEMENT',
    name: 'Premiers pas',
    description: 'Construire votre premier bâtiment',
    target: 1,
    targetType: 'BUILD',
    rewards: { wood: 1000, stone: 1000, iron: 1000, food: 1000, xp: 50 },
  },
  ACH_POPULATION_100: {
    id: 'ACH_POPULATION_100',
    type: 'ACHIEVEMENT',
    name: 'Village prospère',
    description: 'Atteindre 100 de population',
    target: 100,
    targetType: 'POPULATION',
    rewards: { wood: 2000, stone: 2000, iron: 2000, food: 2000, xp: 100 },
  },
  ACH_JOIN_ALLIANCE: {
    id: 'ACH_JOIN_ALLIANCE',
    type: 'ACHIEVEMENT',
    name: 'Force collective',
    description: 'Rejoindre une alliance',
    target: 1,
    targetType: 'ALLIANCE',
    rewards: { wood: 1500, stone: 1500, iron: 1500, food: 1500, xp: 75 },
  },
  ACH_HERO_LEVEL_5: {
    id: 'ACH_HERO_LEVEL_5',
    type: 'ACHIEVEMENT',
    name: 'Héros confirmé',
    description: 'Atteindre niveau 5 avec votre héros',
    target: 5,
    targetType: 'HERO_LEVEL',
    rewards: { wood: 3000, stone: 3000, iron: 3000, food: 3000, xp: 200 },
  },
};

@Controller('quests')
@UseGuards(JwtAuthGuard)
export class QuestController {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ALL QUESTS WITH PROGRESS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get()
  async getQuests(@CurrentPlayer() player: any) {
    // Get player's quest progress
    const playerQuests = await this.prisma.playerQuest.findMany({
      where: { playerId: player.playerId },
    });

    const questMap = new Map(playerQuests.map(pq => [pq.questId, pq]));

    // Build quest list with progress
    const quests = Object.values(QUEST_DEFINITIONS).map(def => {
      const progress = questMap.get(def.id);
      return {
        ...def,
        progress: progress?.progress || 0,
        completed: progress?.completedAt !== null,
        claimed: progress?.claimedAt !== null,
        completedAt: progress?.completedAt,
        claimedAt: progress?.claimedAt,
      };
    });

    // Group by type
    return {
      daily: quests.filter(q => q.type === 'DAILY'),
      weekly: quests.filter(q => q.type === 'WEEKLY'),
      achievements: quests.filter(q => q.type === 'ACHIEVEMENT'),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAIM QUEST REWARD
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':questId/claim')
  async claimQuest(
    @CurrentPlayer() player: any,
    @Param('questId') questId: string
  ) {
    const questDef = QUEST_DEFINITIONS[questId];
    if (!questDef) {
      throw new NotFoundException('Quest not found');
    }

    // Get player quest progress
    const playerQuest = await this.prisma.playerQuest.findUnique({
      where: {
        playerId_questId: {
          playerId: player.playerId,
          questId,
        },
      },
    });

    if (!playerQuest) {
      throw new BadRequestException('Quest not started');
    }

    if (!playerQuest.completedAt) {
      throw new BadRequestException('Quest not completed yet');
    }

    if (playerQuest.claimedAt) {
      throw new BadRequestException('Reward already claimed');
    }

    // Get player's capital city
    const city = await this.prisma.city.findFirst({
      where: { ownerId: player.playerId, type: 'CAPITAL' },
    });

    if (!city) {
      throw new BadRequestException('No capital found');
    }

    // Apply rewards
    const rewards = questDef.rewards;

    await this.prisma.$transaction(async (tx) => {
      // Add resources to city
      await tx.city.update({
        where: { id: city.id },
        data: {
          wood: { increment: rewards.wood || 0 },
          stone: { increment: rewards.stone || 0 },
          iron: { increment: rewards.iron || 0 },
          food: { increment: rewards.food || 0 },
        },
      });

      // Add XP to hero
      if (rewards.xp) {
        const hero = await tx.hero.findFirst({
          where: { ownerId: player.playerId },
        });

        if (hero) {
          const newXp = hero.xp + rewards.xp;
          const newLevel = Math.floor(newXp / 100) + 1; // Simple: 100 XP per level

          await tx.hero.update({
            where: { id: hero.id },
            data: {
              xp: newXp,
              level: Math.max(hero.level, newLevel),
            },
          });
        }
      }

      // Mark quest as claimed
      await tx.playerQuest.update({
        where: {
          playerId_questId: {
            playerId: player.playerId,
            questId,
          },
        },
        data: {
          claimedAt: new Date(),
        },
      });
    });

    return {
      success: true,
      rewards,
      message: `Récompense réclamée: +${rewards.wood} bois, +${rewards.stone} pierre, +${rewards.iron} fer, +${rewards.food} nourriture, +${rewards.xp} XP`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE QUEST PROGRESS (called internally by other controllers)
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('progress/:type')
  async updateProgress(
    @CurrentPlayer() player: any,
    @Param('type') type: string,
    @Query('amount') amount: string = '1'
  ) {
    const increment = parseInt(amount) || 1;

    // Find all quests matching this type
    const matchingQuests = Object.values(QUEST_DEFINITIONS).filter(
      q => q.targetType === type.toUpperCase()
    );

    const results = [];

    for (const questDef of matchingQuests) {
      // Skip if achievement already completed
      if (questDef.type === 'ACHIEVEMENT') {
        const existing = await this.prisma.playerQuest.findUnique({
          where: {
            playerId_questId: {
              playerId: player.playerId,
              questId: questDef.id,
            },
          },
        });
        if (existing?.completedAt) continue;
      }

      // Upsert progress
      const result = await this.prisma.playerQuest.upsert({
        where: {
          playerId_questId: {
            playerId: player.playerId,
            questId: questDef.id,
          },
        },
        update: {
          progress: { increment },
        },
        create: {
          playerId: player.playerId,
          questId: questDef.id,
          progress: increment,
        },
      });

      // Check if completed
      if (result.progress >= questDef.target && !result.completedAt) {
        await this.prisma.playerQuest.update({
          where: {
            playerId_questId: {
              playerId: player.playerId,
              questId: questDef.id,
            },
          },
          data: {
            completedAt: new Date(),
          },
        });
        results.push({ questId: questDef.id, completed: true });
      } else {
        results.push({ questId: questDef.id, progress: result.progress });
      }
    }

    return { updated: results };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET DAILY/WEEKLY QUESTS (called by tick processor)
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('reset/:type')
  async resetQuests(@Param('type') type: 'daily' | 'weekly') {
    const questType = type.toUpperCase();

    // Delete progress for daily/weekly quests
    const questIds = Object.values(QUEST_DEFINITIONS)
      .filter(q => q.type === questType)
      .map(q => q.id);

    await this.prisma.playerQuest.deleteMany({
      where: {
        questId: { in: questIds },
      },
    });

    return { reset: questIds.length };
  }
}

export default QuestController;
