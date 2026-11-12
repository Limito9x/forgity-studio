using Automation.SharedKernel.Abstractions.Auth;

namespace Automation.SystemModule.Constants;

public class SystemPermissions
{
    public static AuditLogFeature AuditLogs { get; } = new();
    public static SystemSettingsFeature SystemSettings { get; } = new();
    public static StudiosFeature Studios { get; } = new();

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() => new()
    {
        { "AuditLogs", AuditLogs.All },
        { "SystemSettings", SystemSettings.All },
        { "Studios", Studios.All }
    };

    public class StudiosFeature() : BasePermission("system-studios")
    {
        public string GetAll => $"{Feature}:get-all";
        public string UpdateQuota => $"{Feature}:update-quota";

        public IReadOnlyList<string> All => [GetAll, UpdateQuota];
    }

    public class AuditLogFeature() : BasePermission("auditlogs")
    {
        public string GetAll => $"{Feature}:get-all";
        public string GetById => $"{Feature}:get-by-id";
        
        public IReadOnlyList<string> All => [GetAll, GetById];
    }
    
    public class SystemSettingsFeature() : BasePermission("systemsettings")
    {
        public string GetAll => $"{Feature}:get-all";
        public string GetById => $"{Feature}:get-by-id";
        public string Update => $"{Feature}:update";
        
        public IReadOnlyList<string> All => [GetAll, GetById, Update];
    }
}



