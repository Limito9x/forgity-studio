use anyhow::Result;
use colored::Colorize;

use crate::storage::cache::StorageManager;
use crate::storage::cleaner::StorageCleaner;

pub async fn run_clean(all: bool, days: u64) -> Result<()> {
    println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO RUNNER — STORAGE & CACHE CLEANER".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    if all {
        println!("   Mode: {} (Purging temp, logs, and all cached assets/scripts)", "FULL PURGE".red().bold());
    } else {
        println!("   Mode: {} (Clearing temp files & logs older than {} days)", "MAINTENANCE".green().bold(), days);
    }
    println!();

    let storage = StorageManager::new(None);
    let cleaner = StorageCleaner::new(storage);

    let report = cleaner.clean(all, days).await?;

    println!("   {} Temporary items removed  : {}", "✓".green().bold(), report.temp_files_deleted.to_string().cyan());
    println!("   {} Outdated log files purged: {}", "✓".green().bold(), report.log_files_deleted.to_string().cyan());
    if all {
        println!("   {} Cached assets/scripts    : {}", "✓".green().bold(), report.cache_files_deleted.to_string().cyan());
    }
    println!(
        "   {} Total disk space freed   : {}\n",
        "✓".green().bold(),
        format!("{:.2} MB", report.bytes_freed as f64 / (1024.0 * 1024.0)).green().bold()
    );

    println!("{} Storage maintenance completed successfully.\n", "SUCCESS:".green().bold());
    Ok(())
}
