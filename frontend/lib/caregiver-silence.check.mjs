import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../app", import.meta.url));

// 1. Scan frontend/app/caregiver recursively: must contain no speech code
async function getFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFiles(full)));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const caregiverFiles = await getFiles(join(root, "caregiver"));
assert.ok(caregiverFiles.length > 0, "Found caregiver files to check");

for (const filePath of caregiverFiles) {
  const content = await readFile(filePath, "utf8");
  const rel = filePath.replace(root, "frontend/app");
  assert.doesNotMatch(content, /\bReadAloud\b/, `${rel} must not contain ReadAloud`);
  assert.doesNotMatch(content, /\bautoRead\b/, `${rel} must not contain autoRead`);
  assert.doesNotMatch(content, /\bspeechSynthesis\b/, `${rel} must not contain speechSynthesis`);
}

// 2. Scan shared pages used by caregivers
const sharedPages = [
  "places/page.tsx",
  "explore/page.tsx",
  "people/page.tsx",
  "progress/page.tsx",
  "report/page.tsx",
  "settings/page.tsx",
  "my-progress/page.tsx",
];

for (const relPath of sharedPages) {
  const fullPath = join(root, relPath);
  const content = await readFile(fullPath, "utf8");
  const readAloudMatches = [...content.matchAll(/<ReadAloud\b/g)];

  if (relPath === "progress/page.tsx" || relPath === "report/page.tsx") {
    assert.equal(readAloudMatches.length, 0, `${relPath} should have no ReadAloud`);
    continue;
  }

  assert.ok(readAloudMatches.length > 0, `${relPath} should render ReadAloud for non-caregivers`);
  assert.match(
    content,
    /session\?\.role\s*===\s*["']caregiver["']|session\?\.role\s*!==\s*["']caregiver["']/,
    `${relPath} must inspect session role for caregiver`
  );

  // Verify that every <ReadAloud is preceded by a non-caregiver check (!caregiver or session role check)
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("<ReadAloud")) {
      const window = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
      const isGated =
        window.includes("!caregiver") ||
        window.includes('session?.role !== "caregiver"') ||
        window.includes("session?.role === 'self'") ||
        window.includes('session?.role === "self"');
      assert.ok(isGated, `ReadAloud at ${relPath}:${i + 1} must be gated by a non-caregiver condition:\n${window}`);
    }
  }
}

console.log(`Caregiver silence checks passed: ${caregiverFiles.length} caregiver files silent; ${sharedPages.length} shared pages verified.`);
