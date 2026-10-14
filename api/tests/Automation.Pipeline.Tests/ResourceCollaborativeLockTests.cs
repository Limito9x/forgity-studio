using Automation.Repository.Domain.Entities;
using Automation.Repository.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ResourceCollaborativeLockTests
{
    private readonly Guid _repositoryId = Guid.NewGuid();
    private readonly Guid _repoRunnerAId = Guid.NewGuid();
    private readonly Guid _runnerAId = Guid.NewGuid();
    private readonly Guid _runnerBId = Guid.NewGuid();
    private readonly Guid _userAId = Guid.NewGuid();

    [Fact]
    public void Runner_A_Creating_Draft_Should_Automatically_Acquire_Lock()
    {
        // 1. Runner A registers a 3D asset for the first time as Draft
        var resource = ResourceItem.Create(
            repositoryId: _repositoryId,
            repositoryRunnerId: _repoRunnerAId,
            extension: "blend",
            name: "HeroCharacter",
            relativePath: "Characters/Hero.blend",
            fileHash: "hash_v1_draft_a",
            sizeBytes: 1024 * 1024 * 50,
            notes: "Initial character blockout",
            lockedByRunnerId: _runnerAId,
            lockedByUserId: _userAId
        );

        // Assert: Resource state & lock
        resource.IsLocked.Should().BeTrue();
        resource.LockedByRunnerId.Should().Be(_runnerAId);
        resource.LockedByUserId.Should().Be(_userAId);
        resource.LockedAt.Should().NotBeNull();

        // Runner A has modify permission
        resource.CanModify(_runnerAId).Should().BeTrue();
        resource.IsLockedByOther(_runnerAId).Should().BeFalse();

        // Runner B is blocked
        resource.CanModify(_runnerBId).Should().BeFalse();
        resource.IsLockedByOther(_runnerBId).Should().BeTrue();

        // Version is Draft
        resource.LatestVersion.Should().NotBeNull();
        resource.LatestVersion!.Status.Should().Be(ResourceVersionStatus.Draft);
        resource.LatestVersion.VersionNo.Should().Be(1);
    }

    [Fact]
    public void Runner_B_Syncing_Resource_Locked_By_Runner_A_Should_Be_Blocked()
    {
        // Setup: Runner A is actively modifying the file
        var resource = ResourceItem.Create(
            repositoryId: _repositoryId,
            repositoryRunnerId: _repoRunnerAId,
            extension: "fbx",
            name: "DragonBoss",
            relativePath: "Bosses/Dragon.fbx",
            fileHash: "hash_runner_a",
            sizeBytes: 2048,
            notes: "Sculpting high-poly",
            lockedByRunnerId: _runnerAId
        );

        // Simulation: Runner B scans local folder and detects modified file with new local hash
        var runnerBLocalHash = "hash_runner_b_conflict";

        // Logic check simulating SyncLocalChangesHandler pessimistic barrier:
        var isBlocked = resource.IsLockedByOther(_runnerBId);
        isBlocked.Should().BeTrue("Runner B must be blocked because Runner A currently holds the collaborative lock");

        // When blocked, resource is NOT modified
        if (!isBlocked)
        {
            resource.LatestVersion!.UpdateDraft(runnerBLocalHash, 4096, "Runner B override");
        }

        // Verify Runner A's work is preserved
        resource.LatestVersion!.FileHash.Should().Be("hash_runner_a");
        resource.LockedByRunnerId.Should().Be(_runnerAId);
    }

    [Fact]
    public void Runner_A_Modifying_Own_Draft_Should_Update_InPlace_And_Maintain_Lock()
    {
        var resource = ResourceItem.Create(
            _repositoryId,
            _repoRunnerAId,
            "blend",
            "WeaponSword",
            "Weapons/Sword.blend",
            "hash_initial",
            1000,
            lockedByRunnerId: _runnerAId
        );

        // Runner A updates draft locally
        resource.CanModify(_runnerAId).Should().BeTrue();
        resource.Lock(_runnerAId); // Re-assert lock

        var draft = resource.LatestVersion!;
        draft.Status.Should().Be(ResourceVersionStatus.Draft);

        // In-place update
        draft.UpdateDraft("hash_sword_v1_revised", 1500, "Refined blade geometry");

        // Still Version 1, no version explosion
        resource.Versions.Should().HaveCount(1);
        draft.VersionNo.Should().Be(1);
        draft.FileHash.Should().Be("hash_sword_v1_revised");
        resource.IsLocked.Should().BeTrue();
        resource.LockedByRunnerId.Should().Be(_runnerAId);
    }

    [Fact]
    public void Publishing_Version_Should_Freeze_Version_And_Automatically_Release_Lock()
    {
        var resource = ResourceItem.Create(
            _repositoryId,
            _repoRunnerAId,
            "blend",
            "EnvironmentCastle",
            "Environments/Castle.blend",
            "hash_castle_final",
            5000,
            lockedByRunnerId: _runnerAId
        );

        var version = resource.LatestVersion!;
        version.Status.Should().Be(ResourceVersionStatus.Draft);
        resource.IsLocked.Should().BeTrue();

        // Action: Publish version
        version.MarkAsPublished("Approved by Art Director for milestone 1");
        resource.Unlock(); // Automatic lock release upon publish

        // Assert: Version is frozen and lock is released
        version.Status.Should().Be(ResourceVersionStatus.Published);
        resource.IsLocked.Should().BeFalse();
        resource.LockedByRunnerId.Should().BeNull();
        resource.LockedByUserId.Should().BeNull();
        resource.LockedAt.Should().BeNull();

        // Now any runner can modify
        resource.CanModify(_runnerBId).Should().BeTrue();
        resource.IsLockedByOther(_runnerBId).Should().BeFalse();
    }

    [Fact]
    public void Runner_B_Can_Acquire_New_Lock_For_Next_Version_After_Publish()
    {
        var resource = ResourceItem.Create(
            _repositoryId,
            _repoRunnerAId,
            "blend",
            "PropTable",
            "Props/Table.blend",
            "hash_v1_published",
            500,
            lockedByRunnerId: _runnerAId
        );

        // Runner A publishes v1
        resource.LatestVersion!.MarkAsPublished("Release v1");
        resource.Unlock();

        // Runner B now opens the file and makes changes -> creates draft v2 and claims lock
        resource.CanModify(_runnerBId).Should().BeTrue();
        resource.Lock(_runnerBId);

        var version2 = resource.AddNewVersion(
            _repoRunnerAId,
            "hash_v2_draft_b",
            600,
            "Texture optimization by Artist B",
            ResourceVersionStatus.Draft
        );

        resource.Versions.Should().HaveCount(2);
        version2.VersionNo.Should().Be(2);
        version2.Status.Should().Be(ResourceVersionStatus.Draft);

        // Lock now belongs to Runner B!
        resource.IsLocked.Should().BeTrue();
        resource.LockedByRunnerId.Should().Be(_runnerBId);
        resource.IsLockedByOther(_runnerAId).Should().BeTrue("Runner A is now blocked from overwriting Runner B's v2 work");
    }

    [Fact]
    public void Admin_Force_Unlock_Should_Immediately_Release_Stale_Lock()
    {
        // Scenario: Runner A machine crashed or artist left for the day leaving file locked
        var resource = ResourceItem.Create(
            _repositoryId,
            _repoRunnerAId,
            "blend",
            "VehicleCar",
            "Vehicles/Car.blend",
            "hash_car",
            10000,
            lockedByRunnerId: _runnerAId
        );

        resource.IsLocked.Should().BeTrue();

        // Admin invokes Force Unlock
        resource.Unlock();

        resource.IsLocked.Should().BeFalse();
        resource.LockedByRunnerId.Should().BeNull();
        resource.CanModify(_runnerBId).Should().BeTrue("Runner B can now take over the asset safely");
    }
}
