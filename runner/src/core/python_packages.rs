//! Packages belong to a Python runtime and a requirements set, never to the DCC installation.
use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tracing::info;

use crate::storage::cache::{normalize_absolute_path, StorageManager};
use crate::system::dcc::resolve_executor_executable;

const RUNTIME_PROBE: &str = "import json,sys,sysconfig,platform; print(json.dumps([sys.implementation.name,sys.version,sysconfig.get_config_var('SOABI'),sysconfig.get_platform(),platform.machine()]))";
const COMPLETE: &str = ".forgity-complete";

async fn output(mut command: Command, description: &str) -> Result<std::process::Output> {
    command.kill_on_drop(true);
    let result = tokio::time::timeout(Duration::from_secs(600), command.output())
        .await
        .with_context(|| format!("Timed out: {description}"))?
        .with_context(|| format!("Could not execute: {description}"))?;
    if !result.status.success() {
        bail!(
            "{description} failed ({}): {}\n{}",
            result.status,
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
    }
    Ok(result)
}

pub async fn resolve_python(executor: &str, executable: &Path) -> Result<PathBuf> {
    let python = match executor.to_lowercase().as_str() {
        "python" => return Ok(executable.to_path_buf()),
        "unreal" => {
            // Engine/Binaries/Win64/UnrealEditor-Cmd.exe -> bundled Python, same Engine.
            executable
                .parent()
                .and_then(Path::parent)
                .context("Invalid Unreal executable path")?
                .join("ThirdParty/Python3/Win64/python.exe")
        }
        "blender" => {
            // Ask Blender for its own prefix instead of guessing its version folder.
            let mut command = Command::new(executable);
            command.args(["--background", "--factory-startup", "--python-exit-code", "1", "--python-expr",
                "import os,sys; print('FORGITY_PYTHON=' + os.path.join(sys.prefix, 'bin', 'python.exe'))"]);
            let result = output(command, "Probe Blender Python").await?;
            let stdout = String::from_utf8_lossy(&result.stdout);
            PathBuf::from(
                stdout
                    .lines()
                    .find_map(|line| line.strip_prefix("FORGITY_PYTHON="))
                    .context("Blender did not report its embedded Python")?
                    .trim(),
            )
        }
        other => bail!("Python dependencies are not supported for executor '{other}'"),
    };
    if !python.is_file() {
        bail!(
            "Embedded Python for '{executor}' not found at {}",
            python.display()
        );
    }
    Ok(normalize_absolute_path(std::fs::canonicalize(python)?))
}

pub fn cache_key(runtime: &str, requirements: &[String]) -> String {
    use sha2::{Digest, Sha256};
    let mut requirements: Vec<_> = requirements
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    // Preserve case: requirement URLs and environment markers may be case sensitive.
    requirements.sort_unstable();
    requirements.dedup();
    let input = serde_json::to_vec(&(runtime, requirements)).expect("serializable cache key");
    hex::encode(Sha256::digest(input))[..24].to_string()
}

pub async fn prepare(
    storage: &StorageManager,
    executor: &str,
    executable: &Path,
    requirements: &[String],
) -> Result<Option<PathBuf>> {
    let mut requirements: Vec<String> = requirements
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    requirements.sort();
    requirements.dedup();
    if requirements.is_empty() {
        return Ok(None);
    }
    // Dependencies are requirement specifiers, never pip command-line switches.
    if requirements.iter().any(|s| s.starts_with('-')) {
        bail!("Python dependencies must be package requirements, not pip options");
    }
    let python = resolve_python(executor, executable).await?;
    let mut probe = Command::new(&python);
    probe.args(["-I", "-c", RUNTIME_PROBE]);
    let runtime = String::from_utf8(
        output(probe, "Probe dependency Python runtime")
            .await?
            .stdout,
    )?;
    let key = cache_key(runtime.trim(), &requirements);
    let directory = storage.get_python_package_dir(&key);
    let marker = directory.join(COMPLETE);
    if tokio::fs::read_to_string(&marker).await.ok().as_deref() == Some(&key) {
        info!(
            "[Dependencies] Reusing isolated packages: {} (Python: {})",
            directory.display(),
            python.display()
        );
        return Ok(Some(directory));
    }

    // Install outside the final directory. An interrupted or failed pip never publishes a cache.
    let staging = storage
        .python_packages_dir()
        .join(format!("{key}.installing-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&staging).await?;
    info!(
        "[Dependencies] Installing {:?} for {} into {}",
        requirements,
        python.display(),
        staging.display()
    );
    let result = async {
        // --python runs pip against the target interpreter even if that interpreter has no pip.
        // No ensurepip or other writes to the embedded installation are needed.
        let installer = resolve_executor_executable("python")?;
        let mut command = Command::new(installer);
        command
            .args(["-I", "-m", "pip", "--python"])
            .arg(&python)
            .args([
                "install",
                "--disable-pip-version-check",
                "--no-input",
                "--ignore-installed",
                "--no-warn-script-location",
                "--target",
            ])
            .arg(&staging)
            .args(&requirements);
        output(command, "Install isolated Python dependencies").await?;
        tokio::fs::write(staging.join(COMPLETE), &key).await?;
        if directory.exists() {
            tokio::fs::remove_dir_all(&directory)
                .await
                .context("Could not remove incomplete Python package cache")?;
        }
        tokio::fs::rename(&staging, &directory).await?;
        Ok::<_, anyhow::Error>(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_dir_all(&staging).await;
    }
    result?;
    info!(
        "[Dependencies] Isolated package cache ready: {}",
        directory.display()
    );
    Ok(Some(directory))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_distinguishes_runtime_and_preserves_case_sensitive_requirements() {
        let deps = vec!["pydantic".into(), "openai".into()];
        assert_eq!(
            cache_key("cp311-win64", &deps),
            cache_key(
                "cp311-win64",
                &["openai".into(), " pydantic ".into(), "openai".into()]
            )
        );
        assert_ne!(
            cache_key("cp311-win64", &deps),
            cache_key("cp313-win64", &deps)
        );
        assert_ne!(
            cache_key("cp311-win64", &["pkg @ https://host/A.whl".into()]),
            cache_key("cp311-win64", &["pkg @ https://host/a.whl".into()])
        );
    }

    #[tokio::test]
    async fn empty_dependencies_do_not_require_python() {
        assert!(prepare(
            &StorageManager::new(None),
            "unknown",
            Path::new("missing"),
            &[]
        )
        .await
        .unwrap()
        .is_none());
    }

    #[tokio::test]
    async fn rejects_pip_options_and_missing_dcc_python() {
        assert!(prepare(
            &StorageManager::new(None),
            "python",
            Path::new("missing"),
            &["--user".into()]
        )
        .await
        .is_err());
        assert!(resolve_python(
            "unreal",
            Path::new("Z:/missing/Engine/Binaries/Win64/UnrealEditor-Cmd.exe")
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn local_wheel_cache_hit_incomplete_install_and_retry() -> Result<()> {
        let root =
            std::env::temp_dir().join(format!("forgity-package-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root)?;
        let result = local_wheel_cache_test(&root).await;
        std::fs::remove_dir_all(&root)?;
        result
    }

    async fn local_wheel_cache_test(root: &Path) -> Result<()> {
        let python = resolve_executor_executable("python")?;
        let wheel = root.join("forgity_cache_probe-1.0-py3-none-any.whl");
        let mut create = Command::new(&python);
        create.args(["-I", "-c", r#"
import sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as wheel:
    wheel.writestr('forgity_cache_probe.py', 'value = 42\n')
    wheel.writestr('forgity_cache_probe-1.0.dist-info/METADATA', 'Metadata-Version: 2.1\nName: forgity-cache-probe\nVersion: 1.0\n')
    wheel.writestr('forgity_cache_probe-1.0.dist-info/WHEEL', 'Wheel-Version: 1.0\nGenerator: forgity-test\nRoot-Is-Purelib: true\nTag: py3-none-any\n')
    wheel.writestr('forgity_cache_probe-1.0.dist-info/RECORD', '')
"#]).arg(&wheel);
        output(create, "Create local test wheel").await?;
        let storage = StorageManager::new(Some(root.to_path_buf()));
        let deps = vec![wheel.to_string_lossy().to_string()];
        let directory = prepare(&storage, "python", &python, &deps).await?.unwrap();
        assert!(directory.join(COMPLETE).is_file());

        let mut import = Command::new(&python);
        import.args(["-I", "-c", "import sys; sys.path.insert(0,sys.argv[1]); import forgity_cache_probe; assert forgity_cache_probe.value == 42"]).arg(&directory);
        output(import, "Import installed local wheel").await?;

        // A cache hit must work with the source wheel unavailable (no second pip invocation).
        let hidden = wheel.with_extension("hidden");
        std::fs::rename(&wheel, &hidden)?;
        assert_eq!(
            prepare(&storage, "python", &python, &deps).await?.unwrap(),
            directory
        );

        // Simulate an interrupted install: a directory alone is not a valid cache.
        std::fs::remove_file(directory.join(COMPLETE))?;
        assert!(prepare(&storage, "python", &python, &deps).await.is_err());
        assert!(!directory.join(COMPLETE).exists());
        let mut entries = tokio::fs::read_dir(storage.python_packages_dir()).await?;
        while let Some(entry) = entries.next_entry().await? {
            assert!(!entry.file_name().to_string_lossy().contains(".installing-"));
        }
        std::fs::rename(&hidden, &wheel)?;
        assert_eq!(
            prepare(&storage, "python", &python, &deps).await?.unwrap(),
            directory
        );
        assert!(directory.join(COMPLETE).is_file());
        Ok(())
    }

    #[tokio::test]
    #[ignore = "Downloads packages; requires FORGITY_TEST_UNREAL_EXE"]
    async fn unreal_pydantic_openai_smoke() -> Result<()> {
        let executable = PathBuf::from(std::env::var("FORGITY_TEST_UNREAL_EXE")?);
        let python = resolve_python("unreal", &executable).await?;
        let directory = prepare(
            &StorageManager::new(None),
            "unreal",
            &executable,
            &["pydantic".into(), "openai".into()],
        )
        .await?
        .unwrap();
        let mut import = Command::new(&python);
        import.args(["-I", "-c", "import sys; sys.path.insert(0, sys.argv[1]); import pydantic, pydantic_core, openai; from pydantic import BaseModel; M=type('M',(BaseModel,),{'__annotations__':{'value':int}}); assert M(value='42').model_dump()=={'value':42}; print(pydantic.__version__, openai.__version__); print(pydantic_core.__file__)"]).arg(&directory);
        let result = output(import, "Import pydantic/openai with Unreal Python").await?;
        println!(
            "{}\nCache: {}",
            String::from_utf8_lossy(&result.stdout),
            directory.display()
        );
        Ok(())
    }
}
