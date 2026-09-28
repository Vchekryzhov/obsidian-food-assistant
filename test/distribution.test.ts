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

test("0.2.1 release metadata identifies the plugin consistently", async () => {
  const pluginManifest = JSON.parse(await read("manifest.json")) as {
    name: string;
    version: string;
    minAppVersion: string;
  };
  const moduleManifest = JSON.parse(await read("module/manifest.json")) as {
    version: string;
  };
  const packageJson = JSON.parse(await read("package.json")) as { version: string };
  const versions = JSON.parse(await read("versions.json")) as Record<string, string>;

  assert.equal(pluginManifest.name, "Food Assistant Module");
  assert.equal(pluginManifest.version, "0.2.1");
  assert.equal(moduleManifest.version, pluginManifest.version);
  assert.equal(packageJson.version, pluginManifest.version);
  assert.equal(versions[pluginManifest.version], "1.11.4");
});

test("README starts with the plugin name and includes English installation guidance", async () => {
  const readme = await read("README.md");

  assert.match(readme, /^# Food Assistant Module\n/);
  assert.match(readme, /## English\n/);
  assert.match(readme, /Obsidian desktop 1\.11\.4 or later/);
  assert.match(readme, /Copilot and Dataview are separate community plugins/);
  assert.match(readme, /replaces the clipboard contents/);
});

test("release workflow publishes only supported assets and attests built binaries", async () => {
  const workflow = await read(".github/workflows/release.yml");

  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /actions\/attest-build-provenance@v2/);
  assert.match(workflow, /subject-path:\s*\|\s*\n\s*main\.js\s*\n\s*styles\.css/);
  assert.doesNotMatch(workflow, /\bzip\b/);
  assert.doesNotMatch(workflow, /food-assistant-module-\$\{\{ github\.ref_name \}\}\.zip/);
});

test("local and CI checks include Obsidian-specific linting and the required UI matrix", async () => {
  const packageJson = JSON.parse(await read("package.json")) as {
    scripts: Record<string, string>;
  };
  const uiWorkflow = await read(".github/workflows/ui.yml");

  assert.match(packageJson.scripts.lint, /eslint src/);
  assert.match(packageJson.scripts.check, /npm run lint/);
  assert.match(packageJson.scripts["test:ui"], /scripts\/test-ui\.mjs/);
  assert.match(uiWorkflow, /obsidian-version: \["1\.11\.4", "1\.13\.7"\]/);
  assert.match(uiWorkflow, /releases\/download\/v\$\{\{ matrix\.obsidian-version \}\}/);
  assert.match(uiWorkflow, /xvfb-run --auto-servernum npm run test:ui/);
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
