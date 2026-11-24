// Keep in sync with src-tauri/src/models.rs (field names are snake_case on the wire).

export interface FileNode {
  name: string;
  /** Absolute path. */
  path: string;
  /** Path relative to the root passed to `list_dir`, `/`-separated. */
  rel_path: string;
  is_dir: boolean;
}

export interface FileContent {
  is_binary: boolean;
  content: string;
  /** Size on disk in bytes. */
  size: number;
}

export type ChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface GitChangeItem {
  /** Relative to the repository root, `/`-separated. */
  path: string;
  /** HEAD → index (staged). */
  index_status: ChangeStatus | null;
  /** index → working tree (unstaged / untracked). */
  worktree_status: ChangeStatus | null;
}

export type DiffTag = "equal" | "delete" | "insert";

export interface InlineSegment {
  text: string;
  /** True for word-level changed ranges. */
  emphasized: boolean;
}

export interface DiffLine {
  tag: DiffTag;
  /** 0-based; null for inserted lines. */
  old_index: number | null;
  /** 0-based; null for deleted lines. */
  new_index: number | null;
  /** Concatenated segments equal the line text (incl. trailing newline). */
  segments: InlineSegment[];
}

export interface DiffHunk {
  /** 1-based. */
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface FileDiffPayload {
  /** Relative to the repository root. */
  path: string;
  old_content: string;
  new_content: string;
  /** Binary or over the size limit: contents and hunks are empty. */
  is_binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

/** Return type of `get_git_status_and_diff`, discriminated by `kind`. */
export type GitStatusOrDiff =
  | { kind: "status"; changes: GitChangeItem[] }
  | ({ kind: "diff" } & FileDiffPayload);
