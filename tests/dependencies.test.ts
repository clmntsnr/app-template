import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const APPS_DIR = join(ROOT, "apps");

const apps = readdirSync(APPS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const readPkg = (app: string) =>
  JSON.parse(readFileSync(join(APPS_DIR, app, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

const isAllowed = (v: string) => v.startsWith("catalog:") || v.startsWith("workspace:");

describe("apps only depend on catalog: or workspace: entries", () => {
  for (const app of apps) {
    test(`${app}: every runtime dependency uses catalog: or workspace:`, () => {
      const pkg = readPkg(app);
      const offenders = Object.entries(pkg.dependencies ?? {}).filter(([, v]) => !isAllowed(v));
      expect(offenders).toEqual([]);
    });
  }
});
