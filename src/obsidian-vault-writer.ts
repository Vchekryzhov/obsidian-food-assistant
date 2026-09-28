import { TFile, Vault, normalizePath } from "obsidian";
import type { VaultWriter } from "./contracts.ts";

export class ObsidianVaultWriter implements VaultWriter {
  constructor(private readonly vault: Vault) {}

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    if (isHiddenPath(normalized)) {
      return this.vault.adapter.exists(normalized);
    }
    return this.vault.getAbstractFileByPath(normalized) !== null;
  }

  async read(path: string): Promise<string> {
    const normalized = normalizePath(path);
    if (isHiddenPath(normalized)) {
      return this.vault.adapter.read(normalized);
    }
    const file = this.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`Expected a file at ${path}.`);
    }
    return this.vault.read(file);
  }

  async write(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    if (isHiddenPath(normalized)) {
      await this.vault.adapter.write(normalized, content);
      return;
    }
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
      return;
    }
    if (existing !== null) {
      throw new Error(`Expected a file path at ${path}.`);
    }
    await this.vault.create(normalized, content);
  }

  async createFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (isHiddenPath(normalized)) {
      if (!(await this.vault.adapter.exists(normalized))) {
        await this.vault.adapter.mkdir(normalized);
      }
      return;
    }
    if (this.vault.getAbstractFileByPath(normalized) === null) {
      await this.vault.createFolder(normalized);
    }
  }
}

function isHiddenPath(path: string): boolean {
  // Vault indexes visible files only; installation state lives in a dot-folder.
  return path.split("/").some((part) => part.startsWith("."));
}
