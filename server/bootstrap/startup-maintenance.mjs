import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const createStartupEnvironment = (moduleUrl) => {
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const port = Number(process.env.PORT ?? 8787);
  const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5000';
  const rawEncKey = (process.env.TOKEN_ENC_KEY ?? '').trim();
  const encKey = Buffer.byteLength(rawEncKey) >= 32 ? Buffer.from(rawEncKey).subarray(0, 32) : null;
  const dataFile = resolve(moduleDir, '.family-hub-server.json');
  const maintenanceMode = process.env.FAMILY_HUB_MAINTENANCE_MODE === '1';

  return { moduleDir, port, clientOrigin, encKey, dataFile, maintenanceMode };
};

export const startServerIfEntrypoint = ({ moduleUrl, server, port }) => {
  if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(moduleUrl)) {
    server.listen(port, () => {
      console.log(`Family Hub server listening on ${port}`);
    });
  }
};
