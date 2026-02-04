import * as fs from 'fs';
import * as path from 'path';
import { UnitDef, FactionBonuses } from '@libs/combat/src/types';

export interface LoadedUnit extends UnitDef {
  faction?: string;
  class?: 'INFANTRY'|'ARCHER'|'CAVALRY'|'SIEGE';
}

export function loadUnitsFromJson(filePath: string): Record<string, LoadedUnit> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(abs, 'utf-8');
  const json = JSON.parse(raw) as { units: Array<LoadedUnit> };
  if (!json.units || !Array.isArray(json.units)) throw new Error('Invalid units JSON: missing units[]');

  const map: Record<string, LoadedUnit> = {};
  for (const u of json.units) {
    if (!u.key) throw new Error('Unit missing key');
    if (!u.tier) throw new Error(`Unit ${u.key} missing tier`);
    if (!u.stats) throw new Error(`Unit ${u.key} missing stats`);
    map[u.key] = u;
  }
  return map;
}

export function loadFactionBonusesFromJson(filePath: string): Record<string, FactionBonuses> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(abs, 'utf-8');
  const json = JSON.parse(raw) as { factions: Array<{ key: string; bonuses: FactionBonuses }> };
  if (!json.factions || !Array.isArray(json.factions)) throw new Error('Invalid factions JSON: missing factions[]');

  const map: Record<string, FactionBonuses> = {};
  for (const f of json.factions) {
    if (!f.key) throw new Error('Faction missing key');
    map[f.key] = f.bonuses ?? {};
  }
  return map;
}

export { loadBuildingsFromJson } from './buildings.loader';
export { costAtLevel, timeAtLevelSec } from './buildings.loader';
