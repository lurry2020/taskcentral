import { UNAUTHORIZED_EVENT, clearToken, getToken } from "./authToken";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : humanizeDetail(detail) ?? `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

function humanizeDetail(detail: unknown): string | undefined {
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        const loc = Array.isArray(d?.loc) ? d.loc.slice(1).join(".") : "";
        return loc ? `${loc}: ${d?.msg}` : String(d?.msg ?? "");
      })
      .filter(Boolean)
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    if ("detail" in detail) {
      return humanizeDetail((detail as { detail: unknown }).detail);
    }
    if ("errors" in detail) {
      return humanizeDetail((detail as { errors: unknown }).errors);
    }
  }
  return undefined;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A 401 on a request that carried a token means the session expired - sign out. */
function handleUnauthorized(status: number): void {
  if (status === 401 && getToken()) {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    handleUnauthorized(res.status);
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Authenticated file download (export / backup) - the token can't ride on an <a href>. */
export async function downloadWithAuth(path: string, fallbackName = "download"): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new ApiError(res.status, "Download failed");
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const apiBase = BASE;
