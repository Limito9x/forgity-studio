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

pub fn scan_python() -> Vec<DccApp> {
    let mut found = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    let mut add_candidate = |path: PathBuf, name: String| {
        let path_str = path.to_string_lossy();
        if path_str.contains("WindowsApps") {
            return;
        }

        if path.is_file() {
            let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
            let norm = canonical.to_string_lossy().to_lowercase();
            if seen_paths.insert(norm) {
                let version = probe_python_version(&path);
                if version.starts_with("Python ") {
                    found.push(DccApp {
                        name,
                        version,
                        path,
                    });
                }
            }
        }
    };

    // 1. Windows 'py -0p' launcher
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("py").arg("-0p").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                // e.g. " -V:3.13 *        C:\Users\congt\AppData\Local\Programs\Python\Python313\python.exe"
                if let Some(pos) = line.find(':') {
                    let after = &line[pos..];
                    if let Some(drive_idx) = after.find(":\\") {
                        if drive_idx > 0 {
                            let start = drive_idx - 1;
                            let full_path = after[start..].trim();
                            add_candidate(PathBuf::from(full_path), "Python (py launcher)".to_string());
                        }
                    }
                }
            }
        }
    }

    // 2. Check PATH
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            for exe in &["python.exe", "python3.exe", "python"] {
                let candidate = dir.join(exe);
                if candidate.is_file() {
                    add_candidate(candidate, "Python (PATH)".to_string());
                }
            }
        }
    }

    // 3. Check Windows Registry & Known directories
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        for root in &[HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let hkey = RegKey::predef(*root);
            if let Ok(core_key) = hkey.open_subkey(r"SOFTWARE\Python\PythonCore") {
                for ver_name in core_key.enum_keys().filter_map(Result::ok) {
                    if let Ok(ver_key) = core_key.open_subkey(&ver_name) {
                        if let Ok(ip_key) = ver_key.open_subkey("InstallPath") {
                            if let Ok(dir_str) = ip_key.get_value::<String, _>("") {
                                let exe = PathBuf::from(dir_str).join("python.exe");
                                add_candidate(exe, format!("Python ({ver_name})"));
                            }
                        }
                    }
                }
            }
        }

        // Standard AppData paths
        if let Some(local_app_data) = dirs::data_local_dir() {
            let programs_python = local_app_data.join("Programs").join("Python");
            if programs_python.is_dir() {
                if let Ok(entries) = std::fs::read_dir(programs_python) {
                    for entry in entries.filter_map(Result::ok) {
                        let exe = entry.path().join("python.exe");
                        let folder_name = entry.file_name().to_string_lossy().to_string();
                        add_candidate(exe, format!("Python ({folder_name})"));
                    }
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

pub fn probe_python_version(path: &Path) -> String {
    let output = Command::new(path).arg("--version").output();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        let combined = if !stdout.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        for line in combined.lines() {
            if line.to_lowercase().starts_with("python ") {
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
            let pythons = scan_python();
            if let Some(first) = pythons.first() {
                Ok(first.path.clone())
            } else {
                Ok(PathBuf::from("python"))
            }
        }
        other => Err(anyhow::anyhow!("Unsupported executor type: {}", other)),
    }
}
