import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/games/page.tsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../components/games/registry.ts", import.meta.url), "utf8");
assert.match(source, /session\?\.role === "self" \? <SelfGames/);
assert.match(source, /Playing here counts toward your progress/);
assert.match(source, /In today’s plan/);
assert.match(source, /Played today/);
assert.match(source, /Coming soon/);
assert.match(source, /<Game level=\{active\.level\} date=\{gameDate\} \/>/);
assert.match(source, /game\.component/);
assert.match(registry, /id: "face-recognition"/);
assert.match(registry, /id: "context-recall"/);
assert.match(source, /toEntries\(performance\)/);
assert.doesNotMatch(source.slice(source.indexOf("function SelfGames"), source.indexOf("function AllGames")), /PreviewContext\.Provider/);
console.log("self-care games checks passed");
