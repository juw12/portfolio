using Unity.Netcode.Components;

namespace CozyFishing
{
    /// <summary>
    /// Each player moves their own avatar (owner-authoritative). On Netcode for GameObjects 2.x you can
    /// instead use a plain NetworkTransform with Authority Mode = Owner.
    /// </summary>
    public class OwnerNetworkTransform : NetworkTransform
    {
        protected override bool OnIsServerAuthoritative()
        {
            return false;
        }
    }
}
