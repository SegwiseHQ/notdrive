import type { StatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  constructor(
    public status: StatusCode,
    message: string,
    public code = 'error',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (msg = 'not found') => new HttpError(404, msg, 'not_found');
export const unauthorized = (msg = 'unauthorized') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'forbidden') => new HttpError(403, msg, 'forbidden');
export const badRequest = (msg = 'bad request', details?: unknown) =>
  new HttpError(400, msg, 'bad_request', details);
export const conflict = (msg = 'conflict') => new HttpError(409, msg, 'conflict');
