use serde::{Deserialize, Serialize};
use sysinfo::{Disks, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareSnapshot {
    pub os_platform: String,
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub total_ram_bytes: u64,
    pub primary_gpu_name: String,
    pub primary_gpu_vram_bytes: u64,
    pub hardware_details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedGpu {
    pub name: String,
    pub vram_bytes: u64,
    pub driver_version: String,
    pub pci_bus: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedDisk {
    pub mount: String,
    pub label: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub fs_type: String,
}

/// Retrieves a permanent, hardware-bound unique machine key that does not change across registrations.
pub fn get_permanent_machine_key() -> String {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DESKTOP".to_string());

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(crypto_key) = hklm.open_subkey(r"SOFTWARE\Microsoft\Cryptography") {
            if let Ok(guid) = crypto_key.get_value::<String, _>("MachineGuid") {
                let clean_guid = guid.replace('-', "");
                let short = if clean_guid.len() >= 14 {
                    &clean_guid[..14]
                } else {
                    &clean_guid
                };
                return format!("{}-{}", hostname, short);
            }
        }
    }

    format!("{}-PERMANENT", hostname)
}

pub fn get_hardware_snapshot() -> HardwareSnapshot {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_platform = System::long_os_version().unwrap_or_else(|| {
        format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)
    });

    let cpu_cores = sys.cpus().len().max(1);
    let cpu_model = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(read_cpu_from_registry);

    let total_ram_bytes = sys.total_memory();

    let gpus = detect_all_gpus();
    let (primary_gpu_name, primary_gpu_vram_bytes) = if let Some(first) = gpus.first() {
        (first.name.clone(), first.vram_bytes)
    } else {
        ("Software / Integrated Graphics".to_string(), 0)
    };

    let disks = detect_all_disks();

    let details = serde_json::json!({
        "gpus": gpus,
        "disks": disks,
        "architecture": std::env::consts::ARCH,
        "python_runtime_version": "Rust Native Runner 0.1.0",
        "logical_cores": cpu_cores,
        "physical_cores": cpu_cores.saturating_div(2).max(1),
        "environment_variables": {
            "OS": std::env::var("OS").unwrap_or_default(),
            "PROCESSOR_ARCHITECTURE": std::env::var("PROCESSOR_ARCHITECTURE").unwrap_or_default(),
        }
    })
    .to_string();

    HardwareSnapshot {
        os_platform,
        cpu_model,
        cpu_cores,
        total_ram_bytes,
        primary_gpu_name,
        primary_gpu_vram_bytes,
        hardware_details: details,
    }
}

pub fn detect_all_disks() -> Vec<DetectedDisk> {
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
        let fs_type = disk.file_system().to_string_lossy().to_string();

        result.push(DetectedDisk {
            mount,
            label,
            total_bytes: disk.total_space(),
            free_bytes: disk.available_space(),
            fs_type: if fs_type.is_empty() { "NTFS".to_string() } else { fs_type },
        });
    }

    result
}

fn read_cpu_from_registry() -> String {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(cpu_key) = hklm.open_subkey(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") {
            if let Ok(brand) = cpu_key.get_value::<String, _>("ProcessorNameString") {
                return brand.trim().to_string();
            }
        }
    }
    "Generic x86_64 CPU".to_string()
}

pub fn detect_all_gpus() -> Vec<DetectedGpu> {
    let mut gpus = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let class_guid = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        if let Ok(class_key) = hklm.open_subkey(class_guid) {
            for subkey_name in class_key.enum_keys().filter_map(Result::ok) {
                if !subkey_name.chars().all(|c| c.is_ascii_digit()) {
                    continue;
                }
                if let Ok(dev_key) = class_key.open_subkey(&subkey_name) {
                    let desc = dev_key
                        .get_value::<String, _>("DriverDesc")
                        .unwrap_or_default();

                    let desc_lower = desc.to_lowercase();
                    if desc.is_empty()
                        || desc_lower.contains("mirror")
                        || desc_lower.contains("rdp")
                        || desc_lower.contains("remote")
                    {
                        continue;
                    }

                    let driver_version = dev_key
                        .get_value::<String, _>("DriverVersion")
                        .unwrap_or_default();

                    let pci_bus = dev_key
                        .get_value::<String, _>("LocationInformation")
                        .unwrap_or_default();

                    // Read VRAM size
                    let vram_bytes = dev_key
                        .get_value::<u64, _>("HardwareInformation.qwMemorySize")
                        .or_else(|_| {
                            dev_key
                                .get_value::<u32, _>("HardwareInformation.MemorySize")
                                .map(|v| v as u64)
                        })
                        .unwrap_or(0);

                    gpus.push(DetectedGpu {
                        name: desc.trim().to_string(),
                        vram_bytes,
                        driver_version,
                        pci_bus,
                    });
                }
            }
        }
    }

    // Sort GPUs: Discrete NVIDIA (RTX/GeForce/GTX) -> Tier 1, Discrete AMD (RX) -> Tier 2, Others -> Tier 3
    // Sub-sort by largest VRAM
    gpus.sort_by(|a, b| {
        let tier = |name: &str| -> u8 {
            let lower = name.to_lowercase();
            if lower.contains("geforce")
                || lower.contains("rtx")
                || lower.contains("gtx")
                || lower.contains("quadro")
                || lower.contains("tesla")
            {
                1
            } else if lower.contains("radeon") && lower.contains("rx") {
                2
            } else {
                3
            }
        };

        let tier_a = tier(&a.name);
        let tier_b = tier(&b.name);

        match tier_a.cmp(&tier_b) {
            std::cmp::Ordering::Equal => b.vram_bytes.cmp(&a.vram_bytes),
            other => other,
        }
    });

    gpus
}
