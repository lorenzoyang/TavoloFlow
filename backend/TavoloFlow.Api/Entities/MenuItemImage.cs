namespace TavoloFlow.Api.Entities;

// A dish photo, already re-encoded by MenuImages. Kept apart from menu_items so menu reads never load bytes.
public sealed class MenuItemImage
{
    // Also the public, immutable image URL id: every upload gets a new one.
    public Guid Id { get; set; }
    public Guid MenuItemId { get; set; }
    public byte[] Content { get; set; } = [];
}
