using Automation.Studio.Contracts;
using Automation.Studio.Infrastructure.Persistence;

namespace Automation.Studio.Infrastructure.Services;

public class StudioApiService(StudioDbContext db) : IStudioApi, IProjectsApi
{
}
