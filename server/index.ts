import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import ical from 'node-ical';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? true, credentials: true }));
app.use(express.json());

const port = Number(process.env.PORT ?? 8787);
const tokenKey = Buffer.from(process.env.TOKEN_ENC_KEY ?? ''.padEnd(32, 'x')).subarray(0, 32);
const refreshTokens = new Map<string, string>();
const icsSubs = new Map<string, { name: string; url: string; cache?: { at: number; events: any[] } }>();

const encrypt = (raw: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey, iv);
  const enc = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
};

app.get('/api/auth/google/start', (_req, res) => res.json({ message: 'Implement OAuth redirect here (code+PKCE).', callback: '/api/auth/google/callback' }));
app.get('/api/auth/google/callback', (_req, res) => { refreshTokens.set('google', encrypt('mock-refresh')); res.redirect('/'); });
app.get('/api/auth/microsoft/start', (_req, res) => res.json({ message: 'Implement OAuth redirect here (code+PKCE).', callback: '/api/auth/microsoft/callback' }));
app.get('/api/auth/microsoft/callback', (_req, res) => { refreshTokens.set('microsoft', encrypt('mock-refresh')); res.redirect('/'); });

app.post('/api/caldav/connect', (req, res) => {
  const { username, appPassword, serverUrl } = req.body ?? {};
  if (!username || !appPassword) return res.status(400).json({ error: 'username and appPassword required' });
  res.json({ ok: true, provider: 'caldav', serverUrl: serverUrl ?? 'https://caldav.icloud.com/.well-known/caldav' });
});

app.post('/api/ics/subscribe', (req, res) => {
  const { name, url } = req.body ?? {};
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const id = crypto.randomUUID();
  icsSubs.set(id, { name, url });
  res.json({ id, name });
});

app.get('/api/ics/events', async (req, res) => {
  const subscriptionId = String(req.query.subscriptionId ?? '');
  const sub = icsSubs.get(subscriptionId);
  if (!sub) return res.status(404).json({ error: 'subscription not found' });
  const now = Date.now();
  if (!sub.cache || now - sub.cache.at > 10 * 60_000) {
    const parsed = await ical.async.fromURL(sub.url);
    sub.cache = { at: now, events: Object.values(parsed).filter((item: any) => item.type === 'VEVENT') };
  }
  res.json(sub.cache.events);
});

app.get('/api/calendars', (req, res) => {
  const provider = String(req.query.provider ?? 'all');
  res.json(provider === 'all' ? [] : [{ id: `${provider}-default`, provider, name: `${provider} calendar`, primary: true }]);
});

app.get('/api/events', (_req, res) => res.json([]));

app.listen(port, () => console.log(`Family Hub server listening on ${port}`));
