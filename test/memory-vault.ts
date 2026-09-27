import type { VaultWriter } from "../src/contracts.ts";

export class MemoryVault implements VaultWriter {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content);
      const parts = path.split("/").slice(0, -1);
      for (let index = 1; index <= parts.length; index += 1) {
        this.folders.add(parts.slice(0, index).join("/"));
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }
}
