export const corsHeaders = (clientOrigin) => ({
  'Access-Control-Allow-Origin': clientOrigin,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, svix-id, svix-timestamp, svix-signature, stripe-signature',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
});

// Default request-body ceiling. Large enough for the local-state migration
// payload; small enough that an unauthenticated client can't buffer the
// process into an OOM (readRawBody previously had no cap at all).
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export const readRawBody = async (req, maxBytes = MAX_BODY_BYTES) => {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      req.destroy();
      const err = new Error('Request body too large.');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export const readJsonBody = async (req, maxBytes) => {
  const buffer = await readRawBody(req, maxBytes);
  const text = buffer.toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // A malformed body is the caller's fault — 400, not an unhandled 500.
    const err = new Error('Invalid JSON body.');
    err.status = 400;
    throw err;
  }
};
export const sendJson = (res, clientOrigin, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(clientOrigin) });
  res.end(JSON.stringify(data));
};
export const sendError = (res, clientOrigin, error) => {
  const status = typeof error?.status === 'number' ? error.status : 500;
  sendJson(res, clientOrigin, status, { error: error?.message ?? 'Unexpected server error' });
};
export const redirect = (res, clientOrigin, location) => {
  res.writeHead(302, { location, ...corsHeaders(clientOrigin) });
  res.end();
};
