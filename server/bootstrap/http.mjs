import { createServer } from 'node:http';
import { sendError } from '../http.mjs';

export const createHttpServer = ({ clientOrigin, handleRequest }) => createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    sendError(res, clientOrigin, error);
  }
});
