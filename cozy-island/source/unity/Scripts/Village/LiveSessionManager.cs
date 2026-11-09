using System;
using System.Threading.Tasks;
using Unity.Netcode;
using Unity.Services.Multiplayer;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Real-time co-op via Unity Multiplayer Services sessions (Relay + Netcode for GameObjects).
    /// The session join code is stored on the village in the cloud, so friends never type it -
    /// they just press "Join" in the village menu. Requires a NetworkManager in the scene.
    /// </summary>
    public class LiveSessionManager : MonoBehaviour
    {
        public static LiveSessionManager Instance { get; private set; }

        [Range(2, 8)] public int maxPlayers = 4;
        [Tooltip("How often the host tells the cloud it's still online.")]
        public float heartbeatSeconds = 120f;

        public ISession Session { get; private set; }
        public bool IsLive => Session != null;
        public bool IsHost => Session != null && Session.IsHost;
        public bool Busy { get; private set; }

        string hostedVillageId = "";
        float nextHeartbeat;

        void Awake()
        {
            Instance = this;
        }

        void Start()
        {
            if (NetworkManager.Singleton)
            {
                NetworkManager.Singleton.OnClientStopped += OnClientStopped;
            }
        }

        void OnDestroy()
        {
            if (NetworkManager.Singleton)
            {
                NetworkManager.Singleton.OnClientStopped -= OnClientStopped;
            }
        }

        void Update()
        {
            if (IsHost && !string.IsNullOrEmpty(hostedVillageId) && Time.unscaledTime >= nextHeartbeat)
            {
                nextHeartbeat = Time.unscaledTime + heartbeatSeconds;
                _ = VillageClient.Instance.SetLiveSessionAsync(hostedVillageId, Session.Code, quiet: true);
            }
        }

        public async Task<bool> HostAsync(string villageId)
        {
            if (Busy || IsLive)
            {
                return false;
            }
            Busy = true;
            try
            {
                var options = new SessionOptions { MaxPlayers = maxPlayers, IsPrivate = true }.WithRelayNetwork();
                Session = await MultiplayerService.Instance.CreateSessionAsync(options);
                bool published = await VillageClient.Instance.SetLiveSessionAsync(villageId, Session.Code);
                if (!published)
                {
                    await LeaveInternalAsync();
                    return false;
                }
                hostedVillageId = villageId;
                nextHeartbeat = Time.unscaledTime + heartbeatSeconds;
                CozyGui.Toast("You're hosting! Villagers can hop in from their village menu.", 6f);
                return true;
            }
            catch (Exception error)
            {
                Debug.LogWarning($"LiveSessionManager.HostAsync: {error.Message}");
                CozyGui.Toast("Couldn't start a live session. Try again in a moment.", 5f);
                Session = null;
                return false;
            }
            finally
            {
                Busy = false;
            }
        }

        public async Task<bool> JoinAsync(string sessionCode, string hostName)
        {
            if (Busy || IsLive || string.IsNullOrEmpty(sessionCode))
            {
                return false;
            }
            Busy = true;
            try
            {
                Session = await MultiplayerService.Instance.JoinSessionByCodeAsync(sessionCode);
                CozyGui.Toast($"Joined {hostName}'s session. Say hi! (Z wave, X sit, C cheers)", 6f);
                return true;
            }
            catch (Exception error)
            {
                Debug.LogWarning($"LiveSessionManager.JoinAsync: {error.Message}");
                CozyGui.Toast($"{hostName} isn't online anymore - you can still visit quietly.", 6f);
                Session = null;
                return false;
            }
            finally
            {
                Busy = false;
            }
        }

        public async Task LeaveAsync()
        {
            if (Busy || !IsLive)
            {
                return;
            }
            Busy = true;
            try
            {
                if (IsHost && !string.IsNullOrEmpty(hostedVillageId))
                {
                    await VillageClient.Instance.SetLiveSessionAsync(hostedVillageId, "", quiet: true);
                }
                await LeaveInternalAsync();
                CozyGui.Toast("Left the live session.", 3f);
            }
            finally
            {
                Busy = false;
            }
        }

        async Task LeaveInternalAsync()
        {
            var session = Session;
            Session = null;
            hostedVillageId = "";
            if (session != null)
            {
                try
                {
                    await session.LeaveAsync();
                }
                catch (Exception error)
                {
                    Debug.LogWarning($"LiveSessionManager.Leave: {error.Message}");
                }
            }
        }

        void OnClientStopped(bool wasHost)
        {
            if (Session != null && !Busy)
            {
                Session = null;
                hostedVillageId = "";
                CozyGui.Toast("The live session ended.", 4f);
            }
        }

        void OnApplicationQuit()
        {
            if (IsHost && !string.IsNullOrEmpty(hostedVillageId) && VillageClient.Instance)
            {
                // Best effort; if it doesn't arrive, the heartbeat simply times out after a few minutes.
                _ = VillageClient.Instance.SetLiveSessionAsync(hostedVillageId, "", quiet: true);
            }
        }
    }
}
