// Server only: never accept a destination URL from the caller.
const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";
export async function backendFetch(request: Request, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  for (const name of ["cookie", "x-cogni-patient", "origin", "sec-fetch-site", "range", "if-range", "content-type"]) {
    const value = request.headers.get(name);
    if (value && !headers.has(name)) headers.set(name, value);
  }
  // Bind media to the patient shown in that tab. Flask validates membership.
  const patient = new URL(request.url).searchParams.get("_patient");
  if (patient && /^\/(known-faces|frames|video_chunks)\//.test(path) && !headers.has("x-cogni-patient")) headers.set("X-Cogni-Patient", patient);
  return fetch(`${backend.replace(/\/$/, "")}${path}`, { ...init, headers, cache: "no-store", redirect: "manual" });
}
export function backendResponse(response: Response) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["content-type", "content-range", "accept-ranges", "content-disposition"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}
