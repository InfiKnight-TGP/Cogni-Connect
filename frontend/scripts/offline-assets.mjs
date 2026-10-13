import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return files.flat();
}
const assets = (await walk('.next/static')).filter(file => !file.endsWith('.map')).map(file => '/' + file.replaceAll('\\', '/').replace('.next/', '_next/'));
await writeFile('public/sw-assets.json', JSON.stringify({ version: Date.now(), assets }), 'utf8');
console.log(`Offline manifest: ${assets.length} static assets`);
