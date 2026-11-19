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

        // Common root drives C:\Python*
        for drive in &["C:\\", "D:\\"] {
            if let Ok(entries) = std::fs::read_dir(drive) {
                for entry in entries.filter_map(Result::ok) {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    if folder_name.to_lowercase().starts_with("python") {
                        let exe = entry.path().join("python.exe");
                        add_candidate(exe, format!("Python ({folder_name})"));
                    }
                }
            }
        }

        // Conda / Miniconda / Pyenv user paths
        if let Some(user_dir) = dirs::home_dir() {
            for conda_folder in &["anaconda3", "miniconda3", "mambaforge", "miniforge3"] {
                let exe = user_dir.join(conda_folder).join("python.exe");
                add_candidate(exe, format!("Python (Conda: {conda_folder})"));
            }

            let pyenv_versions = user_dir.join(".pyenv").join("pyenv-win").join("versions");
            if pyenv_versions.is_dir() {
                if let Ok(entries) = std::fs::read_dir(pyenv_versions) {
                    for entry in entries.filter_map(Result::ok) {
                        let exe = entry.path().join("python.exe");
                        let folder_name = entry.file_name().to_string_lossy().to_string();
                        add_candidate(exe, format!("Python (pyenv: {folder_name})"));
                    }
                }
            }
        }

        // System-level Conda / ProgramData
        for pdata in &["C:\\ProgramData\\anaconda3", "C:\\ProgramData\\miniconda3"] {
            let exe = PathBuf::from(pdata).join("python.exe");
            add_candidate(exe, "Python (Conda: ProgramData)".to_string());
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

/// Reads `EngineAssociation` from a `.uproject` JSON file (e.g. `"5.4"`, `"5.5"`).
pub fn read_uproject_engine_version(uproject_path: &Path) -> Option<String> {
    let raw = std::fs::read_to_string(uproject_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let assoc = json.get("EngineAssociation")?.as_str()?.trim();
    if assoc.is_empty() {
        return None;
    }
    Some(assoc.to_string())
}

/// Resolves the executable path for an executor, taking `.uproject` Unreal version into account when applicable.
pub fn resolve_executor_executable_for_project(
    executor: &str,
    project_path: Option<&str>,
) -> anyhow::Result<PathBuf> {
    let key = executor.to_lowercase();
    if key == "unreal" {
        if let Some(proj) = project_path.map(str::trim).filter(|p| !p.is_empty()) {
            if let Some(version) = read_uproject_engine_version(Path::new(proj)) {
                let version_key = format!("unreal:{}", version.to_lowercase());
                if let Ok((Some(cfg), _)) = crate::config::load_config(None, false) {
                    if let Some(executors) = cfg.executors {
                        if let Some(configured) = executors.get(&version_key) {
                            let trimmed = configured.trim().trim_matches('"');
                            let p = PathBuf::from(trimmed);
                            if p.is_file() {
                                return Ok(p);
                            }
                        }
                        if let Some(default_ue) = executors.get("unreal") {
                            let trimmed = default_ue.trim().trim_matches('"');
                            let p = PathBuf::from(trimmed);
                            if p.is_file() && trimmed.contains(&version) {
                                return Ok(p);
                            }
                        }
                    }
                }

                let unreals = scan_unreal();
                if let Some(matched) = unreals.into_iter().find(|u| u.version == version) {
                    return Ok(matched.path);
                }

                return Err(anyhow::anyhow!(
                    "Unreal Engine {} is required by '{}', but no matching UnrealEditor-Cmd.exe was found. Configure 'unreal:{}' in My Machine.",
                    version,
                    proj,
                    version
                ));
            }
        }
    }

    resolve_executor_executable(executor)
}

/// Resolves the executable path based on the executor name ("blender", "unreal", "python").
/// Checks user-configured `[executors]` in `runner.toml` first before falling back to auto-scan.
pub fn resolve_executor_executable(executor: &str) -> anyhow::Result<PathBuf> {
    let key = executor.to_lowercase();
    if let Ok((Some(cfg), _)) = crate::config::load_config(None, false) {
        if let Some(executors) = cfg.executors {
            if let Some(configured) = executors.get(&key) {
                let trimmed = configured.trim().trim_matches('"');
                if !trimmed.is_empty() {
                    let configured_path = PathBuf::from(trimmed);
                    if configured_path.is_file() {
                        return Ok(configured_path);
                    }
                    tracing::warn!(
                        "[DCC] Configured [executors].{} path '{}' does not exist; falling back to auto-scan.",
                        key,
                        trimmed
                    );
                }
            }
        }
    }

    match key.as_str() {
        "blender" => {
            let blenders = scan_blender();
            if let Some(first) = blenders.first() {
                Ok(first.path.clone())
            } else {
                Err(anyhow::anyhow!("Blender executable not found on this machine. Please install Blender or configure it in My Machine -> DCC Config."))
            }
        }
        "unreal" => {
            let unreals = scan_unreal();
            if let Some(first) = unreals.first() {
                Ok(first.path.clone())
            } else {
                Err(anyhow::anyhow!("Unreal Engine executable not found on this machine. Please install Unreal Engine or configure it in My Machine -> DCC Config."))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_python_finds_valid_installations() {
        let pythons = scan_python();
        println!("Detected Python installations: {:#?}", pythons);

        for py in &pythons {
            assert!(py.path.is_file(), "Path must be a valid file: {:?}", py.path);
            assert!(
                !py.path.to_string_lossy().contains("WindowsApps"),
                "Must not contain WindowsApps: {:?}",
                py.path
            );
            assert!(
                py.version.starts_with("Python "),
                "Version should start with 'Python ': {}",
                py.version
            );
        }
    }

    #[test]
    fn test_probe_python_version() {
        let pythons = scan_python();
        if let Some(first) = pythons.first() {
            let version = probe_python_version(&first.path);
            assert!(
                version.starts_with("Python "),
                "probe_python_version returned invalid string: {}",
                version
            );
            assert_eq!(version, first.version);
        }
    }

    #[test]
    fn test_resolve_python_executable() {
        let res = resolve_executor_executable("python");
        assert!(res.is_ok(), "resolve_executor_executable('python') failed: {:?}", res);
        let path = res.unwrap();
        println!("Resolved python executable: {:?}", path);
    }
}
