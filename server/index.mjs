import { createServer } from 'node:http';
import { randomUUID, createCipheriv, randomBytes } from 'node:crypto';

const port = Number(process.env.PORT ?? 8787);
const encKey = Buffer.from((process.env.TOKEN_ENC_KEY ?? 'x'.repeat(32)).slice(0, 32));
const refreshTokens = new Map();
const icsSubs = new Map();

const encrypt = (raw) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': process.env.CLIENT_ORIGIN ?? '*' });
  res.end(JSON.stringify(data));
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === '/api/auth/google/start') return send(res, 200, { message: 'OAuth start placeholder', callback: '/api/auth/google/callback' });
  if (url.pathname === '/api/auth/google/callback') { refreshTokens.set('google', encrypt('mock-refresh')); res.writeHead(302, { location: '/' }); return res.end(); }
  if (url.pathname === '/api/auth/microsoft/start') return send(res, 200, { message: 'OAuth start placeholder', callback: '/api/auth/microsoft/callback' });
  if (url.pathname === '/api/auth/microsoft/callback') { refreshTokens.set('microsoft', encrypt('mock-refresh')); res.writeHead(302, { location: '/' }); return res.end(); }

  if (url.pathname === '/api/calendars') return send(res, 200, [{ id: 'server-default', provider: 'server', name: 'Server Calendar' }]);
  if (url.pathname === '/api/events') return send(res, 200, []);

  if (url.pathname === '/api/ics/subscribe' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => body += c); req.on('end', () => { const parsed = JSON.parse(body || '{}'); const id = randomUUID(); icsSubs.set(id, parsed); send(res, 200, { id, ...parsed }); }); return;
  }
  if (url.pathname === '/api/ics/events') return send(res, 200, []);
  if (url.pathname === '/api/caldav/connect' && req.method === 'POST') return send(res, 200, { ok: true, serverUrl: 'https://caldav.icloud.com/.well-known/caldav' });

  send(res, 404, { error: 'not found' });
}).listen(port, () => console.log(`Server mode API on ${port}`));
