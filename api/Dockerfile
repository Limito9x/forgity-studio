# =========================================================================
# Stage 1: Build & Publish (.NET 10 SDK)
# Context: Monorepo Root (cần packages/proto và api/)
# =========================================================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# 1. Copy Protobuf contracts (bắt buộc cho C# gRPC code-generation)
COPY packages/proto/ ./packages/proto/

# 2. Copy Solution và Directory.Build.props
COPY api/Directory.Build.props ./api/
COPY api/Automation.sln ./api/

# 3. Copy mã nguồn C# các module, SharedKernel và thư viện analyzer sidecar
COPY api/src/ ./api/src/
COPY api/lib/ ./api/lib/

# 4. Restore và Publish Release
RUN dotnet restore ./api/src/Automation.Api/Automation.Api.csproj
RUN dotnet publish ./api/src/Automation.Api/Automation.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

# =========================================================================
# Stage 2: Runtime (ASP.NET Core 10 + Python 3 Native AST Analyzer)
# =========================================================================
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Cài đặt Python 3 runtime phục vụ phân tích cú pháp tĩnh Python Script (AST Analyzer Sidecar)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Expose HTTP API và gRPC Ports
EXPOSE 5189
EXPOSE 50051

ENV PYTHON_PATH=python3
ENV ANALYZER_SCRIPT_PATH=/app/lib/analyzers/python_script_analyzer.py

COPY --from=build /app/publish .
COPY runner/scripts/ ./runner/scripts/
COPY api/lib/ ./lib/

ENTRYPOINT ["dotnet", "Automation.Api.dll"]
