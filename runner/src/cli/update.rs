use std::fs::{self, File};
use std::io::{self, Cursor};
use std::path::Path;
use anyhow::{bail, Context, Result};
use colored::Colorize;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize, Debug)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

pub async fn run_update(check_only: bool, force: bool) -> Result<()> {
    let current_version = env!("CARGO_PKG_VERSION");
    println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO — RUNNER SELF-UPDATE".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    println!(" - Current Version : {}", current_version.yellow().bold());
    println!(" - Checking latest release on GitHub...");

    let client = reqwest::Client::builder()
        .user_agent("forgity-runner")
        .build()?;

    let resp = client
        .get("https://api.github.com/repos/Limito9x/forgity-studio/releases/latest")
        .send()
        .await
        .context("Failed to query latest release from GitHub API")?;

    if !resp.status().is_success() {
        bail!("GitHub API returned error: {}", resp.status());
    }

    let release: GitHubRelease = resp.json().await
        .context("Failed to parse GitHub release metadata")?;

    let latest_tag = release.tag_name.trim();
    let latest_clean = latest_tag.trim_start_matches('v');

    println!(" - Latest Release : {} ({})", latest_tag.green().bold(), release.html_url.cyan());

    let is_newer = is_version_newer(latest_clean, current_version);

    if !is_newer && !force {
        println!("\n{} Runner is already up to date ({})!", "✓".green().bold(), current_version);
        return Ok(());
    }

    if check_only {
        println!("\n{} Update available: {} -> {}", "🚀".bold(), current_version.yellow(), latest_tag.green().bold());
        println!("Run '{}' to upgrade.", "forgity update".cyan());
        return Ok(());
    }

    println!("\n{} Upgrading runner: {} -> {}...", "⚡".yellow(), current_version, latest_tag);

    // Find asset
    let asset = release.assets.iter()
        .find(|a| a.name == "forgity-runner.zip" || a.name.ends_with(".zip"))
        .context("No compatible runner .zip asset found in the latest release")?;

    println!(" - Downloading {} ({:.2} MB)...", asset.name.cyan(), asset.size as f64 / 1_048_576.0);

    let zip_bytes = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .context("Failed to download release zip")?
        .bytes()
        .await
        .context("Failed to read response body")?;

    println!("{} Download complete. Preparing installation...", "✓".green());

    // Stop daemon if active
    let was_running = crate::cli::daemon::read_pid()
        .map(|p| crate::cli::daemon::is_pid_running(p))
        .unwrap_or(false);

    if was_running {
        println!(" - Stopping background daemon before binary replacement...");
        let _ = crate::cli::daemon::stop_daemon().await;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // Replace current binary
    let current_exe = std::env::current_exe()
        .context("Could not determine current executable path")?;
    let exe_dir = current_exe.parent().context("Invalid executable directory")?;

    // On Windows, rename current exe to .old
    #[cfg(target_os = "windows")]
    {
        let old_exe = current_exe.with_extension("exe.old");
        if old_exe.exists() {
            let _ = fs::remove_file(&old_exe);
        }
        if let Err(e) = fs::rename(&current_exe, &old_exe) {
            tracing::warn!("Could not rename existing executable: {}", e);
        }
    }

    // Extract zip
    println!(" - Extracting new runner binary to {}...", exe_dir.display());
    extract_zip(zip_bytes.as_ref(), exe_dir)
        .context("Failed to extract update package")?;

    // Clean up .old
    #[cfg(target_os = "windows")]
    {
        let old_exe = current_exe.with_extension("exe.old");
        if old_exe.exists() {
            let _ = fs::remove_file(old_exe);
        }
    }

    println!("{} Forgity Runner updated successfully to {}!", "✓".green().bold(), latest_tag);

    // If it was running as daemon, restart daemon
    if was_running {
        println!(" - Restarting background daemon...");
        if let Err(e) = crate::cli::daemon::start_daemon(None).await {
            eprintln!("Failed to restart background daemon automatically: {}", e);
            println!("You can start it manually with: '{}'", "forgity daemon start".cyan());
        }
    }

    println!("\n{}", "════════════════════════════════════════════════════════".green().bold());
    println!("{}", "   RUNNER SUCCESSFULLY UPDATED!".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".green().bold());

    Ok(())
}

fn extract_zip(bytes: &[u8], target_dir: &Path) -> Result<()> {
    let reader = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = File::create(&outpath)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let parse_ver = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };
    let l_parts = parse_ver(latest);
    let c_parts = parse_ver(current);

    for (l, c) in l_parts.iter().zip(c_parts.iter()) {
        if l > c { return true; }
        if l < c { return false; }
    }
    l_parts.len() > c_parts.len()
}
