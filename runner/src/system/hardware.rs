use serde::{Deserialize, Serialize};
use sysinfo::System;

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

    let (primary_gpu_name, primary_gpu_vram_bytes) = detect_primary_gpu();

    let details = serde_json::json!({
        "os_version": os_platform,
        "cpu_brand": cpu_model,
        "logical_cores": cpu_cores,
        "total_ram_bytes": total_ram_bytes,
        "gpu_name": primary_gpu_name,
        "gpu_vram_bytes": primary_gpu_vram_bytes,
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

fn detect_primary_gpu() -> (String, u64) {
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

                    // Attempt to read VRAM size
                    let vram_bytes = dev_key
                        .get_value::<u64, _>("HardwareInformation.qwMemorySize")
                        .or_else(|_| {
                            dev_key
                                .get_value::<u32, _>("HardwareInformation.MemorySize")
                                .map(|v| v as u64)
                        })
                        .unwrap_or(0);

                    return (desc.trim().to_string(), vram_bytes);
                }
            }
        }
    }

    ("Software / Integrated Graphics".to_string(), 0)
}
