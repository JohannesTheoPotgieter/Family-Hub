export const corsHeaders = (clientOrigin) => ({
  'Access-Control-Allow-Origin': clientOrigin,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
});
export const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
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
