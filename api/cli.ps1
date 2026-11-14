param (
    [Parameter(Position=0, Mandatory=$true)]
    [string]$Command,

    [Parameter(Position=1)]
    [string]$Arg1,

    [Parameter(Position=2)]
    [string]$Arg2
)

$apiProject = Get-ChildItem -Path "src" -Recurse -Filter "*.Api.csproj" | Select-Object -First 1
if (-not $apiProject) {
    Write-Host "Error: Cannot find API project (*.Api.csproj) in src folder." -ForegroundColor Red
    exit 1
}
$apiPath = $apiProject.FullName
$rootNamespace = $apiProject.BaseName.Replace(".Api", "")

switch ($Command.ToLower()) {
    "build" {
        Write-Host "Checking for running API instances (port 5189/50051 or Automation.Api process)..." -ForegroundColor Cyan
        $ports = @(5189, 50051)
        foreach ($port in $ports) {
            $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($conns) {
                foreach ($conn in $conns) {
                    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                    if ($proc) {
                        Write-Host "Stopping process $($proc.ProcessName) (PID: $($proc.Id)) listening on port $port to prevent DLL locks..." -ForegroundColor Yellow
                        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
        $apiProcs = Get-Process -Name "Automation.Api" -ErrorAction SilentlyContinue
        if ($apiProcs) {
            foreach ($p in $apiProcs) {
                Write-Host "Stopping process Automation.Api (PID: $($p.Id))..." -ForegroundColor Yellow
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            }
        }
        Start-Sleep -Milliseconds 500
        Write-Host "Building entire solution (Automation.sln)..." -ForegroundColor Cyan
        dotnet build "Automation.sln"
    }
    "run" {
        Write-Host "Starting API with Hot Reload..." -ForegroundColor Cyan
        dotnet watch --project $apiPath run
    }
    "start" {
        Write-Host "Starting API (No Hot Reload)..." -ForegroundColor Cyan
        dotnet run --project $apiPath
    }
    "add-migration" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Host "Error: Module name and Migration name are required." -ForegroundColor Red
            Write-Host "Usage: .\cli add-migration <ModuleName> <MigrationName>" -ForegroundColor Yellow
            exit 1
        }
        $contextFile = Get-ChildItem -Path "src\Modules\$Arg1" -Recurse -Filter "*DbContext.cs" | Select-Object -First 1
        if (-not $contextFile) {
            Write-Host "Error: No DbContext found in module '$Arg1'." -ForegroundColor Red
            exit 1
        }
        $contextName = $contextFile.BaseName
        Write-Host "Adding migration '$Arg2' to module '$Arg1' (Context: $contextName)..." -ForegroundColor Cyan
        dotnet ef migrations add $Arg2 --project "src\Modules\$Arg1\$rootNamespace.$Arg1" --startup-project $apiPath --output-dir Infrastructure\Persistence\Migrations --context $contextName
    }
    "update-db" {
        if ($Arg1) {
            $modules = Get-Item -Path "src\Modules\$Arg1" -ErrorAction SilentlyContinue
            if (-not $modules) {
                Write-Host "Error: Module '$Arg1' not found." -ForegroundColor Red
                exit 1
            }
            Write-Host "Updating database for module '$Arg1'..." -ForegroundColor Cyan
        } else {
            Write-Host "Scanning all modules to update databases..." -ForegroundColor Cyan
            $modules = Get-ChildItem -Path "src\Modules" -Directory
        }

        foreach ($module in $modules) {
            # Check if module contains a DbContext
            $hasDbContext = Get-ChildItem -Path $module.FullName -Recurse -Filter "*DbContext.cs" | Select-Object -First 1
            if ($hasDbContext) {
                $contextName = $hasDbContext.BaseName
                Write-Host "Found DbContext ($contextName) in module: $($module.Name). Updating database..." -ForegroundColor Green
                dotnet ef database update --project "src\Modules\$($module.Name)\$rootNamespace.$($module.Name)" --startup-project $apiPath --context $contextName
            } else {
                Write-Host "Skipping module: $($module.Name) (No DbContext found)." -ForegroundColor DarkGray
            }
        }
        Write-Host "Database update complete!" -ForegroundColor Cyan
    }
    default {
        Write-Host "Unknown command: $Command" -ForegroundColor Red
        Write-Host "Available commands:" -ForegroundColor Green
        Write-Host "  .\cli build                                      - Stop any running API instances and build the solution"
        Write-Host "  .\cli run                                        - Run the API with Hot Reload (dotnet watch)"
        Write-Host "  .\cli start                                      - Run the API without Hot Reload (dotnet run)"
        Write-Host "  .\cli add-migration <ModuleName> <MigrationName> - Add a new EF Core migration to a specific module"
        Write-Host "  .\cli update-db [ModuleName]                     - Update the database for a specific module, or all if no name is given"
    }
}
