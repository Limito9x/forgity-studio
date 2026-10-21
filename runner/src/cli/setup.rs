use anyhow::{Context, Result};
use colored::Colorize;
use std::fs;
use std::path::{Path, PathBuf};

pub fn get_global_bin_dir() -> PathBuf {
    if let Some(data_dir) = dirs::data_local_dir() {
        let bin_dir = data_dir.join("Forgity").join("bin");
        let _ = fs::create_dir_all(&bin_dir);
        return bin_dir;
    }
    PathBuf::from("bin")
}

pub async fn run_setup() -> Result<()> {
    println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO — GLOBAL CLI & WORKSTATION SETUP".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    let current_exe = std::env::current_exe()
        .context("Could not determine current executable path")?;

    let bin_dir = get_global_bin_dir();
    let runner_target = bin_dir.join("forgity-runner.exe");
    let alias_target = bin_dir.join("forgity.exe");

    println!(" [1] Installing global binaries into: {}", bin_dir.display().to_string().cyan());

    // 1. Copy forgity-runner.exe
    if current_exe != runner_target {
        fs::copy(&current_exe, &runner_target)
            .with_context(|| format!("Failed to copy executable to {:?}", runner_target))?;
        println!("     {} Installed {}", "✓".green().bold(), "forgity-runner.exe".white().bold());
    } else {
        println!("     {} Binary already running from target location", "✓".green().bold());
    }

    // 2. Copy alias forgity.exe
    if current_exe != alias_target {
        fs::copy(&current_exe, &alias_target)
            .with_context(|| format!("Failed to create alias executable {:?}", alias_target))?;
        println!("     {} Installed alias {}", "✓".green().bold(), "forgity.exe".cyan().bold());
    }

    // 3. Configure Windows User PATH Registry
    #[cfg(target_os = "windows")]
    {
        println!("\n [2] Checking Windows User PATH Environment...");
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (env_key, _) = hkcu
            .create_subkey("Environment")
            .context("Failed to open HKCU\\Environment registry key")?;

        let current_path: String = env_key.get_value("Path").unwrap_or_default();
        let bin_dir_str = bin_dir.to_string_lossy().to_string();

        let path_parts: Vec<&str> = current_path
            .split(';')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        let already_in_path = path_parts.iter().any(|p| {
            p.eq_ignore_ascii_case(&bin_dir_str)
                || Path::new(p) == bin_dir.as_path()
        });

        if already_in_path {
            println!(
                "     {} Directory is already present in User PATH.",
                "✓".green().bold()
            );
        } else {
            let mut new_path = current_path.clone();
            if !new_path.is_empty() && !new_path.ends_with(';') {
                new_path.push(';');
            }
            new_path.push_str(&bin_dir_str);

            env_key
                .set_value("Path", &new_path)
                .context("Failed to write updated Path to HKCU\\Environment")?;

            println!(
                "     {} Added '{}' to Windows User PATH.",
                "✓".green().bold(),
                bin_dir_str.yellow().bold()
            );

            // Broadcast WM_SETTINGCHANGE to notify running Windows processes
            broadcast_environment_change();
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("\n [2] PATH Configuration: Please add {} to your shell PATH.", bin_dir.display());
    }

    println!("\n{}", "════════════════════════════════════════════════════════".green().bold());
    println!("{}", "   SETUP COMPLETE! YOU CAN NOW USE 'forgity' ANYWHERE:".green().bold());
    println!("     • {}     : Check installed version", "forgity --version".cyan());
    println!("     • {}     : Inspect workstation GPUs, Blender & Unreal", "forgity doctor".cyan());
    println!("     • {}   : List configured environment variables", "forgity env list".cyan());
    println!("     • {} : Set an environment variable", "forgity env set <KEY> <VAL>".cyan());
    println!("     • {}      : Start the runner daemon", "forgity start".cyan());
    println!("{}", "════════════════════════════════════════════════════════\n".green().bold());

    Ok(())
}

#[cfg(target_os = "windows")]
fn broadcast_environment_change() {
    #[link(name = "user32")]
    extern "system" {
        fn SendMessageTimeoutW(
            hWnd: isize,
            Msg: u32,
            wParam: usize,
            lParam: *const u16,
            fuFlags: u32,
            uTimeout: u32,
            lpdwResult: *mut usize,
        ) -> isize;
    }

    let env_wide: Vec<u16> = "Environment\0".encode_utf16().collect();
    let mut result: usize = 0;
    unsafe {
        SendMessageTimeoutW(
            -1,     // HWND_BROADCAST (0xFFFF as isize)
            0x001A, // WM_SETTINGCHANGE
            0,
            env_wide.as_ptr(),
            2, // SMTO_ABORTIFHUNG
            3000,
            &mut result,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn broadcast_environment_change() {}

