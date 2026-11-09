using TavoloFlow.Api.Accounts;

namespace TavoloFlow.Api.Demo;

// These are local fixture files, not HTTP contracts. Keys connect fixtures without fixed database IDs.
public sealed record DemoRestaurant(
    string Name,
    string DefaultLanguage,
    string TimeZone,
    string CurrencyCode,
    string Theme,
    bool JoinCodeRequired,
    long AnnualFeeCents
);

public sealed record DemoAccounts(
    SeedAccountOptions Owner,
    SeedAccountOptions Staff,
    SeedAccountOptions Admin
);

public sealed record DemoText(string Zh, string It, string En);

public sealed record DemoTable(string TableLabel, bool IsEnabled);

public sealed record DemoCategory(string Key, DemoText Names);

public sealed record DemoItem(
    string Key,
    string Category,
    DemoText Names,
    DemoText Descriptions,
    long PriceCents,
    string[] AllergenCodes,
    bool AllergenReviewed,
    bool IsAvailable,
    string Image
);

// Items lists the dish keys that use the group; groups keep the fixture's order on every dish.
public sealed record DemoOptionGroup(
    string Key,
    DemoText Names,
    int MinSelect,
    int MaxSelect,
    DemoOption[] Options,
    string[] Items
);

public sealed record DemoOption(DemoText Names, long PriceDeltaCents, string[] AllergenCodes);

public sealed record DemoMenu(
    DemoCategory[] Categories,
    DemoItem[] Items,
    DemoOptionGroup[] OptionGroups
);
