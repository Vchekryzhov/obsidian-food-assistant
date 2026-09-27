import type {
  InstalledState,
  InstallReport,
  ModulePackage,
  VaultWriter
} from "./contracts.ts";

const ROUTE_START = "<!-- food-assistant:start -->";
const ROUTE_END = "<!-- food-assistant:end -->";
const STATE_PATH = ".food-assistant/installed.json";

export async function installFoodModule(
  vault: VaultWriter,
  modulePackage: ModulePackage
): Promise<InstallReport> {
  validatePackage(modulePackage);

  const report: InstallReport = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: []
  };
  const previousState = await readState(vault, modulePackage.id);
  const managedFiles = { ...(previousState?.managedFiles ?? {}) };

  for (const file of modulePackage.files) {
    const path = normalizeVaultPath(file.path);
    const exists = await vault.exists(path);

    if (file.policy === "create-if-missing") {
      if (exists) {
        report.skipped.push(path);
        continue;
      }
      await writeFile(vault, path, file.content);
      report.created.push(path);
      continue;
    }

    const nextHash = hashContent(file.content);
    if (!exists) {
      await writeFile(vault, path, file.content);
      managedFiles[path] = nextHash;
      report.created.push(path);
      continue;
    }

    const current = await vault.read(path);
    if (current === file.content) {
      managedFiles[path] = nextHash;
      report.skipped.push(path);
      continue;
    }

    const installedHash = previousState?.managedFiles[path];
    if (!installedHash || hashContent(current) !== installedHash) {
      report.conflicts.push(path);
      continue;
    }

    await writeFile(vault, path, file.content);
    managedFiles[path] = nextHash;
    report.updated.push(path);
  }

  await updateRouting(vault, modulePackage.routeText, report);
  const state: InstalledState = {
    schemaVersion: 1,
    packageId: modulePackage.id,
    packageVersion: modulePackage.version,
    managedFiles
  };
  await writeFile(vault, STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);

  return report;
}

export function formatInstallSummary(report: InstallReport): string {
  const changed = report.created.length + report.updated.length;
  const conflicts = report.conflicts.length;
  if (conflicts > 0) {
    return `Установлено: ${changed}. Не перезаписаны изменённые файлы: ${report.conflicts.join(", ")}.`;
  }
  if (changed === 0) {
    return "Модуль уже актуален.";
  }
  return `Готово: создано ${report.created.length}, обновлено ${report.updated.length}.`;
}

function validatePackage(modulePackage: ModulePackage): void {
  if (!modulePackage.id || !modulePackage.version || !modulePackage.displayName) {
    throw new Error("Module package metadata is incomplete.");
  }
  const seen = new Set<string>();
  for (const file of modulePackage.files) {
    const path = normalizeVaultPath(file.path);
    if (seen.has(path)) {
      throw new Error(`Duplicate module file: ${path}`);
    }
    seen.add(path);
  }
}

function normalizeVaultPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
  const parts = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe vault path: ${path}`);
  }
  return normalized;
}

async function writeFile(vault: VaultWriter, path: string, content: string): Promise<void> {
  await ensureParentFolders(vault, path);
  await vault.write(path, content);
}

async function ensureParentFolders(vault: VaultWriter, path: string): Promise<void> {
  const parts = path.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await vault.exists(current))) {
      await vault.createFolder(current);
    }
  }
}

async function updateRouting(
  vault: VaultWriter,
  routeText: string,
  report: InstallReport
): Promise<void> {
  const path = "AGENTS.md";
  const current = (await vault.exists(path)) ? await vault.read(path) : "";
  const block = `${ROUTE_START}\n${routeText.trim()}\n${ROUTE_END}`;
  const pattern = new RegExp(`${escapeRegExp(ROUTE_START)}[\\s\\S]*?${escapeRegExp(ROUTE_END)}`, "m");
  const next = pattern.test(current)
    ? current.replace(pattern, block)
    : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}\n`;

  if (next === current) {
    report.skipped.push(path);
    return;
  }
  await writeFile(vault, path, next);
  (current ? report.updated : report.created).push(path);
}

async function readState(vault: VaultWriter, packageId: string): Promise<InstalledState | null> {
  if (!(await vault.exists(STATE_PATH))) {
    return null;
  }
  try {
    const parsed = JSON.parse(await vault.read(STATE_PATH)) as InstalledState;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.packageId !== packageId ||
      typeof parsed.managedFiles !== "object" ||
      parsed.managedFiles === null
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hashContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
