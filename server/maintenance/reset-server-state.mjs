import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServerStorage } from '../storage.mjs';

const args = new Set(process.argv.slice(2));
if (!args.has('--force')) {
  console.error('Refusing to reset Family Hub server state without --force.');
  console.error('Usage: node server/maintenance/reset-server-state.mjs --force [--data-file=/absolute/path.json]');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, '..');
const dataFileArg = [...args].find((arg) => arg.startsWith('--data-file='));
const dataFile = dataFileArg ? dataFileArg.slice('--data-file='.length) : resolve(serverDir, '.family-hub-server.json');
const rawEncKey = (process.env.TOKEN_ENC_KEY ?? '').trim();
const encKey = Buffer.byteLength(rawEncKey) >= 32 ? Buffer.from(rawEncKey).subarray(0, 32) : null;
const storage = createServerStorage({ dataFile, encKey });

storage.reset();
console.log(`Reset Family Hub server state at ${storage.dataFile}`);
