//! IPC payloads. Field names are serialized as-is (snake_case) and must stay
//! in sync with `src/types/ipc.ts`.

use serde::Serialize;

/// One entry of a directory listing.
#[derive(Debug, Serialize)]
pub struct FileNode {
    pub name: String,
    /// Absolute path.
    pub path: String,
    /// Path relative to the root passed to `list_dir`, using `/` separators.
    pub rel_path: String,
    pub is_dir: bool,
}

/// Result of `read_file`. Binary / oversized files come back with `content == ""`.
#[derive(Debug, Serialize)]
pub struct FileContent {
    pub is_binary: bool,
    pub content: String,
    /// Size on disk in bytes.
    pub size: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
    Conflicted,
}

/// A changed file in the working tree. A file can be both staged and have
/// further unstaged edits, so both sides are reported independently.
#[derive(Debug, Serialize)]
pub struct GitChangeItem {
    /// Path relative to the repository root, using `/` separators.
    pub path: String,
    /// Status of HEAD → index (staged), if any.
    pub index_status: Option<ChangeStatus>,
    /// Status of index → working tree (unstaged / untracked), if any.
    pub worktree_status: Option<ChangeStatus>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffTag {
    Equal,
    Delete,
    Insert,
}

/// A run of text inside a diff line; `emphasized` marks word-level changes.
#[derive(Debug, Serialize)]
pub struct InlineSegment {
    pub text: String,
    pub emphasized: bool,
}

#[derive(Debug, Serialize)]
pub struct DiffLine {
    pub tag: DiffTag,
    /// 0-based line index in the old content (None for inserted lines).
    pub old_index: Option<usize>,
    /// 0-based line index in the new content (None for deleted lines).
    pub new_index: Option<usize>,
    /// Concatenating all segments yields the line text (including its trailing newline, if any).
    pub segments: Vec<InlineSegment>,
}

/// A unified-diff style hunk (3 lines of context). Starts are 1-based.
#[derive(Debug, Serialize)]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize)]
pub struct FileDiffPayload {
    /// Path relative to the repository root.
    pub path: String,
    /// Content at `HEAD` (empty if untracked / new / unborn branch).
    pub old_content: String,
    /// Content in the working tree (empty if deleted).
    pub new_content: String,
    /// True if either side is binary or larger than the size limit; contents and hunks are then empty.
    pub is_binary: bool,
    pub additions: usize,
    pub deletions: usize,
    pub hunks: Vec<DiffHunk>,
}

/// Return type of `get_git_status_and_diff`, discriminated by `kind`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum GitStatusOrDiff {
    Status { changes: Vec<GitChangeItem> },
    Diff(FileDiffPayload),
}
