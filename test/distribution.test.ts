import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("plugin, module, and versions metadata agree", async () => {
  const pluginManifest = JSON.parse(await read("manifest.json")) as {
    id: string;
    version: string;
    minAppVersion: string;
  };
  const moduleManifest = JSON.parse(await read("module/manifest.json")) as {
    id: string;
    version: string;
  };
  const versions = JSON.parse(await read("versions.json")) as Record<string, string>;

  assert.equal(pluginManifest.id, "food-assistant-module");
  assert.equal(moduleManifest.id, "food-assistant");
  assert.equal(moduleManifest.version, pluginManifest.version);
  assert.equal(versions[pluginManifest.version], pluginManifest.minAppVersion);
});

test("distributable module contains no machine-specific paths or obvious secrets", async () => {
  const files = await walk(path.join(projectRoot, "module"));
  const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const combined = contents.join("\n");

  assert.doesNotMatch(combined, /\/Users\//);
  assert.doesNotMatch(combined, /Documents\/Obsidian/);
  assert.doesNotMatch(combined, /(?:OPENAI|CODEX|VUSKVILL|VKUSVILL)_API_KEY\s*[:=]\s*\S+/i);
});

test("both agent skills have discoverable frontmatter", async () => {
  for (const skill of ["weekly-menu", "inventory-maintenance"]) {
    const content = await read(`module/skills/${skill}/SKILL.md`);
    assert.match(content, /^---\nname: [a-z-]+\ndescription: .+\n---\n/);
  }
});

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
    })
  );
  return nested.flat();
}
