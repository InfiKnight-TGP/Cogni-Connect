import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/nav.tsx", import.meta.url), "utf8");

assert.match(source, /export function navFor\(account: NavAccount\)/);
const patientBlock = source.match(/const PATIENT_LINKS: NavItem\[\] = \[([\s\S]*?)\n\];/);
assert.ok(patientBlock, "patient-device navigation should be declared");
const selfBlock = source.match(/const SELF_LINKS: NavItem\[\] = \[([\s\S]*?)\n\];/);
assert.ok(selfBlock, "self-care navigation should be declared");
const caregiverBlock = source.match(/const CAREGIVER_LINKS: NavItem\[\] = \[([\s\S]*?)\n\];/);
assert.ok(caregiverBlock, "caregiver navigation should be declared");
for (const href of ["/", "/today", "/explore", "/my-progress", "/people", "/places", "/sos"]) {
  assert.ok(patientBlock[1].includes(`href: "${href}"`), `patient-device nav should include ${href}`);
}
for (const href of ["/games", "/routine"]) {
  assert.ok(selfBlock[1].includes(`href: "${href}"`), `self-care nav should include ${href}`);
}
assert.ok(selfBlock[1].includes("...PATIENT_LINKS"), "self-care navigation should include patient links");
assert.ok(caregiverBlock[1].includes('href: "/places", label: "Places"'), "caregiver navigation should include Places");
assert.ok(caregiverBlock[1].includes('href: "/caregiver/alerts", label: "Alerts"'), "caregiver navigation should include Alerts");
const selfOrder = ["/", "/today", "/explore", "/my-progress", "/people", "/places", "/sos", "/games", "/routine"];
const combined = patientBlock[1] + selfBlock[1];
for (let i = 0; i < selfOrder.length - 1; i++) assert.ok(combined.indexOf(`href: "${selfOrder[i]}"`) < combined.indexOf(`href: "${selfOrder[i + 1]}"`));
assert.match(source, /aria-haspopup="dialog"/);
assert.match(source, /event\.key === "Escape"/);
assert.match(source, /event\.target === event\.currentTarget/);
assert.doesNotMatch(source, /["']Sign out["']/, "Navigation must not contain any Sign out control for any account type");
console.log("navigation checks passed");
