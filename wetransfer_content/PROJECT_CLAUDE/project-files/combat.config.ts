import { Tier } from './types';

export function tierPriority(tier: Tier): number {
  if (tier === 'elite' || tier === 'intermediate') return 1;
  if (tier === 'base') return 2;
  return 3; // siege
}

export const TIER_COEFF: Record<Tier, number> = {
  base: 1.0,
  intermediate: 1.10,  // Adjusted for 1.8 ratio
  elite: 1.21,         // Adjusted for 1.8 ratio (1.10²)
  siege: 0.75,
};

export const DAMAGE_DEF_MULT = 0.55;
export const MAX_ROUNDS = 50;
export const WOUNDED_RATE = 0.35;
