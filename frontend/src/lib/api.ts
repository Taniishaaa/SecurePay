const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Reads the `csrfToken` cookie the backend sets on login — see backend/src/lib/session.ts. */
function readCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
  return match?.[1];
}

/**
 * Thin fetch wrapper for the SecurePay API. `credentials: "include"` is
 * required on every call — auth is via HttpOnly cookies, never a token
 * read/stored in JS, so the browser must be told to send them. Mutating
 * requests also echo the CSRF cookie back as a header (double-submit
 * pattern) so the backend's requireCsrfToken middleware accepts them.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const csrfToken = MUTATING_METHODS.has(method) ? readCsrfToken() : undefined;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(body.error ?? "Request failed", response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
