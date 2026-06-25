/**
 * Single fetch wrapper for all calls to the Express API.
 * - Prefixes every request with config.apiBaseUrl.
 * - Attaches the current Firebase user's ID token as a Bearer header.
 * - Parses JSON and throws a typed ApiError on any non-2xx response.
 *
 * The client NEVER talks to Firestore directly — this is the entire data surface.
 */
import type { ApiErrorBody } from '@thinkai/shared';
import { auth } from './firebase';
import { config } from './config';

/** Typed error thrown for any non-2xx API response (or transport failure). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** HTTP methods we issue from the client. */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Build the absolute request path, joining base + path without doubling slashes. */
function buildUrl(path: string): string {
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Resolve the current user's Firebase ID token, or null if signed out. */
async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Core request routine. Serializes the body as JSON, attaches auth, and
 * normalizes errors. A 204 (or empty body) resolves to undefined cast as T.
 */
async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  const token = await getIdToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), { method, headers, body: payload });
  } catch (err) {
    // Network / CORS / abort — surface as a uniform ApiError so callers can catch one type.
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError('network_error', message, 0);
  }

  // 204 No Content (or any empty body) — nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data: unknown = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const errBody = data as ApiErrorBody | undefined;
    const code = errBody?.error?.code ?? 'http_error';
    const message = errBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(code, message, response.status);
  }

  return data as T;
}

/** Parse JSON, returning undefined rather than throwing on malformed bodies. */
function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** GET a binary response (e.g. a media preview) as a Blob, with the auth header attached. */
async function getBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = await getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path), { method: 'GET', headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError('network_error', message, 0);
  }
  if (!response.ok) {
    throw new ApiError('http_error', `Request failed with status ${response.status}`, response.status);
  }
  return response.blob();
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body),
  del: <T>(path: string): Promise<T> => request<T>('DELETE', path),
  getBlob,
};

// Named helpers for ergonomic imports alongside the grouped client.
export const get = apiClient.get;
export const post = apiClient.post;
export const put = apiClient.put;
export const patch = apiClient.patch;
export const del = apiClient.del;
