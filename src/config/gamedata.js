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
} catch (e) {
  console.warn('Could not load game data:', e.message);
}

module.exports = { unitsData, buildingsData, factionsData };
