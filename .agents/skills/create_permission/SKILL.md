---
name: create_permission
description: HÆ°á»›ng dáº«n cÃ¡ch táº¡o vÃ  Ã¡p dá»¥ng Permission (phÃ¢n quyá»n) cho má»™t tÃ­nh nÄƒng trong há»‡ thá»‘ng.
---

# HÆ°á»›ng Dáº«n Táº¡o VÃ  Ãp Dá»¥ng Permission

Dá»± Ã¡n sá»­ dá»¥ng cÆ¡ cháº¿ Permission linh hoáº¡t. CÃ¡c quyá»n Ä‘Æ°á»£c quáº£n lÃ½ táº­p trung á»Ÿ thÆ° má»¥c `Constants` cá»§a má»—i module.

### 1. Khai bÃ¡o Permission

TÃ¬m file `<Module>Permissions.cs` (vÃ­ dá»¥ `IdentityPermissions.cs`) trong thÆ° má»¥c `Constants` cá»§a module Ä‘Ã³.

ThÃªm má»™t class má»›i káº¿ thá»«a `BaseCrudPermission("tÃªn_tÃ­nh_nÄƒng")` náº¿u nÃ³ lÃ  CRUD, hoáº·c Ä‘á»‹nh nghÄ©a thá»§ cÃ´ng.
VÃ­ dá»¥:

```csharp
public class IdentityPermissions
{
    // 1. Khai bÃ¡o instance
    public static UsersFeature Users { get; } = new();

    // 2. ThÃªm vÃ o GetPermissions dictionary
    public Dictionary<string, IReadOnlyList<string>> GetPermissions() => new()
    {
        { "Users", Users.All }
    };

    // 3. Khai bÃ¡o cáº¥u trÃºc quyá»n
    public class UsersFeature() : BaseCrudPermission("users")
    {
        // BaseCrudPermission tá»± Ä‘á»™ng cÃ³ cÃ¡c háº±ng sá»‘: Create, Read, Update, Delete
        // Báº¡n cÃ³ thá»ƒ thÃªm quyá»n tuá»³ chá»‰nh nhÆ° sau:
        public const string Export = "users:export";
        public override IReadOnlyList<string> All => [.. base.All, Export];
    }
}
```

### 2. Ãp dá»¥ng Permission vÃ o Endpoint

Trong phÆ°Æ¡ng thá»©c `Configure()` cá»§a `Endpoint` FastEndpoints, thay vÃ¬ dÃ¹ng `AllowAnonymous()`, hÃ£y gá»i `Permissions(...)` vá»›i háº±ng sá»‘ tá»« file Permission báº¡n vá»«a táº¡o.

VÃ­ dá»¥:

```csharp
public class DeleteUserEndpoint : Endpoint<DeleteUserCommand, Result>
{
    public override void Configure()
    {
        Delete("/{id:guid}");
        Group<UsersGroup>();
        Permissions(P.Users.Delete); // <-- Ãp dá»¥ng permission táº¡i Ä‘Ã¢y
    }

    // ...
}
```

### 3. Äáº£m báº£o Module Registry tÃ­ch há»£p Permission

Module cá»§a báº¡n cáº§n implements interface `IPermissionModule` Ä‘á»ƒ há»‡ thá»‘ng tá»± Ä‘á»™ng quÃ©t vÃ  thu tháº­p permission vÃ o cache.

VÃ­ dá»¥:

```csharp
public class IdentityModule : IModule, IPermissionModule
{
    //...
    public Dictionary<string, IReadOnlyList<string>> GetPermissions()
        => new Constants.IdentityPermissions().GetPermissions();
}
```

LÆ°u Ã½: Náº¿u báº¡n táº¡o module thÃ´ng qua `Automation.Cli`, Ä‘iá»u nÃ y thÆ°á»ng Ä‘Ã£ Ä‘Æ°á»£c thiáº¿t láº­p sáºµn, báº¡n chá»‰ cáº§n sá»­a Ä‘á»•i class Permissions tÆ°Æ¡ng á»©ng.

### 4. Khai báo bí danh Global Using

Bắt buộc phải thêm bí danh global using P = Automation.<ModuleName>.Constants.<Module>Permissions; vào file GlobalUsing.cs của module để các Endpoint có thể gọi quyền ngắn gọn qua ký tự P thay vì gõ toàn bộ tên class.
