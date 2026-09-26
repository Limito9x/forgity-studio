using Automation.SharedKernel.Abstractions.Modules;
using Automation.Identity;
using Automation.Files;
using Automation.Notifications;
using Automation.Platform;
using Automation.Studio;
using Automation.Content;
using Automation.Tag;
using Automation.Repository;
using Automation.Pipeline;
using Automation.DynamicForms;
using Automation.Runner;

namespace Automation.Api;

public static class ModuleRegistry
{
    public static readonly IModule[] All = 
    [
        new IdentityModule(),
        new SystemModule.SystemModule(),
        new FilesModule(),
        new NotificationsModule(),
        new PlatformModule(),
        new StudioModule(),
        new ContentModule(),
        new TagModule(),
        new RepositoryModule(),
        new PipelineModule(),
        new DynamicFormsModule(),
        new RunnerModule()
    ];

    public static List<Type> AllEndpoints
    {
        get
        {
            var endpoints = All.SelectMany(m => m.Endpoints ?? []).ToList();
#if DEBUG
            endpoints.Add(typeof(Dev.TestNotificationEndpoint));
#endif
            return endpoints;
        }
    }
}


