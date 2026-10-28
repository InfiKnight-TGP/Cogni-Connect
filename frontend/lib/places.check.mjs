import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { canEditPlaces, isGoogleMapsUrl, isOpenAt, PLACE_CATEGORIES } from "./places.ts";

const accepted = [
  "https://maps.app.goo.gl/eSt7vqF6MTX7NyHy8",
  "https://goo.gl/maps/place",
  "https://www.google.com/maps/place",
  "https://google.com/maps/place",
  "https://maps.google.com/?q=place",
];
const rejected = [
  "http://maps.app.goo.gl/place",
  "https://maps.app.goo.gl.evil.com/place",
  "https://user:pass@maps.app.goo.gl/place",
  "https://goo.gl/place",
  "https://google.com/search",
  "javascript:alert(1)",
  "https://maps.app.goo.gl:444/place",
  `https://maps.app.goo.gl/${"x".repeat(300)}`,
  "https://maps.app.goo.gl/place\n",
  "https:maps.app.goo.gl/place",
  "https:///maps.app.goo.gl/place",
  "https://@maps.app.goo.gl/place",
  "https://%6daps.app.goo.gl/place",
];
for (const url of accepted) assert.equal(isGoogleMapsUrl(url), true, url);
for (const url of rejected) assert.equal(isGoogleMapsUrl(url), false, url);

assert.deepEqual(PLACE_CATEGORIES, ["home", "shop", "doctor", "temple", "family", "park", "other"]);
const overnight = { hours: { opensAt: "20:00", closesAt: "02:00", closedDays: ["Sunday"] } };
assert.equal(isOpenAt(overnight, "Monday", "01:00"), true);
assert.equal(isOpenAt(overnight, "Monday", "20:00"), true);
assert.equal(isOpenAt(overnight, "Monday", "02:00"), false);
assert.equal(isOpenAt(overnight, "Sunday", "23:00"), false);
assert.equal(isOpenAt(overnight, "Tuesday", "25:00"), false);
assert.equal(canEditPlaces("self"), true);
assert.equal(canEditPlaces("caregiver"), true);
assert.equal(canEditPlaces("patient_device"), false);
assert.equal(canEditPlaces("patient"), false);
assert.equal(canEditPlaces("patient_login"), false);
assert.equal(canEditPlaces(undefined), false);
assert.equal(isOpenAt({ hours: null }, "Monday", "12:00"), false);
assert.equal(isOpenAt({ hours: { opensAt: "08:00", closesAt: "08:00", closedDays: [] } }, "Monday", "00:00"), true);
assert.equal(isOpenAt({ hours: { opensAt: "08:00", closesAt: "17:00", closedDays: [] } }, "Monday", "17:00"), false);

const page = await readFile(new URL("../app/places/page.tsx", import.meta.url), "utf8");
assert.match(page, /target="_blank"\s+rel="noopener noreferrer"/);
assert.match(page, /role="dialog"/);
assert.match(page, /role="alertdialog"/);
assert.match(page, /window\.open\(draft\.mapsUrl\.trim\(\), "_blank", "noopener,noreferrer"\)/);
assert.match(page, /aria-modal="true"/);
assert.doesNotMatch(page, /navigator\.geolocation/);
const requiredSource = await readFile(new URL("./interaction/locales.check.mjs", import.meta.url), "utf8");
const required = runInNewContext(requiredSource.slice(requiredSource.indexOf("const required ="), requiredSource.indexOf("for (const phrase of required)")) + "\nrequired;");
const phrases = [...page.matchAll(/\bt\("([^"\n]+)"/g)].map(match => match[1]);
for (const language of ["hi", "as"]) {
  const translations = JSON.parse(await readFile(new URL(`./interaction/locales/${language}.json`, import.meta.url), "utf8"));
  for (const phrase of phrases) {
    assert.ok(translations.ui[phrase], `${language}: missing UI phrase ${phrase}`);
    assert.ok(required.includes(phrase), `Missing required phrase: ${phrase}`);
  }
}

const privacy = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");
assert.match(privacy, /Saved place links stay in the person's profile/);
assert.match(privacy, /does not track location/);

const proxySource = await readFile(new URL("./backend-proxy.ts", import.meta.url), "utf8");
const mediaRegex = /^\/(known-faces|frames|video_chunks|place-photos)\//;
assert.match(proxySource, /place-photos/);
assert.equal(mediaRegex.test("/place-photos/x.jpg"), true);
assert.equal(mediaRegex.test("/known-faces/x.jpg"), true);

console.log("Places checks passed: safe Maps links, categories, overnight hours, role gating, accessible UI, and privacy.");
