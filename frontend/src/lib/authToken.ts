// Authentication now uses an HttpOnly cookie. Remove tokens left in localStorage
// by releases before server-side sessions were introduced.
const TOKEN_KEY = "taskcentral-token";

export function clearLegacyToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Fired when the backend rejects an existing session (expired/invalid token). */
export const UNAUTHORIZED_EVENT = "taskcentral:unauthorized";
