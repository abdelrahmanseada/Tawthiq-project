import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(ROOT, directory), { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(relative)));
    else if (/\.(css|tsx|ts)$/.test(entry.name)) result.push(relative);
  }
  return result;
}

describe("light theme only", () => {
  it("has no dark colour-scheme rules or dark utilities", async () => {
    const active = [...(await files("app")), ...(await files("components")), ...(await files("lib"))];
    for (const file of active) {
      const text = await readFile(path.join(ROOT, file), "utf8");
      expect(text, `${file} contains a dark-mode media query`).not.toMatch(/prefers-color-scheme:\s*dark/i);
      expect(text, `${file} contains a dark utility`).not.toMatch(/\bdark:[a-z[]/);
    }
  });

  it("declares a light color-scheme at the root", async () => {
    const css = await readFile(path.join(ROOT, "app", "globals.css"), "utf8");
    expect(css).toMatch(/color-scheme:\s*light/);
  });
});
