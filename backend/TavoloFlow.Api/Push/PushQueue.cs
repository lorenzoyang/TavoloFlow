using System.Threading.Channels;

namespace TavoloFlow.Api.Push;

// A new online request to announce. ExpiresAt bounds the notification's lifetime at push services.
public sealed record OnlineRequestPush(Guid RestaurantId, int Number, DateTime ExpiresAt);

// The in-process queue between a committed submission and PushSender. Notifications are reminders:
// when push is off nothing is queued, a full queue drops the oldest item, and a restart loses what
// was waiting.
public sealed class PushQueue(PushKeys keys)
{
    public const int Capacity = 100;

    private readonly Channel<OnlineRequestPush> channel = Channel.CreateBounded<OnlineRequestPush>(
        new BoundedChannelOptions(Capacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        }
    );

    public void Enqueue(OnlineRequestPush item)
    {
        if (keys.Enabled)
            channel.Writer.TryWrite(item);
    }

    internal ChannelReader<OnlineRequestPush> Reader => channel.Reader;
}
