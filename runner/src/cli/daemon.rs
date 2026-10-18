use std::fs;
use std::path::PathBuf;
use anyhow::{Context, Result};
use clap::Subcommand;
use colored::Colorize;
use sysinfo::{Pid, System};

use crate::config::get_default_config_path;

#[derive(Subcommand, Debug)]
pub enum DaemonAction {
    /// Register runner daemon to auto-start with Windows login (User-level, GPU enabled)
    Install,
    /// Remove runner daemon from Windows auto-start
    Uninstall,
    /// Launch runner daemon silently in the background
    Start,
    /// Stop running background daemon
    Stop,
    /// Restart background daemon
    Restart,
    /// Check background daemon status, process PID, and log path
    Status,
}

pub fn get_daemon_data_dir() -> PathBuf {
    let cfg_path = get_default_config_path();
    if let Some(parent) = cfg_path.parent() {
        if parent.exists() && parent != std::path::Path::new("") {
            return parent.to_path_buf();
        }
    }
    if let Some(data_dir) = dirs::data_local_dir() {
        let forgity_dir = data_dir.join("Forgity").join("runner");
        let _ = fs::create_dir_all(&forgity_dir);
        return forgity_dir;
    }
    PathBuf::from(".")
}

pub fn get_pid_file() -> PathBuf {
    get_daemon_data_dir().join("runner.pid")
}

pub fn get_log_file() -> PathBuf {
    let log_dir = get_daemon_data_dir().join("logs");
    let _ = fs::create_dir_all(&log_dir);
    log_dir.join("daemon.log")
}

pub fn read_pid() -> Option<u32> {
    let pid_file = get_pid_file();
    if !pid_file.exists() {
        return None;
    }
    let content = fs::read_to_string(&pid_file).ok()?;
    content.trim().parse::<u32>().ok()
}

pub fn write_pid(pid: u32) -> Result<()> {
    let pid_file = get_pid_file();
    fs::write(&pid_file, pid.to_string())
        .with_context(|| format!("Failed to write PID file at {}", pid_file.display()))?;
    Ok(())
}

pub fn remove_pid() {
    let pid_file = get_pid_file();
    let _ = fs::remove_file(pid_file);
}

pub fn is_pid_running(pid: u32) -> bool {
    let mut system = System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let sys_pid = Pid::from_u32(pid);
    if let Some(process) = system.process(sys_pid) {
        let name = process.name().to_string_lossy().to_lowercase();
        name.contains("forgity") || name.contains("runner")
    } else {
        false
    }
}

pub fn is_autostart_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(run_key) = hkcu.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run") {
            let val: Result<String, _> = run_key.get_value("ForgityRunner");
            return val.is_ok();
        }
    }
    false
}

pub async fn run_daemon(action: DaemonAction) -> Result<()> {
    match action {
        DaemonAction::Install => install_daemon().await,
        DaemonAction::Uninstall => uninstall_daemon().await,
        DaemonAction::Start => start_daemon().await,
        DaemonAction::Stop => stop_daemon().await,
        DaemonAction::Restart => {
            let _ = stop_daemon().await;
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
            start_daemon().await
        }
        DaemonAction::Status => show_daemon_status().await,
    }
}

async fn install_daemon() -> Result<()> {
    println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO — INSTALL RUNNER DAEMON".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    let current_exe = std::env::current_exe()
        .context("Could not determine current executable path")?;

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run_key, _) = hkcu
            .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
            .context("Failed to open HKCU Run registry key")?;

        let run_cmd = format!("\"{}\" daemon start", current_exe.display());
        run_key
            .set_value("ForgityRunner", &run_cmd)
            .context("Failed to write ForgityRunner entry to HKCU Run key")?;

        println!(
            "{} Registered in Windows Auto-Start (HKCU Run).",
            "✓".green().bold()
        );
        println!("   Command: {}", run_cmd.cyan());
        println!("   Session: User Session (Full GPU acceleration enabled for Blender & Unreal Engine)");
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("Auto-start registration is currently optimized for Windows workstations.");
    }

    // If daemon is not yet running, start it immediately
    if let Some(pid) = read_pid() {
        if is_pid_running(pid) {
            println!(
                "{} Background daemon is already active (PID: {}).",
                "✓".green().bold(),
                pid
            );
            return Ok(());
        }
    }

    println!("\nStarting background daemon now...");
    start_daemon().await?;

    Ok(())
}

async fn uninstall_daemon() -> Result<()> {
    println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO — UNINSTALL RUNNER DAEMON".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    // 1. Stop daemon if running
    let _ = stop_daemon().await;

    // 2. Remove registry entry
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(run_key) = hkcu.open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            KEY_WRITE,
        ) {
            let _ = run_key.delete_value("ForgityRunner");
            println!(
                "{} Removed ForgityRunner from Windows Auto-Start.",
                "✓".green().bold()
            );
        } else {
            println!("   ForgityRunner entry was not found in registry.");
        }
    }

    remove_pid();
    println!("{} Daemon uninstalled successfully.", "✓".green().bold());
    Ok(())
}

async fn start_daemon() -> Result<()> {
    let current_exe = std::env::current_exe()
        .context("Could not determine current executable path")?;

    if let Some(pid) = read_pid() {
        if is_pid_running(pid) {
            println!(
                "{} Forgity Runner daemon is already running (PID: {}).",
                "INFO:".yellow().bold(),
                pid
            );
            println!("   Run '{}' if you wish to restart.", "forgity-runner daemon restart".cyan());
            return Ok(());
        } else {
            remove_pid();
        }
    }

    let log_file = get_log_file();
    let data_dir = get_daemon_data_dir();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let err_log = format!("{}.err", log_file.display());
        let stdout_file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file)
            .context("Failed to open daemon stdout log file")?;

        let stderr_file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&err_log)
            .context("Failed to open daemon stderr log file")?;

        let child = std::process::Command::new(&current_exe)
            .arg("start")
            .current_dir(&data_dir)
            .stdout(stdout_file)
            .stderr(stderr_file)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .context("Failed to launch runner daemon native process")?;

        let pid = child.id();
        write_pid(pid)?;

        println!(
            "{} Forgity Runner daemon launched in background.",
            "✓".green().bold()
        );
        println!("   PID     : {}", pid.to_string().green().bold());
        println!("   Log File: {}", log_file.display().to_string().cyan());
        println!("   Status  : {}", "ONLINE / LISTENING".green().bold());
        println!();
        println!("To check health: '{}'", "forgity-runner daemon status".cyan());
        println!("To stop daemon : '{}'", "forgity-runner daemon stop".cyan());
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("Background launch is currently optimized for Windows.");
    }

    Ok(())
}

async fn stop_daemon() -> Result<()> {
    let pid = match read_pid() {
        Some(p) => p,
        None => {
            println!("{} No background runner daemon PID found.", "INFO:".yellow().bold());
            return Ok(());
        }
    };

    let mut system = System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let sys_pid = Pid::from_u32(pid);

    if let Some(process) = system.process(sys_pid) {
        println!("Stopping background daemon (PID: {})...", pid);
        let _ = process.kill();
        remove_pid();
        println!("{} Forgity Runner daemon stopped.", "✓".green().bold());
    } else {
        remove_pid();
        println!(
            "{} Process with PID {} was not found (already terminated).",
            "INFO:".yellow().bold(),
            pid
        );
    }

    Ok(())
}

async fn show_daemon_status() -> Result<()> {
    println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO — RUNNER DAEMON STATUS".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    let pid = read_pid();
    let is_running = pid.map(|p| is_pid_running(p)).unwrap_or(false);
    let autostart = is_autostart_installed();
    let log_file = get_log_file();
    let data_dir = get_daemon_data_dir();

    println!("   Status       : {}", if is_running { "RUNNING (ACTIVE)".green().bold() } else { "STOPPED (INACTIVE)".red().bold() });
    if let Some(p) = pid {
        if is_running {
            println!("   Process PID  : {}", p.to_string().green().bold());
        } else {
            println!("   Stale PID    : {} (Process dead)", p.to_string().yellow());
        }
    }
    println!("   Auto-Start   : {}", if autostart { "ENABLED (Windows Startup HKCU)".green().bold() } else { "DISABLED".yellow() });
    println!("   Data Dir     : {}", data_dir.display().to_string().cyan());
    println!("   Log File     : {}", log_file.display().to_string().cyan());
    println!();

    if is_running {
        println!("Quick controls:");
        println!("  '{}' - Stop background daemon", "forgity-runner daemon stop".cyan());
        println!("  '{}' - Restart daemon", "forgity-runner daemon restart".cyan());
    } else {
        println!("Quick controls:");
        println!("  '{}' - Start background daemon", "forgity-runner daemon start".cyan());
        println!("  '{}' - Enable auto-start on login", "forgity-runner daemon install".cyan());
    }

    Ok(())
}
