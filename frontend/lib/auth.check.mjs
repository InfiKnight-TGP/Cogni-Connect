// Run from frontend/: node lib/auth.check.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { apiFetch, apiJSON, AUTH_EXPIRED, AUTH_CHANGED, mediaUrl, setRequestPatient } from "./api.ts";
import { canSaveScores, setSessionSnapshot } from "./auth-session.ts";

const realFetch = globalThis.fetch;
const events = [];
globalThis.window = { dispatchEvent: event => { events.push(event.type); } };
try {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.credentials, "include"); assert.equal(init.cache, "no-store");
    assert.equal(new Headers(init.headers).get("X-Cogni-Patient"), "patient-a");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  };
  await apiFetch("/api/backend/people", { credentials: "omit", headers: { "X-Cogni-Patient": "patient-a" } });
  assert.deepEqual(events, [AUTH_EXPIRED]);
  events.length = 0;
  await apiFetch("/api/backend/auth/login", { authRedirect: false, headers: { "X-Cogni-Patient": "patient-a" } });
  assert.deepEqual(events, []);
  setRequestPatient("patient-a");
  await apiFetch("/api/backend/settings", { method: "POST" });
  assert.equal(mediaUrl("/known-faces/a.jpg"), "/api/backend/known-faces/a.jpg?_patient=patient-a");
  events.length = 0;
  globalThis.fetch = async () => Response.json({}, { status: 403 });
  await apiFetch("/api/backend/reports/days"); assert.deepEqual(events, [AUTH_CHANGED]);
  globalThis.fetch = async () => Response.json({}, { status: 429 });
  await assert.rejects(apiJSON("/pair/redeem"), error => error.status === 429 && /Too many/.test(error.message));
  setSessionSnapshot(null); assert.equal(canSaveScores(), false);
  setSessionSnapshot({ role: "caregiver", elevated: false }); assert.equal(canSaveScores(), false);
  setSessionSnapshot({ role: "patient_device", elevated: true }); assert.equal(canSaveScores(), false);
  setSessionSnapshot({ role: "patient_device", elevated: false }); assert.equal(canSaveScores(), true);
} finally { globalThis.fetch = realFetch; delete globalThis.window; setSessionSnapshot(null); setRequestPatient(null); }

const python = resolve("../backend/.venv/Scripts/python.exe");
const fixture = spawn(python, ["-u", "tests/frontend_fixture.py"], { cwd: resolve("../backend"), stdio: ["ignore", "pipe", "pipe"] });
let output = "";
fixture.stderr.on("data", () => {});
try {
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture startup timed out")), 60000);
    fixture.once("error", error => { clearTimeout(timer); reject(error); });
    fixture.once("exit", code => { clearTimeout(timer); reject(new Error(`Fixture exited: ${code}`)); });
    fixture.stdout.on("data", chunk => {
      output += chunk.toString(); const match = output.match(/FIXTURE_PORT=(\d+)/);
      if (match) { clearTimeout(timer); resolvePort(match[1]); }
    });
  });
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  const { backendFetch, backendResponse } = await import("./backend-proxy.ts");
  function client() {
    const cookies = new Map();
    return async (path, { method = "GET", body, headers = {} } = {}) => {
      const request = new Request(`http://localhost:3000/api/backend${path}`, {
        headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(method !== "GET" ? { origin: "http://localhost:3000", "content-type": "application/json" } : {}), ...headers },
      });
      const response = backendResponse(await backendFetch(request, path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }));
      for (const cookie of response.headers.getSetCookie()) {
        const [name, ...value] = cookie.split(";")[0].split("=");
        if (/Max-Age=0(?:;|$)/i.test(cookie)) cookies.delete(name); else cookies.set(name, value.join("="));
      }
      assert.equal(response.headers.get("cache-control"), "no-store");
      const text = await response.text();
      return { status: response.status, data: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text, headers: response.headers };
    };
  }
  const caregiver = client(), device = client(), other = client(), anonymous = client();
  async function signup(c, email) {
    const started = await c("/auth/signup", { method: "POST", body: { name: "Test caregiver", email, password: "password123" } });
    assert.equal(started.status, 202);
    const verified = await c("/auth/otp/verify", { method: "POST", body: { challenge: started.data.challenge, code: "123456" } });
    assert.equal(verified.status, 200);
    assert.ok(verified.headers.getSetCookie().length >= 2);
    assert.ok(verified.headers.getSetCookie().some(cookie => cookie.startsWith("cogni_session=") && cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax")));
  }
  assert.equal((await anonymous("/people")).status, 401);
  await signup(caregiver, "first@example.invalid");
  const a = (await caregiver("/auth/me")).data.activePatient.id;
  const created = await caregiver("/pair/create", { method: "POST", body: { patient_id: a } });
  assert.equal(created.status, 201);
  assert.equal((await device("/pair/redeem", { method: "POST", body: { code: created.data.code, device_label: "Test tablet" } })).status, 200);
  assert.equal((await anonymous("/pair/redeem", { method: "POST", body: { code: created.data.code } })).status, 400);
  assert.equal((await device("/reports/days")).status, 403);
  assert.equal((await device("/known-faces/a.jpg")).data, "private-patient-a");
  assert.equal((await device("/video_chunks/a.mp4", { headers: { range: "bytes=0-6" } })).status, 206);
  assert.ok((await device("/video_chunks")).data.videos.includes("/video_chunks/a.mp4"));
  assert.equal((await device("/caregiver/unlock", { method: "POST", body: { pin: "1234" } })).status, 200);
  assert.equal((await device("/reports/days")).status, 200);
  assert.equal((await device("/performance", { method: "POST", body: { score: 80 } })).status, 403);
  assert.equal((await device("/caregiver/lock", { method: "POST", body: {} })).status, 200);
  assert.equal((await device("/performance", { method: "POST", body: { score: 80, game_id: "story-builder", date: "2026-10-21" } })).status, 200);
  assert.equal((await caregiver("/performance", { method: "POST", body: { score: 80 } })).status, 403);
  const b = (await caregiver("/patients", { method: "POST", body: { name: "Patient B" } })).data.id;
  assert.equal((await caregiver("/settings", { method: "POST", body: { language: "hi" }, headers: { "X-Cogni-Patient": b } })).status, 200);
  assert.equal((await caregiver("/settings", { headers: { "X-Cogni-Patient": a } })).data.language, "en");
  assert.equal((await caregiver("/settings", { headers: { "X-Cogni-Patient": b } })).data.language, "hi");
  assert.deepEqual((await caregiver("/video_chunks", { headers: { "X-Cogni-Patient": b } })).data.videos, []);
  assert.equal((await caregiver("/known-faces/a.jpg", { headers: { "X-Cogni-Patient": b } })).status, 404);
  assert.equal((await caregiver(`/known-faces/a.jpg?_patient=${b}`)).status, 404);
  assert.equal((await caregiver(`/known-faces/a.jpg?_patient=${a}`)).status, 200);
  assert.equal((await device("/auth/me", { headers: { "X-Cogni-Patient": b } })).data.activePatient.id, a);
  await signup(other, "second@example.invalid");
  assert.equal((await other("/people", { headers: { "X-Cogni-Patient": a } })).status, 403);
  const invite = (await caregiver("/pair/invite", { method: "POST", body: { patient_id: a } })).data.code;
  assert.equal((await other("/pair/join", { method: "POST", body: { code: invite } })).status, 200);
  assert.equal((await other("/people", { headers: { "X-Cogni-Patient": a } })).status, 200);
  assert.equal((await caregiver("/settings", { method: "POST", body: { language: "hi" }, headers: { origin: "https://untrusted.example" } })).status, 403);
  const id = (await caregiver(`/pair/devices?patient_id=${a}`)).data.devices[0].id;
  assert.equal((await caregiver(`/pair/devices/${id}`, { method: "DELETE" })).status, 200);
  assert.equal((await device("/auth/me")).status, 401);
  console.log("Auth checks passed: credentials, session modes, OTP, pairing, media ranges, isolation, invites, CSRF, and unpairing.");
} finally {
  fixture.kill();
  if (fixture.exitCode === null) await once(fixture, "exit");
}
