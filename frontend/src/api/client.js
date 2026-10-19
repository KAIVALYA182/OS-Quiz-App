export const API_BASE = import.meta.env.VITE_API_BASE || "/api";
let csrfToken = null;
let generation = 0;
export function clearSessionState() {
  generation++;
  csrfToken = null;
}
export async function request(path, options = {}) {
  const epoch = generation;
  const method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method) && !csrfToken) {
    const csrf = await fetch(`${API_BASE}/auth/csrf`, {
      credentials: "include",
    });
    if (!csrf.ok) throw new Error("Could not initialize secure session.");
    const body = await csrf.json();
    if (epoch !== generation) throw new Error("Account changed.");
    csrfToken = body.csrfToken;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("The server is not responding. Please try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (epoch !== generation) throw new Error("Account changed.");
  if (body.csrfToken) csrfToken = body.csrfToken;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) {
      clearSessionState();
      window.dispatchEvent(new Event("session-expired"));
    }
    if (res.status === 403) csrfToken = null;
    const error = new Error(body.error || "Request failed.");
    error.status = res.status;
    throw error;
  }
  return body;
}
