use colored::Colorize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct DccApp {
    pub name: String,
    pub version: String,
    pub path: PathBuf,
}

pub struct DoctorReport {
    pub os_name: String,
    pub cpu_cores: usize,
    pub blenders: Vec<DccApp>,
    pub unreals: Vec<DccApp>,
}

pub fn run_doctor() {
    println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO RUNNER — SYSTEM & DCC ENVIRONMENT DOCTOR".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    let report = collect_doctor_report();

    // 1. Hardware & OS
    println!("{}", " [1] System Hardware & OS".yellow().bold());
    println!("   OS Platform      : {}", report.os_name.green());
    println!("   Logical CPU Cores: {}", report.cpu_cores.to_string().green());
    println!();

    // 2. Blender Scan
    println!("{}", " [2] Blender 3D DCC Scanner".yellow().bold());
    if report.blenders.is_empty() {
        println!("   {} No Blender installations automatically detected.", "WARNING:".yellow().bold());
        println!("   {} Expected locations: 'C:\\Program Files\\Blender Foundation\\Blender X.X\\blender.exe'", "Tip:".dimmed());
    } else {
        for app in &report.blenders {
            println!(
                "   {} {} ({})\n      Path: {}",
                "✓".green().bold(),
                app.name.white().bold(),
                app.version.cyan(),
                app.path.display().to_string().dimmed()
            );
        }
    }
    println!();

    // 3. Unreal Engine Scan
    println!("{}", " [3] Unreal Engine DCC Scanner".yellow().bold());
    if report.unreals.is_empty() {
        println!("   {} No Unreal Engine installations automatically detected.", "WARNING:".yellow().bold());
        println!("   {} Expected locations: 'C:\\Program Files\\Epic Games\\UE_5.X\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe'", "Tip:".dimmed());
    } else {
        for app in &report.unreals {
            println!(
                "   {} {} ({})\n      Path: {}",
                "✓".green().bold(),
                app.name.white().bold(),
                app.version.cyan(),
                app.path.display().to_string().dimmed()
            );
        }
    }
    println!();

    // Summary Verdict
    let is_ready = !report.blenders.is_empty() || !report.unreals.is_empty();
    if is_ready {
        println!(
            "{} Runner environment is healthy and ready for headless 3D pipelines.\n",
            "SUCCESS:".green().bold()
        );
    } else {
        println!(
            "{} Neither Blender nor Unreal Engine was detected. Please install at least one DCC to execute 3D pipelines.\n",
            "ACTION REQUIRED:".red().bold()
        );
    }
}

pub fn collect_doctor_report() -> DoctorReport {
    let os_name = format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH);
    let cpu_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);

    let blenders = scan_blender();
    let unreals = scan_unreal();

    DoctorReport {
        os_name,
        cpu_cores,
        blenders,
        unreals,
    }
}

fn scan_blender() -> Vec<DccApp> {
    let mut found = Vec::new();

    // Standard search directories on Windows
    let search_roots = [
        PathBuf::from(r"C:\Program Files\Blender Foundation"),
        PathBuf::from(r"D:\Program Files\Blender Foundation"),
        PathBuf::from(r"C:\Blender"),
        PathBuf::from(r"D:\Blender"),
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

fn probe_blender_version(path: &Path) -> String {
    let output = Command::new(path)
        .arg("--version")
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            if line.to_lowercase().starts_with("blender ") {
                return line.trim().to_string();
            }
        }
    }
    "Unknown version".to_string()
}

fn scan_unreal() -> Vec<DccApp> {
    let mut found = Vec::new();

    let search_roots = [
        PathBuf::from(r"C:\Program Files\Epic Games"),
        PathBuf::from(r"D:\Epic Games"),
        PathBuf::from(r"E:\Epic Games"),
    ];

    for root in &search_roots {
        if !root.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.filter_map(Result::ok) {
                let ue_folder = entry.file_name().to_string_lossy().to_string();
                if ue_folder.starts_with("UE_") {
                    let candidate = entry
                        .path()
                        .join(r"Engine\Binaries\Win64\UnrealEditor-Cmd.exe");
                    if candidate.is_file() {
                        let version = ue_folder.replace("UE_", "Unreal Engine ");
                        found.push(DccApp {
                            name: format!("{version} (Headless Cmd)"),
                            version,
                            path: candidate,
                        });
                    }
                }
            }
        }
    }

    found
}
