use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMachineInfo {
    pub is_desktop: bool,
    pub hardware_fingerprint: String,
    pub machine_key: String,
    pub hostname: String,
}

fn compute_hardware_fingerprint() -> String {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(crypto_key) = hklm.open_subkey(r"SOFTWARE\Microsoft\Cryptography") {
            if let Ok(guid) = crypto_key.get_value::<String, _>("MachineGuid") {
                let mut hasher = Sha256::new();
                hasher.update(guid.trim().as_bytes());
                return format!("{:x}", hasher.finalize());
            }
        }
    }

    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DESKTOP".to_string());
    let mut hasher = Sha256::new();
    hasher.update(hostname.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn compute_permanent_machine_key(hostname: &str) -> String {
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

#[tauri::command]
fn get_local_machine_info() -> LocalMachineInfo {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DESKTOP".to_string());

    let hardware_fingerprint = compute_hardware_fingerprint();
    let machine_key = compute_permanent_machine_key(&hostname);

    LocalMachineInfo {
        is_desktop: true,
        hardware_fingerprint,
        machine_key,
        hostname,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_local_machine_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
