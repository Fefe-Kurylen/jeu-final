import fs from 'fs';

export type ResourceCost = { wood:number; stone:number; iron:number; food:number };
export type BuildingPrereq = { key:string; level:number };

export type BuildingDef = {
  key: string;
  name: string;
  category: 'BASE'|'INTERMEDIATE'|'ADVANCED'|'FACTION';
  maxLevel: number;
  prereq: BuildingPrereq[];
  costL1: ResourceCost;
  costL20?: ResourceCost;
  costL30?: ResourceCost;
  timeL1Sec: number;
  timeL20Sec?: number;
  timeL30Sec?: number;
  effects?: Record<string, any>;
};

export function loadBuildingsFromJson(path: string): Record<string, BuildingDef> {
  const raw = fs.readFileSync(path, 'utf-8');
  const j = JSON.parse(raw);
  const out: Record<string, BuildingDef> = {};
  for (const b of j.buildings as BuildingDef[]){
    out[b.key] = b;
  }
  return out;
}

function lerpExp(a:number,b:number,t:number): number {
  if (a<=0 || b<=0) return a + (b-a)*t;
  const r = b/a;
  return a * Math.pow(r, t);
}

export function costAtLevel(def: BuildingDef, level: number): ResourceCost {
  const max = def.maxLevel;
  const t = (level-1)/(max-1);
  const end = (max===30 ? def.costL30 : def.costL20) ?? def.costL1;
  return {
    wood: Math.round(lerpExp(def.costL1.wood, end.wood, t)),
    stone: Math.round(lerpExp(def.costL1.stone, end.stone, t)),
    iron: Math.round(lerpExp(def.costL1.iron, end.iron, t)),
    food: Math.round(lerpExp(def.costL1.food, end.food, t)),
  };
}

export function timeAtLevelSec(def: BuildingDef, level: number): number {
  const max = def.maxLevel;
  const t = (level-1)/(max-1);
  const end = (max===30 ? (def.timeL30Sec ?? def.timeL1Sec) : (def.timeL20Sec ?? def.timeL1Sec));
  return Math.round(lerpExp(def.timeL1Sec, end, t));
}

/**
 * Get production type for a building (wood, stone, iron, food, or null)
 */
export function getProdType(def: BuildingDef): 'wood' | 'stone' | 'iron' | 'food' | null {
  const effects = def.effects || {};
  
  if (effects.woodProdL1 !== undefined) return 'wood';
  if (effects.stoneProdL1 !== undefined) return 'stone';
  if (effects.ironProdL1 !== undefined) return 'iron';
  if (effects.foodProdL1 !== undefined) return 'food';
  
  // Also check by building key as fallback
  switch (def.key) {
    case 'LUMBER':
    case 'LUMBER_CAMP':
    case 'WOODCUTTER':
      return 'wood';
    case 'QUARRY':
    case 'STONE_MINE':
      return 'stone';
    case 'IRON_MINE':
    case 'MINE':
      return 'iron';
    case 'FARM':
    case 'CROPLAND':
    case 'GRAIN_FARM':
      return 'food';
    default:
      return null;
  }
}

/**
 * Get production per hour at a specific level
 */
export function prodPerHourAtLevel(def: BuildingDef, level: number): number {
  const effects = def.effects || {};
  const max = def.maxLevel;
  const t = (level - 1) / (max - 1);
  
  // Find production keys in effects
  const prodType = getProdType(def);
  if (!prodType) return 0;
  
  // Map production type to effect keys
  const prodKeyMap: Record<string, string> = {
    'wood': 'woodProd',
    'stone': 'stoneProd',
    'iron': 'ironProd',
    'food': 'foodProd',
  };
  
  const baseKey = prodKeyMap[prodType];
  
  // Try to find L1 and L20/L30 values
  const l1Key = `${baseKey}L1`;
  const l20Key = `${baseKey}L20`;
  const l30Key = `${baseKey}L30`;
  
  const prodL1 = effects[l1Key] ?? 0;
  const prodEnd = (max === 30 ? (effects[l30Key] ?? effects[l20Key] ?? prodL1) : (effects[l20Key] ?? prodL1));
  
  if (prodL1 === 0 && prodEnd === 0) {
    // Fallback: use default production curves based on GDD
    // Level 1: 20/h, Level 20: 1200/h (exponential growth)
    const defaultL1 = 20;
    const defaultL20 = 1200;
    return Math.round(lerpExp(defaultL1, defaultL20, t));
  }
  
  return Math.round(lerpExp(prodL1, prodEnd, t));
}

/**
 * Get storage capacity bonus at a specific level
 */
export function storageAtLevel(def: BuildingDef, level: number): number {
  const effects = def.effects || {};
  const max = def.maxLevel;
  const t = (level - 1) / (max - 1);
  
  // Check for storage effects
  if (def.key === 'WAREHOUSE' || def.key === 'SILO') {
    const l1 = effects.storageL1 ?? 1000;
    const l20 = effects.storageL20 ?? 80000;
    return Math.round(lerpExp(l1, l20, t));
  }
  
  return 0;
}
