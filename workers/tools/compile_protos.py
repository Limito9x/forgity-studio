import os
import sys
import subprocess

def run():
    worker_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    proto_dir = os.path.abspath(os.path.join(worker_root, "..", "packages", "proto"))
    core_dir = os.path.join(worker_root, "core")
    
    if not os.path.exists(proto_dir):
        print(f"[ERROR] Proto directory not found: {proto_dir}")
        return
        
    protos = [f for f in sorted(os.listdir(proto_dir)) if f.endswith(".proto")]
    if not protos:
        print(f"[WARNING] No .proto files found in {proto_dir}")
        return
        
    print(f"[INFO] Compiling {len(protos)} proto file(s) from {proto_dir} into {core_dir}...")
    proto_paths = [os.path.join(proto_dir, p) for p in protos]
    
    cmd = [
        sys.executable, "-m", "grpc_tools.protoc",
        f"-I{proto_dir}",
        f"--python_out={core_dir}",
        f"--grpc_python_out={core_dir}",
        *proto_paths
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        for p in protos:
            print(f"  [OK] Generated: {p}")
        print(f"[OK] All proto files compiled successfully into {core_dir}!")
    else:
        print(f"[ERROR] Failed to compile protos:\n{result.stderr}")

if __name__ == "__main__":
    run()
