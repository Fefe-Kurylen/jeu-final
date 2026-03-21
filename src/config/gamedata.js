const fs = require('fs');
const path = require('path');

let unitsData = [];
let buildingsData = [];
let factionsData = {};

try {
  const dataDir = path.join(__dirname, '../../data');
  unitsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'units.json'), 'utf-8')).units || [];
  buildingsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'buildings.json'), 'utf-8')).buildings || [];
  factionsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'factions.json'), 'utf-8')).factions || {};

  if (unitsData.length === 0 || buildingsData.length === 0) {
    console.error('FATAL: Game data loaded but empty (units or buildings missing)');
    process.exit(1);
  }
  console.log(`Game data loaded: ${unitsData.length} units, ${buildingsData.length} buildings, ${Object.keys(factionsData).length} factions`);
} catch (e) {
  console.error('FATAL: Could not load game data:', e.message);
  process.exit(1);
}

module.exports = { unitsData, buildingsData, factionsData };
