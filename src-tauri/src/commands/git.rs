use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::time::Duration;

use git2::{ErrorCode, ObjectType, Repository, Status, StatusOptions};
use similar::{ChangeTag, TextDiff};

use super::fs::{bytes_to_string, looks_binary, MAX_FILE_BYTES};
use crate::models::{
    ChangeStatus, DiffHunk, DiffLine, DiffTag, FileDiffPayload, GitChangeItem, GitStatusOrDiff,
    InlineSegment,
};

const DIFF_CONTEXT_LINES: usize = 3;
const DIFF_TIMEOUT: Duration = Duration::from_secs(2);

fn git_err(e: git2::Error) -> String {
    e.message().to_owned()
}

fn index_status(s: Status) -> Option<ChangeStatus> {
    if s.contains(Status::INDEX_NEW) {
        Some(ChangeStatus::Added)
    } else if s.contains(Status::INDEX_RENAMED) {
        Some(ChangeStatus::Renamed)
    } else if s.contains(Status::INDEX_DELETED) {
        Some(ChangeStatus::Deleted)
    } else if s.intersects(Status::INDEX_MODIFIED | Status::INDEX_TYPECHANGE) {
        Some(ChangeStatus::Modified)
    } else {
        None
    }
}

fn worktree_status(s: Status) -> Option<ChangeStatus> {
    if s.contains(Status::WT_NEW) {
        Some(ChangeStatus::Untracked)
    } else if s.contains(Status::WT_RENAMED) {
        Some(ChangeStatus::Renamed)
    } else if s.contains(Status::WT_DELETED) {
        Some(ChangeStatus::Deleted)
    } else if s.intersects(Status::WT_MODIFIED | Status::WT_TYPECHANGE) {
        Some(ChangeStatus::Modified)
    } else {
        None
    }
}

fn list_changes(repo: &Repository) -> Result<Vec<GitChangeItem>, String> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(git_err)?;
    let mut changes: Vec<GitChangeItem> = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?.to_owned();
            let s = entry.status();
            let (index_status, worktree_status) = if s.contains(Status::CONFLICTED) {
                (Some(ChangeStatus::Conflicted), Some(ChangeStatus::Conflicted))
            } else {
                (index_status(s), worktree_status(s))
            };
            if index_status.is_none() && worktree_status.is_none() {
                return None;
            }
            Some(GitChangeItem { path, index_status, worktree_status })
        })
        .collect();
    changes.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(changes)
}

/// Normalizes `file_path` (absolute or repo-relative) to a repo-relative path.
fn repo_relative(workdir: &Path, file_path: &str) -> Result<String, String> {
    let p = Path::new(file_path);
    let rel = if p.is_absolute() {
        p.strip_prefix(workdir)
            .map(Path::to_path_buf)
            .or_else(|_| {
                // Handle symlinked prefixes such as /var → /private/var on macOS.
                let (p, w) = (p.canonicalize().map_err(|e| e.to_string())?, workdir.canonicalize().map_err(|e| e.to_string())?);
                p.strip_prefix(w).map(Path::to_path_buf).map_err(|e| e.to_string())
            })
            .map_err(|_| format!("{file_path} is outside the repository"))?
    } else {
        p.to_path_buf()
    };
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

/// Blob content of `rel` at HEAD. `None` if HEAD is unborn or the path is not tracked.
fn head_blob(repo: &Repository, rel: &str) -> Result<Option<Vec<u8>>, String> {
    let head = match repo.head() {
        Ok(h) => h,
        Err(e) if matches!(e.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound) => return Ok(None),
        Err(e) => return Err(git_err(e)),
    };
    let tree = head.peel_to_tree().map_err(git_err)?;
    let entry = match tree.get_path(Path::new(rel)) {
        Ok(e) => e,
        Err(e) if e.code() == ErrorCode::NotFound => return Ok(None),
        Err(e) => return Err(git_err(e)),
    };
    if entry.kind() != Some(ObjectType::Blob) {
        return Ok(None); // submodule / directory
    }
    let blob = repo.find_blob(entry.id()).map_err(git_err)?;
    Ok(Some(blob.content().to_vec()))
}

fn binary_payload(path: String) -> FileDiffPayload {
    FileDiffPayload {
        path,
        old_content: String::new(),
        new_content: String::new(),
        is_binary: true,
        additions: 0,
        deletions: 0,
        hunks: Vec::new(),
    }
}

fn build_hunks(old: &str, new: &str) -> (Vec<DiffHunk>, usize, usize) {
    let diff = TextDiff::configure().timeout(DIFF_TIMEOUT).diff_lines(old, new);
    let (mut additions, mut deletions) = (0, 0);

    let hunks = diff
        .grouped_ops(DIFF_CONTEXT_LINES)
        .iter()
        .filter(|group| !group.is_empty())
        .map(|group| {
            let (first, last) = (&group[0], &group[group.len() - 1]);
            let (old_start, new_start) = (first.old_range().start, first.new_range().start);

            let lines = group
                .iter()
                .flat_map(|op| diff.iter_inline_changes(op))
                .map(|change| {
                    let tag = match change.tag() {
                        ChangeTag::Equal => DiffTag::Equal,
                        ChangeTag::Delete => {
                            deletions += 1;
                            DiffTag::Delete
                        }
                        ChangeTag::Insert => {
                            additions += 1;
                            DiffTag::Insert
                        }
                    };
                    DiffLine {
                        tag,
                        old_index: change.old_index(),
                        new_index: change.new_index(),
                        segments: change
                            .iter_strings_lossy()
                            .map(|(emphasized, text)| InlineSegment {
                                text: text.into_owned(),
                                emphasized,
                            })
                            .collect(),
                    }
                })
                .collect();

            DiffHunk {
                old_start: old_start + 1,
                old_lines: last.old_range().end - old_start,
                new_start: new_start + 1,
                new_lines: last.new_range().end - new_start,
                lines,
            }
        })
        .collect();

    (hunks, additions, deletions)
}

fn file_diff(repo: &Repository, file_path: &str) -> Result<FileDiffPayload, String> {
    let workdir = repo.workdir().ok_or("bare repositories are not supported")?;
    let rel = repo_relative(workdir, file_path)?;
    let abs = workdir.join(&rel);

    let old_bytes = head_blob(repo, &rel)?.unwrap_or_default();
    let new_bytes = match fs::metadata(&abs) {
        Ok(m) if m.len() > MAX_FILE_BYTES => return Ok(binary_payload(rel)),
        Ok(_) => fs::read(&abs).map_err(|e| e.to_string())?,
        Err(e) if e.kind() == ErrorKind::NotFound => Vec::new(), // deleted in working tree
        Err(e) => return Err(e.to_string()),
    };

    if old_bytes.len() as u64 > MAX_FILE_BYTES || looks_binary(&old_bytes) || looks_binary(&new_bytes) {
        return Ok(binary_payload(rel));
    }

    let (old_content, new_content) = (bytes_to_string(old_bytes), bytes_to_string(new_bytes));
    let (hunks, additions, deletions) = build_hunks(&old_content, &new_content);
    Ok(FileDiffPayload { path: rel, old_content, new_content, is_binary: false, additions, deletions, hunks })
}

fn get_git_status_and_diff_impl(repo_path: &str, file_path: Option<&str>) -> Result<GitStatusOrDiff, String> {
    let repo = Repository::discover(repo_path).map_err(git_err)?;
    match file_path {
        None => Ok(GitStatusOrDiff::Status { changes: list_changes(&repo)? }),
        Some(file_path) => Ok(GitStatusOrDiff::Diff(file_diff(&repo, file_path)?)),
    }
}

/// Without `file_path`: lists changed files (staged, unstaged, untracked).
/// With `file_path`: returns HEAD vs. working-tree content plus line/word-level diff hunks.
#[tauri::command]
pub async fn get_git_status_and_diff(
    repo_path: String,
    file_path: Option<String>,
) -> Result<GitStatusOrDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_git_status_and_diff_impl(&repo_path, file_path.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::fs::{list_dir_impl, list_files_impl, read_file_impl};
    use git2::Signature;

    #[test]
    fn status_diff_and_listing() {
        let dir = std::env::temp_dir().join(format!("pore-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        let repo = Repository::init(&dir).unwrap();

        fs::write(dir.join("a.txt"), "one\ntwo\nthree\n").unwrap();
        fs::write(dir.join("sub/b.txt"), "b\n").unwrap();
        fs::write(dir.join(".gitignore"), "ignored.txt\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_all(["*"], git2::IndexAddOption::DEFAULT, None).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let sig = Signature::now("t", "t@t").unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();

        fs::write(dir.join("a.txt"), "one\nTWO\nthree\nfour\n").unwrap();
        fs::write(dir.join("new.txt"), "x\n").unwrap();
        fs::write(dir.join("ignored.txt"), "x\n").unwrap();
        fs::write(dir.join("bin.dat"), [0u8, 1, 2, 0, 0]).unwrap();

        let root = dir.to_str().unwrap();
        let GitStatusOrDiff::Status { changes } = get_git_status_and_diff_impl(root, None).unwrap() else { panic!() };
        let paths: Vec<_> = changes.iter().map(|c| c.path.as_str()).collect();
        assert_eq!(paths, ["a.txt", "bin.dat", "new.txt"]);

        let GitStatusOrDiff::Diff(d) = get_git_status_and_diff_impl(root, Some("a.txt")).unwrap() else { panic!() };
        assert_eq!((d.additions, d.deletions), (2, 1));
        assert_eq!(d.old_content, "one\ntwo\nthree\n");
        assert!(d.hunks[0].lines.iter().any(|l| l.segments.iter().any(|s| s.emphasized)));

        let GitStatusOrDiff::Diff(d) =
            get_git_status_and_diff_impl(root, Some(dir.join("new.txt").to_str().unwrap())).unwrap() else { panic!() };
        assert!(d.old_content.is_empty() && d.additions == 1);

        let names: Vec<_> = list_dir_impl(root, None).unwrap().into_iter().map(|n| n.name).collect();
        assert_eq!(names, ["sub", ".gitignore", "a.txt", "bin.dat", "new.txt"]);
        let all_rels: Vec<_> = list_files_impl(root).unwrap().into_iter().map(|n| n.rel_path).collect();
        assert_eq!(all_rels, [".gitignore", "a.txt", "bin.dat", "new.txt", "sub/b.txt"]);
        assert!(read_file_impl(dir.join("bin.dat").to_str().unwrap()).unwrap().is_binary);

        fs::remove_dir_all(&dir).unwrap();
    }
}
