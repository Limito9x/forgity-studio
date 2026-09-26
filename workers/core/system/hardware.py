import os
import sys
import string
import shutil
import platform
import subprocess
import logging

logger = logging.getLogger(__name__)


def get_os_info() -> str:
    """Return standard operating system platform string."""
    try:
        if os.name == "nt":
            ver = sys.getwindowsversion()
            build = ver.build
            # Windows 11 has build >= 22000
            os_name = "Windows 11" if build >= 22000 else "Windows 10"
            arch = platform.machine()
            return f"{os_name} {arch} (Build {build})"
        return f"{platform.system()} {platform.release()} ({platform.machine()})"
    except Exception as e:
        logger.debug(f"Failed to get OS info: {e}")
        return f"{platform.system()} {platform.machine()}"


def get_cpu_info() -> dict:
    """
    Get CPU model name, physical cores, and logical threads.
    Returns: {"model": str, "physical_cores": int, "logical_cores": int}
    """
    model = ""
    logical_cores = os.cpu_count() or 1
    physical_cores = logical_cores

    if os.name == "nt":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
                model = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        except Exception as e:
            logger.debug(f"Failed to read CPU from registry: {e}")

    if not model:
        model = platform.processor() or "Unknown CPU"

    return {
        "model": model,
        "physical_cores": physical_cores,
        "logical_cores": logical_cores,
    }


def get_ram_info() -> dict:
    """
    Get total RAM and currently available RAM in bytes.
    Returns: {"total_bytes": int, "available_bytes": int}
    """
    if os.name == "nt":
        try:
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_uint32),
                    ("dwMemoryLoad", ctypes.c_uint32),
                    ("ullTotalPhys", ctypes.c_uint64),
                    ("ullAvailPhys", ctypes.c_uint64),
                    ("ullTotalPageFile", ctypes.c_uint64),
                    ("ullAvailPageFile", ctypes.c_uint64),
                    ("ullTotalVirtual", ctypes.c_uint64),
                    ("ullAvailVirtual", ctypes.c_uint64),
                    ("ullAvailExtendedVirtual", ctypes.c_uint64),
                ]

            mem = MEMORYSTATUSEX()
            mem.dwLength = ctypes.sizeof(mem)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
                return {
                    "total_bytes": int(mem.ullTotalPhys),
                    "available_bytes": int(mem.ullAvailPhys),
                }
        except Exception as e:
            logger.debug(f"Failed to get RAM via GlobalMemoryStatusEx: {e}")

    # Fallback to sysconf on Unix
    try:
        total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        return {"total_bytes": int(total), "available_bytes": 0}
    except Exception:
        pass

    return {"total_bytes": 0, "available_bytes": 0}


def get_gpus_info() -> list[dict]:
    """
    Detect all installed graphics adapters (NVIDIA, AMD, Intel).
    Returns list of:
    [{"name": str, "vram_bytes": int, "driver_version": str, "pci_bus": str}]
    """
    gpus = []

    # 1. On Windows, read directly from Registry Display Class (fast, no admin required, detects all GPUs)
    if os.name == "nt":
        try:
            import winreg
            class_guid = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, class_guid) as class_key:
                num_subkeys = winreg.QueryInfoKey(class_key)[0]
                for i in range(num_subkeys):
                    subkey_name = winreg.EnumKey(class_key, i)
                    if not subkey_name.isdigit():
                        continue
                    try:
                        with winreg.OpenKey(class_key, subkey_name) as dev_key:
                            desc = ""
                            try:
                                desc = winreg.QueryValueEx(dev_key, "DriverDesc")[0].strip()
                            except Exception:
                                pass

                            if not desc or "mirror" in desc.lower() or "rdp" in desc.lower():
                                continue

                            version = ""
                            try:
                                version = winreg.QueryValueEx(dev_key, "DriverVersion")[0].strip()
                            except Exception:
                                pass

                            vram_bytes = 0
                            for mem_key in ["HardwareInformation.qwMemorySize", "HardwareInformation.MemorySize"]:
                                try:
                                    raw_vram = winreg.QueryValueEx(dev_key, mem_key)[0]
                                    if raw_vram and int(raw_vram) > 0:
                                        vram_bytes = int(raw_vram)
                                        break
                                except Exception:
                                    pass

                            pci_bus = ""
                            try:
                                pci_bus = winreg.QueryValueEx(dev_key, "LocationInformation")[0].strip()
                            except Exception:
                                pass

                            gpus.append({
                                "name": desc,
                                "vram_bytes": vram_bytes,
                                "driver_version": version,
                                "pci_bus": pci_bus,
                            })
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"Failed to scan GPUs via Windows registry: {e}")

    # 2. Try nvidia-smi if available (for exact VRAM & PCI bus ID if not found above)
    if not any("nvidia" in g["name"].lower() for g in gpus):
        try:
            cmd = [
                "nvidia-smi",
                "--query-gpu=name,memory.total,driver_version,pci.bus_id",
                "--format=csv,noheader,nounits"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            if res.returncode == 0:
                for line in res.stdout.strip().splitlines():
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 4:
                        name, mem_mb, drv, pci = parts[0], parts[1], parts[2], parts[3]
                        vram = int(float(mem_mb)) * 1024 * 1024
                        gpus.append({
                            "name": name,
                            "vram_bytes": vram,
                            "driver_version": drv,
                            "pci_bus": pci,
                        })
        except Exception:
            pass

    return gpus


def get_disks_info() -> list[dict]:
    """
    Enumerate all logical drives with total/free storage.
    Returns list of:
    [{"mount": str, "label": str, "total_bytes": int, "free_bytes": int, "fstype": str}]
    """
    disks = []

    if os.name == "nt":
        try:
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for letter in string.ascii_uppercase:
                if bitmask & 1:
                    mount = f"{letter}:/"
                    vol_name_buf = ctypes.create_unicode_buffer(1024)
                    fs_name_buf = ctypes.create_unicode_buffer(1024)
                    label = ""
                    fstype = "NTFS"

                    res = ctypes.windll.kernel32.GetVolumeInformationW(
                        ctypes.c_wchar_p(mount),
                        vol_name_buf,
                        ctypes.sizeof(vol_name_buf),
                        None,
                        None,
                        None,
                        fs_name_buf,
                        ctypes.sizeof(fs_name_buf)
                    )
                    if res:
                        label = vol_name_buf.value
                        fstype = fs_name_buf.value

                    total = 0
                    free = 0
                    try:
                        t, _, f = shutil.disk_usage(mount)
                        total = t
                        free = f
                    except Exception:
                        pass

                    disks.append({
                        "mount": mount,
                        "label": label or f"Local Disk ({letter}:)",
                        "total_bytes": total,
                        "free_bytes": free,
                        "fstype": fstype,
                    })
                bitmask >>= 1
        except Exception as e:
            logger.debug(f"Failed to get Windows disks: {e}")
    else:
        try:
            t, _, f = shutil.disk_usage("/")
            disks.append({
                "mount": "/",
                "label": "Root",
                "total_bytes": t,
                "free_bytes": f,
                "fstype": "ext4",
            })
        except Exception:
            pass

    return disks


def get_hardware_snapshot() -> dict:
    """
    Collect comprehensive hardware snapshot matching the backend schema:
    - Root indexable fields: os_platform, cpu_model, total_ram_bytes, primary_gpu_name, primary_gpu_vram_bytes
    - Detailed JSON snapshot: hardware_details
    """
    os_platform = get_os_info()
    cpu = get_cpu_info()
    ram = get_ram_info()
    gpus = get_gpus_info()
    disks = get_disks_info()

    # Identify primary GPU: Priority to discrete NVIDIA/AMD GPU or largest VRAM
    primary_gpu_name = ""
    primary_gpu_vram = 0

    if gpus:
        # Sort by: discrete priority (NVIDIA > AMD > others), then by largest VRAM
        def gpu_sort_key(g):
            name = g["name"].lower()
            tier = 3
            if "geforce" in name or "rtx" in name or "gtx" in name or "quadro" in name or "tesla" in name:
                tier = 1
            elif "radeon" in name and "rx" in name:
                tier = 2
            return (tier, -g["vram_bytes"])

        sorted_gpus = sorted(gpus, key=gpu_sort_key)
        primary = sorted_gpus[0]
        primary_gpu_name = primary["name"]
        primary_gpu_vram = primary["vram_bytes"]

    hardware_details = {
        "gpus": gpus,
        "disks": disks,
        "architecture": platform.machine(),
        "python_runtime_version": platform.python_version(),
        "logical_cores": cpu["logical_cores"],
        "physical_cores": cpu["physical_cores"],
        "environment_variables": {
            "OS": os.environ.get("OS", ""),
            "PROCESSOR_ARCHITECTURE": os.environ.get("PROCESSOR_ARCHITECTURE", ""),
        }
    }

    return {
        "os_platform": os_platform,
        "cpu_model": cpu["model"],
        "total_ram_bytes": ram["total_bytes"],
        "primary_gpu_name": primary_gpu_name,
        "primary_gpu_vram_bytes": primary_gpu_vram,
        "hardware_details": hardware_details,
    }


def print_summary():
    """Print readable hardware summary for CLI testing."""
    profile = get_hardware_snapshot()
    print("=================================================================")
    print("           AUTOMATION WORKSTATION HARDWARE PROFILE               ")
    print("=================================================================")
    print(f"  OS Platform       : {profile['os_platform']}")
    print(f"  CPU Model         : {profile['cpu_model']}")
    print(f"  Cores / Threads   : {profile['hardware_details']['physical_cores']} Cores / {profile['hardware_details']['logical_cores']} Threads")
    ram_gb = round(profile['total_ram_bytes'] / (1024**3), 2)
    print(f"  System RAM        : {ram_gb} GB ({profile['total_ram_bytes']:,} bytes)")
    
    print("\n  --- Graphics Adapters (GPUs) ---")
    gpus = profile['hardware_details']['gpus']
    if not gpus:
        print("    (No GPU detected)")
    for i, g in enumerate(gpus, start=1):
        vram_gb = round(g['vram_bytes'] / (1024**3), 2)
        is_primary = " [PRIMARY]" if g['name'] == profile['primary_gpu_name'] else ""
        print(f"    [{i}] {g['name']}{is_primary}")
        print(f"        VRAM          : {vram_gb} GB ({g['vram_bytes']:,} bytes)")
        print(f"        Driver Version: {g['driver_version']}")
        if g.get('pci_bus'):
            print(f"        PCI Bus       : {g['pci_bus']}")

    print("\n  --- Storage Disks ---")
    for d in profile['hardware_details']['disks']:
        total_gb = round(d['total_bytes'] / (1024**3), 1)
        free_gb = round(d['free_bytes'] / (1024**3), 1)
        print(f"    Drive {d['mount']:<4} [{d['label']}] ({d['fstype']}) : {free_gb} GB free / {total_gb} GB total")

    print("\n  --- Runtime Environment ---")
    print(f"  Architecture      : {profile['hardware_details']['architecture']}")
    print(f"  Python Runtime    : {profile['hardware_details']['python_runtime_version']}")
    print("=================================================================")


if __name__ == "__main__":
    print_summary()
