// Session token storage, kept framework-free so the API layer can read it
// without importing React. The AuthProvider owns the reactive state.
const TOKEN_KEY = "taskcentral-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Fired when the backend rejects an existing session (expired/invalid token). */
export const UNAUTHORIZED_EVENT = "taskcentral:unauthorized";
