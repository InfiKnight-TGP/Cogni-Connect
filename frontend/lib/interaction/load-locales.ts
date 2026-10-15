// Server-only discovery: add a JSON file with the same schema, then restart/build.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "./locale";
export function loadLocales(): Locale[] {
  const directory = join(process.cwd(), "lib", "interaction", "locales");
  return readdirSync(directory).filter(name => name.endsWith(".json")).sort()
    .map(name => JSON.parse(readFileSync(join(directory, name), "utf8")) as Locale);
}
