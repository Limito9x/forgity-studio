using System.Security.Cryptography;
using System.Text.Json;
using Automation.Runner.Features.Runners;
using Automation.Runner.Infrastructure.Persistence;
using Automation.SharedKernel.Abstractions.Caching;
using Automation.SharedKernel.Abstractions.Security;
using Automation.SharedKernel.Infrastructure.RabbitMq;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NSubstitute;
using Xunit;

namespace Automation.Runner.Tests;

public class TestRunnerDbContext : RunnerDbContext
{
    public TestRunnerDbContext(DbContextOptions<RunnerDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var jsonConverter = new ValueConverter<JsonDocument?, string?>(
            v => v == null ? null : v.RootElement.GetRawText(),
            v => string.IsNullOrEmpty(v) ? null : JsonDocument.Parse(v, default));

        modelBuilder.Entity<Domain.Entities.RunnerExecutorConfig>(entity =>
        {
            entity.Property(e => e.Settings).HasConversion(jsonConverter);
        });
    }

    public static TestRunnerDbContext Create(string dbName)
    {
        var options = new DbContextOptionsBuilder<RunnerDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new TestRunnerDbContext(options);
    }
}

public class RegisterRunnerWithTokenTests : IDisposable
{
    private readonly TestRunnerDbContext _db;
    private readonly ICacheService _cache;
    private readonly ISecretProtector _secretProtector;
    private readonly IRabbitMqProvisioningService _provisioningService;

    public RegisterRunnerWithTokenTests()
    {
        _db = TestRunnerDbContext.Create(Guid.NewGuid().ToString());
        _db.Database.EnsureCreated();

        _cache = Substitute.For<ICacheService>();
        _secretProtector = Substitute.For<ISecretProtector>();
        _provisioningService = Substitute.For<IRabbitMqProvisioningService>();
        _provisioningService.ProvisionRunnerUserAsync(
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<Guid>(),
            Arg.Any<CancellationToken>()
        ).Returns(Result.Ok());

        // Mock secret protector to simply prefix/unprefix for predictable unit testing
        _secretProtector.Protect(Arg.Any<string>()).Returns(ci => "enc:" + ci.Arg<string>());
        _secretProtector.Unprotect(Arg.Any<string>()).Returns(ci =>
        {
            var val = ci.Arg<string>();
            return val.StartsWith("enc:") ? val.Substring(4) : val;
        });
    }

    public void Dispose()
    {
        _db.Dispose();
    }

    [Fact]
    public async Task HandleAsync_WhenNewRunnerRegisters_ShouldEncryptPasswordAndSaveHardwareFingerprint()
    {
        // Arrange
        var setupToken = "valid-setup-token";
        var machineKey = "DESKTOP-TEST1";
        var hardwareFingerprint = "hw-fingerprint-abc-123";

        _cache.GetAsync<RunnerSetupTokenMetadata>($"runner_setup_token:{setupToken}", Arg.Any<CancellationToken>())
            .Returns(new RunnerSetupTokenMetadata(null, null));

        var handler = new RegisterRunnerWithTokenHandler(_db, _cache, _secretProtector, _provisioningService);
        var command = new RegisterRunnerWithTokenCommand(
            Name: "Test Runner",
            MachineKey: machineKey,
            SetupToken: setupToken,
            HardwareFingerprint: hardwareFingerprint
        );

        // Act
        var result = await handler.HandleAsync(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        var savedRunner = await _db.Runners.FirstOrDefaultAsync(r => r.MachineKey == machineKey);
        Assert.NotNull(savedRunner);
        Assert.Equal(hardwareFingerprint, savedRunner.HardwareFingerprint);
        Assert.NotNull(savedRunner.RabbitMqEncryptedPassword);
        Assert.StartsWith("enc:", savedRunner.RabbitMqEncryptedPassword);
    }

    [Fact]
    public async Task HandleAsync_WhenExistingRunnerReRegisters_ShouldReuseExistingRabbitMqPassword()
    {
        // Arrange
        var setupToken = "valid-re-setup-token";
        var machineKey = "DESKTOP-EXISTING";
        var originalRawPassword = "existing-secret-password-xyz";
        var originalEncryptedPassword = "enc:" + originalRawPassword;

        var existingRunner = new Domain.Entities.Runner
        {
            Id = Guid.NewGuid(),
            Name = "Existing Runner",
            MachineKey = machineKey,
            RegistrationToken = "existing-token-abc",
            RabbitMqEncryptedPassword = originalEncryptedPassword,
            HardwareFingerprint = "old-hw-fp",
            IsActive = true
        };
        _db.Runners.Add(existingRunner);
        await _db.SaveChangesAsync();

        _cache.GetAsync<RunnerSetupTokenMetadata>($"runner_setup_token:{setupToken}", Arg.Any<CancellationToken>())
            .Returns(new RunnerSetupTokenMetadata(null, null));

        var handler = new RegisterRunnerWithTokenHandler(_db, _cache, _secretProtector, _provisioningService);
        var command = new RegisterRunnerWithTokenCommand(
            Name: "Existing Runner Updated",
            MachineKey: machineKey,
            SetupToken: setupToken,
            HardwareFingerprint: "new-hw-fp"
        );

        // Act
        var result = await handler.HandleAsync(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value.RabbitMq);
        Assert.Equal(originalRawPassword, result.Value.RabbitMq.Password);

        var updatedRunner = await _db.Runners.FirstOrDefaultAsync(r => r.MachineKey == machineKey);
        Assert.NotNull(updatedRunner);
        Assert.Equal("new-hw-fp", updatedRunner.HardwareFingerprint);
        Assert.Equal(originalEncryptedPassword, updatedRunner.RabbitMqEncryptedPassword);
    }
}
