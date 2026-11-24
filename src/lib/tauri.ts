import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  FileContent,
  FileDiffPayload,
  FileNode,
  GitChangeItem,
  GitStatusOrDiff,
} from "../types/ipc";

// Tauri maps camelCase JS argument keys to the snake_case Rust parameters.

export function listDir(rootPath: string, subPath?: string): Promise<FileNode[]> {
  return invoke<FileNode[]>("list_dir", { rootPath, subPath: subPath ?? null });
}

export function listFiles(rootPath: string): Promise<FileNode[]> {
  return invoke<FileNode[]>("list_files", { rootPath });
}

export function readFile(filePath: string): Promise<FileContent> {
  return invoke<FileContent>("read_file", { filePath });
}

export function listSystemFonts(): Promise<string[]> {
  return invoke<string[]>("list_system_fonts");
}

export function watchRepo(rootPath: string | null): Promise<void> {
  return invoke<void>("watch_repo", { rootPath });
}

export function onFsChanged(handler: () => void): Promise<UnlistenFn> {
  return listen("pore://fs-changed", () => {
    handler();
  });
}

export async function getGitChanges(repoPath: string): Promise<GitChangeItem[]> {
  const res = await invoke<GitStatusOrDiff>("get_git_status_and_diff", {
    repoPath,
    filePath: null,
  });
  if (res.kind !== "status") throw new Error("unexpected git response: " + res.kind);
  return res.changes;
}

export async function getFileDiff(repoPath: string, filePath: string): Promise<FileDiffPayload> {
  const res = await invoke<GitStatusOrDiff>("get_git_status_and_diff", { repoPath, filePath });
  if (res.kind !== "diff") throw new Error("unexpected git response: " + res.kind);
  const { kind: _kind, ...payload } = res;
  return payload;
}
