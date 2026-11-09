using Unity.Netcode;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// In a live session, tells everyone else "the village changed, pull the latest from the cloud".
    /// Sends only a tiny signal, never plot data, so there are no message-size issues and the cloud stays the source of truth.
    /// Put on a scene GameObject with a NetworkObject.
    /// </summary>
    public class VillageNetSync : NetworkBehaviour
    {
        static VillageNetSync instance;

        public override void OnNetworkSpawn()
        {
            instance = this;
        }

        public override void OnNetworkDespawn()
        {
            if (instance == this)
            {
                instance = null;
            }
        }

        public static void NotifyVillageChanged()
        {
            if (instance && instance.IsSpawned)
            {
                instance.VillageChangedRpc();
            }
        }

        [Rpc(SendTo.NotMe)]
        void VillageChangedRpc()
        {
            if (VillageClient.Instance)
            {
                VillageClient.Instance.QueueRefresh();
            }
        }
    }
}
