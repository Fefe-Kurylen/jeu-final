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
