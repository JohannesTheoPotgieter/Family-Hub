// Server API client (Phase 0 client wiring).
//
// Wraps fetch with:
//   - JSON serialization
//   - Authorization header pulled from a token-getter (typically Clerk's
//     useAuth().getToken). The getter is set once at app bootstrap so
//     each call site doesn't have to thread the token manually.
//   - Sensible error mapping (401 / 403 / 409 surfaced as typed errors).
//
// Designed for use from React components via thin hooks (`useApi` etc.)
// but doesn't depend on React itself, so it's also reachable from
// non-React code such as the service worker registration helper.

export type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter = async () => null;
let baseUrl = '';

export const configureApiClient = ({
  getToken,
  baseUrl: configuredBase
}: {
  getToken?: TokenGetter;
  baseUrl?: string;
} = {}) => {
  if (getToken) tokenGetter = getToken;
  if (configuredBase !== undefined) baseUrl = configuredBase;
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const buildHeaders = async (extra?: HeadersInit): Promise<HeadersInit> => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(extra)) {
      for (const [key, value] of extra) headers[key] = value;
    } else {
      Object.assign(headers, extra);
    }
  }
  const token = await tokenGetter();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const parseResponse = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new ApiError(
      `Request failed: ${response.status}`,
      response.status,
      body
    );
  }
  return body as T;
};

export const apiGet = async <T,>(path: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: await buildHeaders(),
    credentials: 'include'
  });
  return parseResponse<T>(response);
};

export const apiSend = async <T,>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> => {
  const headers = await buildHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : undefined);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return parseResponse<T>(response);
};

// --- Typed convenience wrappers ----------------------------------------
// One per route documented in docs/phase-0-runbook.md §8 + Phase 1 calendar.

import type { EntitlementsSnapshot } from '../../hooks/useEntitlement.ts';

export type SessionPayload = {
  member: {
    id: string;
    familyId: string;
    roleKey: 'parent_admin' | 'adult_editor' | 'child_limited';
    displayName: string;
  };
  family: {
    id: string;
    name: string;
    locale: 'ZA' | 'GLOBAL';
    province: string | null;
  };
  entitlements: EntitlementsSnapshot;
  publicConfig: {
    clerkPublishableKey: string | null;
    vapidPublicKey: string | null;
  };
};

export type PublicConfig = {
  clerkPublishableKey: string | null;
  vapidPublicKey: string | null;
  stripePublishableKey: string | null;
  publicAppUrl: string | null;
};

export const fetchPublicConfig = () => apiGet<PublicConfig>('/api/public-config');
export const fetchMe = () => apiGet<SessionPayload>('/api/me');
