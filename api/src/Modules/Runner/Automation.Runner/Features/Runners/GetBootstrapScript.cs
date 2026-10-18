using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace Automation.Runner.Features.Runners;

public record GetBootstrapScriptRequest
{
    public string ScriptName { get; init; } = default!;
    public string? Token { get; init; }
    public string? Url { get; init; }
    public string? Name { get; init; }
}

public class GetBootstrapScriptEndpoint(IConfiguration config) : Endpoint<GetBootstrapScriptRequest>
{
    public override void Configure()
    {
        Get("bootstrap/{scriptName}");
        Group<RunnersGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(GetBootstrapScriptRequest req, CancellationToken ct)
    {
        var scriptName = req.ScriptName.ToLowerInvariant();
        string content;

        var appName = config["AppConfig:Name"]?.Trim();
        if (string.IsNullOrWhiteSpace(appName))
        {
            appName = "Forgity Studio";
        }

        var foundPath = ResolveScriptPath(scriptName);
        if (foundPath is not null)
        {
            content = await File.ReadAllTextAsync(foundPath, ct);
        }
        else
        {
            // Inline fallback if script file is missing from container volume
            if (scriptName.EndsWith(".ps1"))
            {
                content = @"# Configuration - injected by server at generation time
$Url        = ""http://localhost:5189/api""
$Token      = """"
$Name       = """"
$AppName    = ""Forgity Studio""
$InstallDir = """"

$ErrorActionPreference = ""Stop""

$title = ""$AppName - NATIVE RUNNER SETUP"".ToUpper()
$bannerLine = ""="" * [Math]::Max(50, $title.Length + 6)
Write-Host $bannerLine -ForegroundColor Cyan
Write-Host (""   {0}   "" -f $title) -ForegroundColor Cyan
Write-Host $bannerLine -ForegroundColor Cyan

if (-not $InstallDir) {
    $InstallDir = ""$env:LOCALAPPDATA\Forgity\runner""
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$exePath = ""$InstallDir\forgity-runner.exe""

if (-not (Test-Path $exePath)) {
    $zipPath = ""$env:TEMP\forgity-runner.zip""
    Write-Host "" - Downloading forgity-runner package..."" -ForegroundColor Cyan
    $packageUrls = @(
        ""https://github.com/Limito9x/forgity-studio/releases/latest/download/forgity-runner.zip"",
        ""$Url/runners/bootstrap/package.zip""
    )
    $downloadSuccess = $false
    foreach ($pUrl in $packageUrls) {
        try {
            Write-Host ""   Fetching from $pUrl..."" -ForegroundColor Gray
            Invoke-WebRequest -Uri $pUrl -OutFile $zipPath -TimeoutSec 90
            Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            $downloadSuccess = $true
            Write-Host "" - Native runner extracted successfully."" -ForegroundColor Green
            break
        } catch {
            Write-Host ""   Could not download from $pUrl, trying alternative..."" -ForegroundColor DarkGray
        }
    }
    if (-not $downloadSuccess -or -not (Test-Path $exePath)) {
        Write-Host ""[ERROR] Failed to download forgity-runner package from all available sources."" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""`n - Registering workstation runner..."" -ForegroundColor Yellow
if ($Token) {
    & $exePath register --api-url $Url --token $Token
}

Write-Host ""`n=================================================="" -ForegroundColor Green
Write-Host "" [SUCCESS] FORGITY RUNNER READY & CONFIGURED!"" -ForegroundColor Green
Write-Host ""=================================================="" -ForegroundColor Green
Start-Process -FilePath $exePath -ArgumentList ""start"" -WindowStyle Minimized";
            }
            else
            {
                content = @"#!/usr/bin/env bash
echo ""[Automation Studio] Downloading runner...""";
            }
        }

        // Auto-inject Token, Url, Name, and AppName into the script
        // Thứ tự ưu tiên URL:
        // 1) query param ?url=...
        // 2) cấu hình RunnerBootstrap:PublicApiUrl trong appsettings/env
        // 3) runtime HTTP request (X-Forwarded-* headers từ reverse proxy hoặc trực tiếp từ Host)
        // 4) fallback an toàn
        string autoUrl;
        if (!string.IsNullOrWhiteSpace(req.Url))
        {
            autoUrl = req.Url.TrimEnd('/');
        }
        else if (!string.IsNullOrWhiteSpace(config["RunnerBootstrap:PublicApiUrl"]))
        {
            autoUrl = config["RunnerBootstrap:PublicApiUrl"]!.TrimEnd('/');
        }
        else
        {
            var forwardedProto = HttpContext.Request.Headers["X-Forwarded-Proto"].FirstOrDefault()
                                 ?? HttpContext.Request.Scheme;
            var forwardedHost = HttpContext.Request.Headers["X-Forwarded-Host"].FirstOrDefault()
                                ?? HttpContext.Request.Host.Value;
            var pathBase = HttpContext.Request.PathBase.Value ?? string.Empty;
            autoUrl = $"{forwardedProto}://{forwardedHost}{pathBase}/api".TrimEnd('/');
        }
        var effectiveUrl = autoUrl;
        var effectiveToken = req.Token ?? string.Empty;
        var effectiveName = req.Name ?? string.Empty;

        if (scriptName.EndsWith(".ps1"))
        {
            content = Regex.Replace(content, @"(?m)^\$Url\s*=.*$", $@"$Url        = ""{effectiveUrl}""");
            content = Regex.Replace(content, @"(?m)^\$Token\s*=.*$", $@"$Token      = ""{effectiveToken}""");
            content = Regex.Replace(content, @"(?m)^\$AppName\s*=.*$", $@"$AppName    = ""{appName}""");
            if (!string.IsNullOrEmpty(effectiveName))
            {
                content = Regex.Replace(content, @"(?m)^\$Name\s*=.*$", $@"$Name       = ""{effectiveName}""");
            }
        }
        else if (scriptName.EndsWith(".sh"))
        {
            content = Regex.Replace(content, @"(?m)^URL=.*$", $@"URL=""{effectiveUrl}""");
            content = Regex.Replace(content, @"(?m)^TOKEN=.*$", $@"TOKEN=""{effectiveToken}""");
            content = Regex.Replace(content, @"(?m)^APP_NAME=.*$", $@"APP_NAME=""{appName}""");
            if (!string.IsNullOrEmpty(effectiveName))
            {
                content = Regex.Replace(content, @"(?m)^NAME=.*$", $@"NAME=""{effectiveName}""");
            }
        }

        HttpContext.Response.ContentType = "text/plain; charset=utf-8";
        await HttpContext.Response.WriteAsync(content, ct);
    }

    private static string? ResolveScriptPath(string scriptName)
    {
        // 1. Check direct relative locations (published container, etc.)
        var direct = Path.Combine(AppContext.BaseDirectory, "workers", "scripts", scriptName);
        if (File.Exists(direct)) return direct;

        direct = Path.Combine(AppContext.BaseDirectory, "Scripts", scriptName);
        if (File.Exists(direct)) return direct;

        // 2. Scan upwards to locate workers/scripts/scriptName
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var target = Path.Combine(dir.FullName, "workers", "scripts", scriptName);
            if (File.Exists(target)) return target;
            dir = dir.Parent;
        }

        dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir != null)
        {
            var target = Path.Combine(dir.FullName, "workers", "scripts", scriptName);
            if (File.Exists(target)) return target;
            dir = dir.Parent;
        }

        return null;
    }
}
