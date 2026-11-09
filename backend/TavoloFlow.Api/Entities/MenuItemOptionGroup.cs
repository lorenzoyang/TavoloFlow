namespace TavoloFlow.Api.Entities;

// Links a dish to a shared option group. Display order comes from the group, not from this row.
public sealed class MenuItemOptionGroup
{
    public Guid MenuItemId { get; set; }
    public Guid GroupId { get; set; }
    public Guid RestaurantId { get; set; }
}
