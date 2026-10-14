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

# 3. Copy mã nguồn C# các module và SharedKernel
COPY api/src/ ./api/src/

# 4. Restore và Publish Release
RUN dotnet restore ./api/src/Automation.Api/Automation.Api.csproj
RUN dotnet publish ./api/src/Automation.Api/Automation.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

# =========================================================================
# Stage 2: Runtime (ASP.NET Core 10 Chiseled - Siêu nhẹ, bảo mật, ~50MB)
# =========================================================================
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app

# Expose HTTP API và gRPC Ports
EXPOSE 5189
EXPOSE 50051

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "Automation.Api.dll"]
