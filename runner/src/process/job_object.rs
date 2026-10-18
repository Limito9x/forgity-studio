use anyhow::{Context, Result};
use std::mem::size_of;
use tracing::{debug, info};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

/// A safe wrapper around Windows Kernel Job Object.
/// When this struct is dropped (or the daemon process exits), Windows automatically
/// terminates all processes assigned to this job, guaranteeing no orphaned child processes.
pub struct JobObject {
    handle: HANDLE,
}

// Windows HANDLEs are Send across threads if managed safely
unsafe impl Send for JobObject {}
unsafe impl Sync for JobObject {}

impl JobObject {
    /// Creates a new Job Object configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
    pub fn create() -> Result<Self> {
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle == std::ptr::null_mut() || handle == INVALID_HANDLE_VALUE {
            return Err(anyhow::anyhow!("Failed to create Windows Job Object (Win32 error)"));
        }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let res = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };

        if res == 0 {
            unsafe { CloseHandle(handle) };
            return Err(anyhow::anyhow!("Failed to set KILL_ON_JOB_CLOSE on Job Object"));
        }

        debug!("Created Windows Job Object with KILL_ON_JOB_CLOSE protection");
        Ok(Self { handle })
    }

    /// Assigns a running process to this Job Object using its raw Win32 process HANDLE.
    pub fn assign_process(&self, process_handle: HANDLE) -> Result<()> {
        let res = unsafe { AssignProcessToJobObject(self.handle, process_handle) };
        if res == 0 {
            return Err(anyhow::anyhow!("Failed to assign process to Job Object"));
        }
        info!("Assigned process handle {:?} to Job Object", process_handle);
        Ok(())
    }

    /// Assigns a process by its OS Process ID (PID).
    pub fn assign_pid(&self, pid: u32) -> Result<()> {
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
        };

        let desired_access = PROCESS_SET_QUOTA | PROCESS_TERMINATE;
        let proc_handle = unsafe { OpenProcess(desired_access, 0, pid) };
        if proc_handle == std::ptr::null_mut() || proc_handle == INVALID_HANDLE_VALUE {
            return Err(anyhow::anyhow!(
                "Failed to open process PID {} for Job Object assignment",
                pid
            ));
        }

        let assign_res = self.assign_process(proc_handle);
        unsafe { CloseHandle(proc_handle) };
        assign_res.with_context(|| format!("Failed to assign PID {} to Job Object", pid))
    }
}

impl Drop for JobObject {
    fn drop(&mut self) {
        if self.handle != std::ptr::null_mut() && self.handle != INVALID_HANDLE_VALUE {
            debug!("Closing Job Object handle {:?} (triggering cleanup of any active child processes)", self.handle);
            unsafe {
                CloseHandle(self.handle);
            }
        }
    }
}
