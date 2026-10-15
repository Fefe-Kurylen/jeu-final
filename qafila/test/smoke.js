// Test de fumée : démarre le serveur sur un port libre et vérifie les routes principales.
import { spawn } from 'node:child_process';
import { instantAnswer } from '../src/instant.js';

const assert = (cond, msg) => { if (!cond) { console.error('✗', msg); process.exitCode = 1; } else console.log('✓', msg); };

// 1. Réponses instantanées (hors ligne)
assert(instantAnswer('12*(3+4)')?.title === '84', 'calculatrice 12*(3+4) = 84');
assert(instantAnswer('10 km en miles')?.title.startsWith('6,21'), 'conversion 10 km en miles');
assert(instantAnswer('100 f en c')?.title.startsWith('37,7'), 'conversion 100 °F en °C');
assert(instantAnswer('tour eiffel') === null, 'pas de réponse instantanée pour une requête texte');

// 2. Serveur HTTP
const port = 4100 + Math.floor(Math.random() * 500);
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('démarré')) r(); }));
const base = `http://localhost:${port}`;
try {
  const status = await (await fetch(`${base}/api/status`)).json();
  assert(status.ok === true, 'GET /api/status');
  const html = await (await fetch(`${base}/`)).text();
  assert(html.includes('<title>Qafila'), 'GET / renvoie l\'interface');
  const bad = await fetch(`${base}/api/search`);
  assert(bad.status === 400, 'GET /api/search sans q -> 400');
  const ssrf = await fetch(`${base}/api/img?u=http://127.0.0.1:${port}/api/status`);
  assert(ssrf.status === 403, 'proxy image refuse les adresses privées');
  const os = await (await fetch(`${base}/opensearch.xml`)).text();
  assert(os.includes('<ShortName>Qafila'), 'GET /opensearch.xml');
  if (process.env.SMOKE_NETWORK) {
    const r = await (await fetch(`${base}/api/search?q=tour+eiffel`)).json();
    assert(Array.isArray(r.results) && r.results.length > 0, `recherche web réseau (${r.provider}, ${r.results?.length} résultats)`);
  }
} finally {
  srv.kill();
}
