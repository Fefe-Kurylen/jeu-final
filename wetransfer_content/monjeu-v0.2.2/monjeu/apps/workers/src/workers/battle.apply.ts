import { PrismaService } from '../../common/prisma/prisma.service';
import { BattleResult } from '@libs/combat/src/types';

interface BattleMeta {
  type: 'FIELD' | 'CITY_ATTACK' | 'RAID';
  defenderCityId?: string;
  attackerId: string;
  defenderId: string;
  attackerArmyId: string;
  defenderArmyId: string;
}

export async function applyBattleResultToDb(
  prisma: PrismaService,
  result: BattleResult,
  meta: BattleMeta
): Promise<void> {
  // Apply attacker losses
  for (const [unitKey, killed] of Object.entries(result.attacker.killed)) {
    await prisma.armyUnit.updateMany({
      where: { armyId: meta.attackerArmyId, unitKey },
      data: { count: { decrement: killed } },
    });
  }
  
  // Apply defender losses
  for (const [unitKey, killed] of Object.entries(result.defender.killed)) {
    await prisma.armyUnit.updateMany({
      where: { armyId: meta.defenderArmyId, unitKey },
      data: { count: { decrement: killed } },
    });
  }
  
  // Handle wounded units (add to city if defender was in city)
  if (meta.defenderCityId) {
    for (const [unitKey, wounded] of Object.entries(result.defender.wounded)) {
      if (wounded > 0) {
        await prisma.woundedUnit.upsert({
          where: { cityId_unitKey: { cityId: meta.defenderCityId, unitKey } },
          update: { count: { increment: wounded } },
          create: { cityId: meta.defenderCityId, unitKey, count: wounded },
        });
      }
    }
  }
  
  // Cleanup units with 0 or negative count
  await prisma.armyUnit.deleteMany({
    where: {
      armyId: { in: [meta.attackerArmyId, meta.defenderArmyId] },
      count: { lte: 0 },
    },
  });
  
  // Update army status based on result
  if (result.winner === 'ATTACKER') {
    await prisma.army.update({
      where: { id: meta.attackerArmyId },
      data: { status: 'RETURNING' },
    });
  } else {
    await prisma.army.update({
      where: { id: meta.attackerArmyId },
      data: { status: 'RETURNING' },
    });
  }
  
  // Create battle report
  await prisma.battleReport.create({
    data: {
      type: meta.type,
      winner: result.winner,
      attackerId: meta.attackerId,
      defenderId: meta.defenderId,
      attackerArmyId: meta.attackerArmyId,
      defenderArmyId: meta.defenderArmyId,
      rounds: result.rounds,
      payload: {
        attackerKilled: result.attacker.killed,
        attackerWounded: result.attacker.wounded,
        attackerRemaining: result.attacker.remaining,
        defenderKilled: result.defender.killed,
        defenderWounded: result.defender.wounded,
        defenderRemaining: result.defender.remaining,
      },
      visibleToAttacker: true,
      visibleToDefender: true,
    },
  });
}
