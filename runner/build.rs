use std::path::{Path, PathBuf};

fn find_protoc() -> Option<PathBuf> {
    // 1. Check if PROTOC is already set
    if let Ok(path) = std::env::var("PROTOC") {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Check if protoc is in system PATH
    if which_protoc().is_some() {
        return None; // tonic-build will find it in PATH automatically
    }

    // 3. Look in standard NuGet cache for grpc.tools (available if .NET SDK has restored packages)
    if let Some(home) = dirs::home_dir() {
        let nuget_pattern = home.join(".nuget/packages/grpc.tools/*/tools/windows_x64/protoc.exe");
        if let Some(pattern_str) = nuget_pattern.to_str() {
            if let Ok(paths) = glob::glob(pattern_str) {
                let mut matches: Vec<PathBuf> = paths.filter_map(Result::ok).collect();
                // Pick the highest version
                matches.sort();
                if let Some(highest) = matches.pop() {
                    return Some(highest);
                }
            }
        }
    }

    None
}

fn which_protoc() -> Option<PathBuf> {
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join("protoc.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
            let candidate_unix = dir.join("protoc");
            if candidate_unix.is_file() {
                return Some(candidate_unix);
            }
        }
    }
    None
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Resolve protoc location
    if let Some(protoc_path) = find_protoc() {
        println!("cargo:warning=Using auto-detected protoc from: {}", protoc_path.display());
        std::env::set_var("PROTOC", protoc_path);
    }

    let proto_dir = Path::new("../packages/proto");
    let agent_proto = proto_dir.join("agent.proto");
    let execution_state_proto = proto_dir.join("execution_state.proto");

    println!("cargo:rerun-if-changed={}", agent_proto.display());
    println!("cargo:rerun-if-changed={}", execution_state_proto.display());

    tonic_build::configure()
        .build_server(false) // We only need the client in the runner
        .build_client(true)
        .build_transport(false) // Avoids collision between rpc Connect and client constructor connect()
        .compile_protos(
            &[agent_proto, execution_state_proto],
            &[proto_dir],
        )?;

    Ok(())
}
