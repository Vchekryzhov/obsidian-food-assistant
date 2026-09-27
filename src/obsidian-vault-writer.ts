import { TFile, Vault, normalizePath } from "obsidian";
import type { VaultWriter } from "./contracts.ts";

export class ObsidianVaultWriter implements VaultWriter {
  constructor(private readonly vault: Vault) {}

  async exists(path: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async read(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      throw new Error(`Expected a file at ${path}.`);
    }
    return this.vault.read(file);
  }

  async write(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
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
    if (this.vault.getAbstractFileByPath(normalized) === null) {
      await this.vault.createFolder(normalized);
    }
  }
}
