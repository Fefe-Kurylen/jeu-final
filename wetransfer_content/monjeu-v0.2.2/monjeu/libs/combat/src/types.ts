export type Tier = 'base' | 'intermediate' | 'elite' | 'siege';

export interface UnitStats {
  attack: number;
  defense: number;
  endurance: number;
  speed: number;
  transport: number;
}

export interface UnitDef {
  key: string;
  tier: Tier;
  type: 'INF' | 'CAV' | 'ARCH' | 'SIEGE';
  stats: UnitStats;
  cost: {
    wood: number;
    stone: number;
    iron: number;
    food: number;
  };
}

export interface HeroSnapshot {
  id: string;
  level: number;
  atkPoints: number;
  defPoints: number;
  logPoints: number;
  spdPoints: number;
  lossReductionPct: number;
}

export interface ArmyStack {
  unitKey: string;
  tier: Tier;
  count: number;
}

export interface ArmySnapshot {
  armyId: string;
  playerId: string;
  faction: string;
  hero?: HeroSnapshot | null;
  stacks: ArmyStack[];
}

export interface BattleContext {
  mode: 'FIELD' | 'CITY_ATTACK' | 'RAID';
  isSiegeState: boolean;
  defenderInCity: boolean;
  attackerInCity: boolean;
  attackerFactionBonus: Record<string, number>;
  defenderFactionBonus: Record<string, number>;
}

export interface UnitRegistry {
  getUnit: (key: string) => UnitDef;
}

export interface BattleResult {
  winner: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  rounds: number;
  attacker: {
    killed: Record<string, number>;
    wounded: Record<string, number>;
    remaining: Record<string, number>;
  };
  defender: {
    killed: Record<string, number>;
    wounded: Record<string, number>;
    remaining: Record<string, number>;
  };
}
