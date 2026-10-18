use anyhow::Result;
use std::path::{Path, PathBuf};
use sysinfo::Disks;

use crate::grpc::agent::{
    BrowseCommandResult, BrowseItemMessage, DriveInfoMessage, SystemPlaceMessage,
};

/// Retrieves logical disk drives with total and free space using sysinfo.
pub fn get_drives() -> Vec<DriveInfoMessage> {
    let disks = Disks::new_with_refreshed_list();
    let mut result = Vec::new();

    for disk in &disks {
        let mount = disk.mount_point().to_string_lossy().replace('\\', "/");
        let name = disk.name().to_string_lossy().to_string();
        let label = if name.is_empty() {
            format!("Drive ({})", mount.trim_end_matches('/'))
        } else {
            name
        };

        result.push(DriveInfoMessage {
            mount,
            label,
            total_bytes: disk.total_space() as i64,
            free_bytes: disk.available_space() as i64,
        });
    }

    result
}

/// Retrieves standard user quick access places (Home, Desktop, Downloads, Documents).
pub fn get_system_places() -> Vec<SystemPlaceMessage> {
    let mut places = Vec::new();

    if let Some(home) = dirs::home_dir() {
        places.push(SystemPlaceMessage {
            name: "Home".to_string(),
            path: home.to_string_lossy().replace('\\', "/"),
        });
    }

    if let Some(desktop) = dirs::desktop_dir() {
        places.push(SystemPlaceMessage {
            name: "Desktop".to_string(),
            path: desktop.to_string_lossy().replace('\\', "/"),
        });
    }

    if let Some(downloads) = dirs::download_dir() {
        places.push(SystemPlaceMessage {
            name: "Downloads".to_string(),
            path: downloads.to_string_lossy().replace('\\', "/"),
        });
    }

    if let Some(docs) = dirs::document_dir() {
        places.push(SystemPlaceMessage {
            name: "Documents".to_string(),
            path: docs.to_string_lossy().replace('\\', "/"),
        });
    }

    places
}

pub fn is_system_or_ignored(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.starts_with('.') || lower.starts_with('$') {
        return true;
    }
    const BLACKLIST: &[&str] = &[
        "system volume information",
        "recovery",
        "$recycle.bin",
        "recycler",
        "msdownld.baid",
        "pagefile.sys",
        "hiberfil.sys",
        "dumpstack.log",
        "swapfile.sys",
        "node_modules",
        "target",
        "venv",
        "__pycache__",
        ".idea",
        ".vscode",
        ".git",
    ];
    BLACKLIST.iter().any(|&item| lower == item)
}

/// Browses a directory on the workstation or returns root drives if target is empty.
pub fn browse_path(target_dir: &str) -> Result<BrowseCommandResult> {
    let trimmed = target_dir.trim();
    let drives = get_drives();
    let system_places = get_system_places();
    let pinned_folders = Vec::new();

    // If target is empty, return drive root overview
    if trimmed.is_empty() || trimmed == "/" || trimmed == "ROOT" {
        return Ok(BrowseCommandResult {
            current_path: "".to_string(),
            parent_path: "".to_string(),
            can_navigate_up: false,
            items: Vec::new(),
            system_places,
            pinned_folders,
            drives,
        });
    }

    let target_path = PathBuf::from(trimmed);
    if !target_path.exists() {
        return Err(anyhow::anyhow!("Directory does not exist: {}", trimmed));
    }

    let canonical = std::fs::canonicalize(&target_path)
        .unwrap_or(target_path);

    let clean_current = canonical.to_string_lossy()
        .replace(r"\\?\", "")
        .replace('\\', "/");

    let parent_path = canonical
        .parent()
        .map(|p| p.to_string_lossy().replace(r"\\?\", "").replace('\\', "/"))
        .unwrap_or_default();

    let can_navigate_up = !parent_path.is_empty();

    let mut items = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&canonical) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden or system files/folders by name
            if is_system_or_ignored(&file_name) {
                continue;
            }

            // On Windows, check native FILE_ATTRIBUTE_HIDDEN and FILE_ATTRIBUTE_SYSTEM flags
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::fs::MetadataExt;
                if let Ok(meta) = entry.metadata() {
                    let attrs = meta.file_attributes();
                    // 0x2 = FILE_ATTRIBUTE_HIDDEN, 0x4 = FILE_ATTRIBUTE_SYSTEM
                    if (attrs & (0x2 | 0x4)) != 0 {
                        continue;
                    }
                }
            }

            let is_dir = path.is_dir();
            let size_bytes = if is_dir {
                0
            } else {
                entry.metadata().map(|m| m.len() as i64).unwrap_or(0)
            };

            let clean_item_path = path.to_string_lossy()
                .replace(r"\\?\", "")
                .replace('\\', "/");

            items.push(BrowseItemMessage {
                name: file_name,
                path: clean_item_path,
                is_directory: is_dir,
                size_bytes,
            });
        }
    }

    // Sort items: directories first, then alphabetically
    items.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(BrowseCommandResult {
        current_path: clean_current,
        parent_path,
        can_navigate_up,
        items,
        system_places,
        pinned_folders,
        drives,
    })
}

/// Recursively scans resources in a directory, calculating SHA-256 for each matching file.
pub fn scan_resources(directory_path: &str, extensions: &[String]) -> Vec<crate::grpc::agent::ResourceItemMessage> {
    use sha2::{Digest, Sha256};
    use std::fs::File;
    use std::io::Read;

    let base_path = PathBuf::from(directory_path);
    if !base_path.exists() {
        return Vec::new();
    }

    let mut results = Vec::new();
    let ext_set: Option<std::collections::HashSet<String>> = if !extensions.is_empty() {
        Some(
            extensions
                .iter()
                .map(|e| {
                    let clean = e.trim().to_lowercase();
                    if clean.starts_with('.') {
                        clean
                    } else {
                        format!(".{}", clean)
                    }
                })
                .collect(),
        )
    } else {
        None
    };

    fn scan_dir_recursive(
        base: &Path,
        current: &Path,
        ext_set: &Option<std::collections::HashSet<String>>,
        results: &mut Vec<crate::grpc::agent::ResourceItemMessage>,
    ) {
        if let Ok(entries) = std::fs::read_dir(current) {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if is_system_or_ignored(&name) {
                    continue;
                }

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::fs::MetadataExt;
                    if let Ok(meta) = entry.metadata() {
                        let attrs = meta.file_attributes();
                        // 0x2 = FILE_ATTRIBUTE_HIDDEN, 0x4 = FILE_ATTRIBUTE_SYSTEM
                        if (attrs & (0x2 | 0x4)) != 0 {
                            continue;
                        }
                    }
                }

                if path.is_dir() {
                    scan_dir_recursive(base, &path, ext_set, results);
                } else if path.is_file() {
                    if let Some(ref exts) = ext_set {
                        let ext = path
                            .extension()
                            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
                            .unwrap_or_default();
                        if !exts.contains(&ext) {
                            continue;
                        }
                    }

                    let size_bytes = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
                    let hash = calculate_sha256(&path).unwrap_or_default();

                    let rel_path = path
                        .strip_prefix(base)
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| name.clone());

                    results.push(crate::grpc::agent::ResourceItemMessage {
                        relative_path: rel_path,
                        hash,
                        size_bytes,
                    });
                }
            }
        }
    }

    fn calculate_sha256(path: &Path) -> Result<String> {
        let mut file = File::open(path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 16384];

        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }

        Ok(hex::encode(hasher.finalize()))
    }

    scan_dir_recursive(&base_path, &base_path, &ext_set, &mut results);
    results
}
