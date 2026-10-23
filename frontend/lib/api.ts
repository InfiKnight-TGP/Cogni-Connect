// Same-origin requests also let images/video carry the HttpOnly session cookies.
export const API_URL = "/api/backend";
export const AUTH_CHANGED = "cogni-auth-changed";
export const AUTH_EXPIRED = "cogni-auth-expired";
let requestPatient: string | null = null;
export function setRequestPatient(id: string | null) { requestPatient = id; }
export function mediaUrl(path: string) {
  const url = path.startsWith(API_URL + "/") ? path : API_URL + path;
  return requestPatient ? `${url}${url.includes("?") ? "&" : "?"}_patient=${encodeURIComponent(requestPatient)}` : url;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function apiFetch(input: string, options: RequestInit & { authRedirect?: boolean } = {}) {
  const { authRedirect = true, ...init } = options;
  const headers = new Headers(init.headers);
  if (requestPatient && !input.startsWith(`${API_URL}/auth/`) && !headers.has("X-Cogni-Patient")) headers.set("X-Cogni-Patient", requestPatient);
  const response = await fetch(input, { ...init, headers, credentials: "include", cache: "no-store" });
  if (typeof window !== "undefined") {
    if (response.status === 401 && authRedirect) window.dispatchEvent(new Event(AUTH_EXPIRED));
    if (response.status === 403 && authRedirect) window.dispatchEvent(new Event(AUTH_CHANGED));
  }
  return response;
}
export async function apiJSON<T = Record<string, unknown>>(path: string, options: RequestInit & { authRedirect?: boolean } = {}): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, options);
  let data: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    data = { error: "The server returned an unexpected response. Please restart the backend and try again." };
  }
  if (!response.ok) throw new ApiError(response.status === 429
    ? "Too many attempts. Please wait a few minutes before trying again."
    : typeof data.error === "string" ? data.error : "Unable to complete this request. Please try again.", response.status);
  return data as T;
}
export function jsonBody(data: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}
