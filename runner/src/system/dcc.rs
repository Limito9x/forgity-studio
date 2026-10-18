use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct DccApp {
    pub name: String,
    pub version: String,
    pub path: PathBuf,
}

pub fn scan_blender() -> Vec<DccApp> {
    let mut found = Vec::new();

    // Standard search directories on Windows
    let search_roots = [
        PathBuf::from(r"C:\Program Files\Blender Foundation"),
        PathBuf::from(r"D:\Program Files\Blender Foundation"),
        PathBuf::from(r"C:\Blender"),
        PathBuf::from(r"D:\Blender"),
        PathBuf::from(r"D:\Games\Blender"),
    ];

    for root in &search_roots {
        if !root.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.filter_map(Result::ok) {
                let candidate = entry.path().join("blender.exe");
                if candidate.is_file() {
                    let version = probe_blender_version(&candidate);
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    found.push(DccApp {
                        name: format!("Blender ({folder_name})"),
                        version,
                        path: candidate,
                    });
                }
            }
        }
    }

    // Direct folder check if root itself contains blender.exe
    for root in &search_roots {
        let direct_exe = root.join("blender.exe");
        if direct_exe.is_file() && !found.iter().any(|a| a.path == direct_exe) {
            let version = probe_blender_version(&direct_exe);
            found.push(DccApp {
                name: "Blender".to_string(),
                version,
                path: direct_exe,
            });
        }
    }

    // Also check PATH
    if found.is_empty() {
        if let Ok(path_var) = std::env::var("PATH") {
            for dir in std::env::split_paths(&path_var) {
                let candidate = dir.join("blender.exe");
                if candidate.is_file() {
                    let version = probe_blender_version(&candidate);
                    found.push(DccApp {
                        name: "Blender (PATH)".to_string(),
                        version,
                        path: candidate,
                    });
                    break;
                }
            }
        }
    }

    found
}

pub fn scan_unreal() -> Vec<DccApp> {
    let mut found = Vec::new();

    let search_roots = [
        PathBuf::from(r"C:\Program Files\Epic Games"),
        PathBuf::from(r"D:\Program Files\Epic Games"),
        PathBuf::from(r"D:\Epic Games"),
        PathBuf::from(r"E:\Epic Games"),
    ];

    for root in &search_roots {
        if !root.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.filter_map(Result::ok) {
                let candidate = entry
                    .path()
                    .join("Engine")
                    .join("Binaries")
                    .join("Win64")
                    .join("UnrealEditor-Cmd.exe");
                if candidate.is_file() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    found.push(DccApp {
                        name: format!("Unreal Engine ({folder_name})"),
                        version: folder_name.replace("UE_", ""),
                        path: candidate,
                    });
                }
            }
        }
    }

    found
}

pub fn probe_blender_version(path: &Path) -> String {
    let output = Command::new(path).arg("--version").output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            if line.to_lowercase().starts_with("blender ") {
                return line.trim().to_string();
            }
        }
    }
    "Unknown".to_string()
}

/// Resolves the executable path based on the executor name ("blender", "unreal", "python").
pub fn resolve_executor_executable(executor: &str) -> anyhow::Result<PathBuf> {
    match executor.to_lowercase().as_str() {
        "blender" => {
            let blenders = scan_blender();
            if let Some(first) = blenders.first() {
                Ok(first.path.clone())
            } else {
                Err(anyhow::anyhow!("Blender executable not found on this machine. Please install Blender or run 'forgity-runner doctor'."))
            }
        }
        "unreal" => {
            let unreals = scan_unreal();
            if let Some(first) = unreals.first() {
                Ok(first.path.clone())
            } else {
                Err(anyhow::anyhow!("Unreal Engine executable not found on this machine."))
            }
        }
        "python" => {
            // Find python on PATH
            if let Ok(path_var) = std::env::var("PATH") {
                for dir in std::env::split_paths(&path_var) {
                    let candidate = dir.join("python.exe");
                    if candidate.is_file() {
                        return Ok(candidate);
                    }
                }
            }
            Ok(PathBuf::from("python"))
        }
        other => Err(anyhow::anyhow!("Unsupported executor type: {}", other)),
    }
}
