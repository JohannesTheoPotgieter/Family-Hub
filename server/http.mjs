export const corsHeaders = (clientOrigin) => ({
  'Access-Control-Allow-Origin': clientOrigin,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, svix-id, svix-timestamp, svix-signature, stripe-signature',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
});

export const readRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

export const readJsonBody = async (req) => {
  const buffer = await readRawBody(req);
  const text = buffer.toString('utf8');
  return text ? JSON.parse(text) : {};
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
