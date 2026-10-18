use colored::Colorize;
use crate::system::dcc::{scan_blender, scan_unreal, DccApp};

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
