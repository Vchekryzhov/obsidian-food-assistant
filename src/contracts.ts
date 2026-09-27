export type FilePolicy = "managed" | "create-if-missing";

export interface ModuleFile {
  path: string;
  content: string;
  policy: FilePolicy;
}

export interface ModulePackage {
  id: string;
  version: string;
  displayName: string;
  routeText: string;
  files: ModuleFile[];
}

export interface VaultWriter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  createFolder(path: string): Promise<void>;
}

export interface InstallReport {
  created: string[];
  updated: string[];
  skipped: string[];
  conflicts: string[];
}

export interface InstalledState {
  schemaVersion: 1;
  packageId: string;
  packageVersion: string;
  managedFiles: Record<string, string>;
}
