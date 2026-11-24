use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path};
use std::sync::Mutex;
use std::time::Duration;

use ignore::WalkBuilder;
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use tauri::Emitter;

use crate::models::{FileContent, FileNode};

/// Files larger than this are never loaded.
pub const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
/// Prefix inspected for binary detection.
const SNIFF_BYTES: usize = 8 * 1024;
/// Safety cap on recursive file listing for the quick-open palette.
const MAX_INDEXED_FILES: usize = 25_000;

/// Binary check on the first 8KB of `bytes`.
pub(crate) fn looks_binary(bytes: &[u8]) -> bool {
    content_inspector::inspect(&bytes[..bytes.len().min(SNIFF_BYTES)]).is_binary()
}

pub(crate) fn bytes_to_string(bytes: Vec<u8>) -> String {
    String::from_utf8(bytes).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

fn to_rel_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

pub(crate) fn list_dir_impl(root_path: &str, sub_path: Option<&str>) -> Result<Vec<FileNode>, String> {
    let root = Path::new(root_path);
    let sub = sub_path.filter(|s| !s.is_empty()).map(Path::new);

    // `sub_path` is relative to the root; refuse anything that could escape it.
    if let Some(sub) = sub {
        if !sub.components().all(|c| matches!(c, Component::Normal(_))) {
            return Err(format!("invalid sub_path: {}", sub.display()));
        }
    }
    let dir = sub.map_or_else(|| root.to_path_buf(), |s| root.join(s));

    let walker = WalkBuilder::new(&dir)
        .max_depth(Some(1))
        .hidden(false) // show dotfiles; `.git` is dropped below
        .require_git(false) // honour .gitignore even outside a repo
        .filter_entry(|e| e.depth() == 0 || e.file_name() != ".git")
        .build();

    let mut nodes = Vec::new();
    for entry in walker {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.depth() == 0 {
            continue;
        }
        let path = entry.path();
        nodes.push(FileNode {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            rel_path: to_rel_path(root, path),
            is_dir: entry.file_type().is_some_and(|t| t.is_dir()),
        });
    }

    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(nodes)
}

pub(crate) fn list_files_impl(root_path: &str) -> Result<Vec<FileNode>, String> {
    let root = Path::new(root_path);
    let walker = WalkBuilder::new(root)
        .hidden(false)
        .require_git(false)
        .filter_entry(|e| e.depth() == 0 || e.file_name() != ".git")
        .build();

    let mut files = Vec::new();
    for entry in walker {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.depth() == 0 || !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let path = entry.path();
        files.push(FileNode {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            rel_path: to_rel_path(root, path),
            is_dir: false,
        });
        if files.len() >= MAX_INDEXED_FILES {
            break;
        }
    }

    files.sort_by(|a, b| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()));
    Ok(files)
}

pub(crate) fn read_file_impl(file_path: &str) -> Result<FileContent, String> {
    let size = fs::metadata(file_path).map_err(|e| e.to_string())?.len();
    if size > MAX_FILE_BYTES {
        return Ok(FileContent { is_binary: true, content: String::new(), size });
    }
    let bytes = fs::read(file_path).map_err(|e| e.to_string())?;
    if looks_binary(&bytes) {
        return Ok(FileContent { is_binary: true, content: String::new(), size });
    }
    Ok(FileContent { is_binary: false, content: bytes_to_string(bytes), size })
}

/// Lists one directory level (folders first, then case-insensitive name order),
/// skipping `.git` and anything matched by ignore rules.
#[tauri::command]
pub async fn list_dir(root_path: String, sub_path: Option<String>) -> Result<Vec<FileNode>, String> {
    tauri::async_runtime::spawn_blocking(move || list_dir_impl(&root_path, sub_path.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// Recursively lists all non-ignored files under `root_path` for quick-open search.
#[tauri::command]
pub async fn list_files(root_path: String) -> Result<Vec<FileNode>, String> {
    tauri::async_runtime::spawn_blocking(move || list_files_impl(&root_path))
        .await
        .map_err(|e| e.to_string())?
}

/// Reads a text file. Binary files and files over 5MB yield `is_binary: true` with empty content.
#[tauri::command]
pub async fn read_file(file_path: String) -> Result<FileContent, String> {
    tauri::async_runtime::spawn_blocking(move || read_file_impl(&file_path))
        .await
        .map_err(|e| e.to_string())?
}

fn list_system_fonts_impl() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();

    let mut families = BTreeSet::new();
    for face in db.faces() {
        for (name, _) in &face.families {
            let trimmed = name.trim();
            // Skip macOS private/internal dot-prefixed system fonts (e.g. ".SF NS").
            if !trimmed.is_empty() && !trimmed.starts_with('.') {
                families.insert(trimmed.to_owned());
            }
        }
    }
    families.into_iter().collect()
}

/// Returns a sorted, deduplicated list of font family names installed on this machine.
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(list_system_fonts_impl)
        .await
        .map_err(|e| e.to_string())
}

/// Holds the active repository filesystem watcher so it is cleanly replaced on repo switch.
#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<Debouncer<RecommendedWatcher>>>);

fn should_notify_path(path: &Path) -> bool {
    let parts: Vec<String> = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();

    if let Some(git_pos) = parts.iter().position(|p| p == ".git") {
        // React to index/HEAD/ref updates (git add/commit/checkout) while ignoring noisy internals.
        return match parts.get(git_pos + 1).map(String::as_str) {
            Some("HEAD" | "index" | "refs" | "MERGE_HEAD") => true,
            _ => false,
        };
    }

    for part in &parts {
        if matches!(
            part.as_str(),
            "node_modules" | "target" | ".DS_Store" | ".turbo" | ".next"
        ) {
            return false;
        }
    }

    true
}

/// Starts (or replaces) a debounced recursive watcher on `root_path`, emitting `pore://fs-changed`
/// whenever relevant files or Git state change on disk. Pass `None` to stop watching.
#[tauri::command]
pub fn watch_repo(
    app: tauri::AppHandle,
    state: tauri::State<'_, WatcherState>,
    root_path: Option<String>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    // Drop any previous watcher first.
    *guard = None;

    let Some(root) = root_path.filter(|s| !s.is_empty()) else {
        return Ok(());
    };

    let mut debouncer =
        new_debouncer(Duration::from_millis(250), move |res: DebounceEventResult| {
            if let Ok(events) = res {
                if events.iter().any(|ev| should_notify_path(&ev.path)) {
                    let _ = app.emit("pore://fs-changed", ());
                }
            }
        })
        .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(debouncer);
    Ok(())
}
