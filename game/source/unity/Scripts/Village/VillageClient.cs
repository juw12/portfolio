using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using CozyFishing.Village;
using Unity.Services.Authentication;
using Unity.Services.CloudCode;
using Unity.Services.Core;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Talks to the CozyVillage Cloud Code module. The cloud is the single source of truth for
    /// villages and plots, so live co-op and offline visits always see the same state.
    /// Put this on a root GameObject (it survives scene loads).
    /// </summary>
    public class VillageClient : MonoBehaviour
    {
        public const string ModuleName = "CozyVillage";

        public static VillageClient Instance { get; private set; }

        [Tooltip("How often to pull changes friends made while you were here (seconds).")]
        public float refreshIntervalSeconds = 60f;

        public bool IsReady { get; private set; }
        public bool Busy => pendingCalls > 0;
        public string Status { get; private set; } = "Connecting...";
        public string PlayerId => IsReady ? AuthenticationService.Instance.PlayerId : "";
        public VillageSnapshot Current { get; private set; }
        public List<VillageSummary> MyVillages { get; private set; } = new List<VillageSummary>();
        public InviteInfo LastInvite { get; private set; }

        public event Action VillageChanged;

        public static string DisplayName
        {
            get => PlayerPrefs.GetString("cozy.displayName", "Friend");
            set
            {
                PlayerPrefs.SetString("cozy.displayName", VillageRules.CleanName(value));
                PlayerPrefs.Save();
            }
        }

        int pendingCalls;
        float nextRefresh;
        bool refreshQueued;

        void Awake()
        {
            if (Instance && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        async void Start()
        {
            await InitializeAsync();
        }

        void Update()
        {
            if (!IsReady || Current == null || Busy)
            {
                return;
            }
            if (refreshQueued || Time.unscaledTime >= nextRefresh)
            {
                refreshQueued = false;
                nextRefresh = Time.unscaledTime + refreshIntervalSeconds;
                _ = RefreshAsync();
            }
        }

        async Task InitializeAsync()
        {
            try
            {
                var options = new InitializationOptions();
                string profile = CommandLineProfile();
                if (!string.IsNullOrEmpty(profile))
                {
                    options.SetProfile(profile);   // lets two builds on one PC be two different players
                }
                await UnityServices.InitializeAsync(options);
                if (!AuthenticationService.Instance.IsSignedIn)
                {
                    await AuthenticationService.Instance.SignInAnonymouslyAsync();
                }
                IsReady = true;
                Status = "Online";
                await RefreshVillageListAsync();

                string lastVillage = PlayerPrefs.GetString("cozy.lastVillage", "");
                if (!string.IsNullOrEmpty(lastVillage))
                {
                    await LoadVillageAsync(lastVillage, quiet: true);
                }
            }
            catch (Exception error)
            {
                Status = "Offline - village features unavailable";
                Debug.LogWarning($"VillageClient: could not connect ({error.Message})");
            }
        }

        static string CommandLineProfile()
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "-profile")
                {
                    return args[i + 1];
                }
            }
            return "";
        }

        /// <summary>Ask for a refresh soon (used when a live friend changes something).</summary>
        public void QueueRefresh()
        {
            refreshQueued = true;
        }

        // ------------------------------------------------------------------ API

        public async Task RefreshVillageListAsync()
        {
            var list = await Call<List<VillageSummary>>("ListMyVillages", new Dictionary<string, object>(), quiet: true);
            if (list != null)
            {
                MyVillages = list;
                VillageChanged?.Invoke();
            }
        }

        public async Task<bool> CreateVillageAsync(string villageName)
        {
            var snapshot = await Call<VillageSnapshot>("CreateVillage", new Dictionary<string, object>
            {
                { "villageName", villageName },
                { "displayName", DisplayName },
            });
            if (snapshot == null)
            {
                return false;
            }
            SetCurrent(snapshot, announce: false);
            await RefreshVillageListAsync();
            CozyGui.Toast($"Welcome to {snapshot.Meta.Name}! Click a free plot's sign to claim it.", 6f);
            return true;
        }

        public async Task<bool> LoadVillageAsync(string villageId, bool quiet = false)
        {
            var snapshot = await Call<VillageSnapshot>("GetVillage", new Dictionary<string, object>
            {
                { "villageId", villageId },
            }, quiet);
            if (snapshot == null)
            {
                if (quiet)
                {
                    PlayerPrefs.DeleteKey("cozy.lastVillage");
                }
                return false;
            }
            SetCurrent(snapshot, announce: true);
            return true;
        }

        public async Task RefreshAsync()
        {
            if (Current == null)
            {
                return;
            }
            var snapshot = await Call<VillageSnapshot>("GetVillage", new Dictionary<string, object>
            {
                { "villageId", Current.VillageId },
            }, quiet: true);
            if (snapshot != null && Current != null && snapshot.VillageId == Current.VillageId)
            {
                SetCurrent(snapshot, announce: false);
            }
        }

        public async Task<bool> ClaimPlotAsync(int plotIndex)
        {
            if (Current == null)
            {
                return false;
            }
            var snapshot = await Call<VillageSnapshot>("ClaimPlot", new Dictionary<string, object>
            {
                { "villageId", Current.VillageId },
                { "plotIndex", plotIndex },
                { "displayName", DisplayName },
            });
            if (snapshot == null)
            {
                return false;
            }
            SetCurrent(snapshot, announce: false);
            VillageNetSync.NotifyVillageChanged();
            CozyGui.Toast("This plot is yours! Click the sign again to invite friends.", 6f);
            return true;
        }

        public async Task<InviteInfo> CreateInviteAsync(int plotIndex)
        {
            if (Current == null)
            {
                return null;
            }
            var invite = await Call<InviteInfo>("CreateInvite", new Dictionary<string, object>
            {
                { "villageId", Current.VillageId },
                { "plotIndex", plotIndex },
            });
            if (invite != null)
            {
                LastInvite = invite;
                var plot = Current.Plots[plotIndex];
                plot.ActiveInviteCode = invite.Code;
                plot.InviteExpiresUtc = invite.ExpiresUtc;
                plot.InviteUsesLeft = invite.UsesLeft;
                VillageChanged?.Invoke();
            }
            return invite;
        }

        public async Task<bool> RedeemInviteAsync(string code)
        {
            var snapshot = await Call<VillageSnapshot>("RedeemInvite", new Dictionary<string, object>
            {
                { "code", code },
                { "displayName", DisplayName },
            });
            if (snapshot == null)
            {
                return false;
            }
            SetCurrent(snapshot, announce: false);
            await RefreshVillageListAsync();
            VillageNetSync.NotifyVillageChanged();

            var joined = snapshot.Plots.Find(plot => plot.Members.Exists(member => member.Id == PlayerId));
            string owner = joined != null ? joined.OwnerName : "your friend";
            CozyGui.Toast($"You joined {owner}'s plot in {snapshot.Meta.Name}! You can tend it any time.", 7f);
            return true;
        }

        public async Task<bool> BedActionAsync(int plotIndex, int bedIndex, string action, string seedId = "")
        {
            if (Current == null)
            {
                return false;
            }
            var plot = await Call<PlotState>("BedAction", new Dictionary<string, object>
            {
                { "villageId", Current.VillageId },
                { "plotIndex", plotIndex },
                { "bedIndex", bedIndex },
                { "action", action },
                { "seedId", seedId },
                { "displayName", DisplayName },
            });
            if (plot == null)
            {
                return false;
            }
            ApplyPlot(plot);
            VillageNetSync.NotifyVillageChanged();
            return true;
        }

        public async Task<bool> LeaveNoteAsync(int plotIndex, string text)
        {
            if (Current == null)
            {
                return false;
            }
            var plot = await Call<PlotState>("LeaveNote", new Dictionary<string, object>
            {
                { "villageId", Current.VillageId },
                { "plotIndex", plotIndex },
                { "text", text },
                { "displayName", DisplayName },
            });
            if (plot == null)
            {
                return false;
            }
            ApplyPlot(plot);
            VillageNetSync.NotifyVillageChanged();
            return true;
        }

        public async Task<bool> RemoveMemberAsync(int plotIndex, string memberId)
        {
            if (Current == null)
            {
                return false;
            }
            var plot = await Call<PlotState>("RemoveMember", new Dictionary<string, object>
            {
                { "villageId", Current.VillageId },
                { "plotIndex", plotIndex },
                { "memberId", memberId },
            });
            if (plot == null)
            {
                return false;
            }
            ApplyPlot(plot);
            VillageNetSync.NotifyVillageChanged();
            return true;
        }

        public async Task<bool> SetLiveSessionAsync(string villageId, string sessionCode, bool quiet = false)
        {
            var meta = await Call<VillageMeta>("SetLiveSession", new Dictionary<string, object>
            {
                { "villageId", villageId },
                { "sessionCode", sessionCode ?? "" },
                { "displayName", DisplayName },
            }, quiet);
            if (meta == null)
            {
                return false;
            }
            if (Current != null && Current.VillageId == villageId)
            {
                Current.Meta = meta;
                VillageChanged?.Invoke();
            }
            return true;
        }

        // ------------------------------------------------------------------ state

        void SetCurrent(VillageSnapshot snapshot, bool announce)
        {
            Current = snapshot;
            PlayerPrefs.SetString("cozy.lastVillage", snapshot.VillageId);
            PlayerPrefs.Save();
            VillageChanged?.Invoke();
            if (announce)
            {
                AnnounceWhileYouWereAway();
            }
        }

        void ApplyPlot(PlotState plot)
        {
            if (Current == null || plot.Index < 0 || plot.Index >= Current.Plots.Count)
            {
                return;
            }
            Current.Plots[plot.Index] = plot;
            VillageChanged?.Invoke();
        }

        /// <summary>"While you were away: Mika watered the Tulip" + unread mailbox count.</summary>
        void AnnounceWhileYouWereAway()
        {
            int myPlot = VillageRules.OwnedPlotIndex(Current, PlayerId);
            if (myPlot < 0)
            {
                return;
            }
            var plot = Current.Plots[myPlot];
            long lastSeen = long.TryParse(PlayerPrefs.GetString(SeenKey(), "0"), out long parsed) ? parsed : 0;
            string myName = DisplayName;

            Note latestByFriend = null;
            foreach (var entry in plot.Log)
            {
                if (entry.Utc > lastSeen && entry.FromName != myName)
                {
                    latestByFriend = entry;
                }
            }
            int unread = plot.Notes.FindAll(note => note.Utc > lastSeen).Count;

            if (latestByFriend != null)
            {
                string extra = unread > 0 ? $"  ·  {unread} new note{(unread == 1 ? "" : "s")} in your mailbox" : "";
                CozyGui.Toast($"While you were away: {latestByFriend.FromName} {latestByFriend.Text}{extra}", 8f);
            }
            else if (unread > 0)
            {
                CozyGui.Toast($"You have {unread} new note{(unread == 1 ? "" : "s")} in your mailbox.", 6f);
            }
        }

        public void MarkMailboxRead()
        {
            if (Current != null)
            {
                PlayerPrefs.SetString(SeenKey(), VillageRules.NowUtc.ToString());
                PlayerPrefs.Save();
            }
        }

        string SeenKey() => "cozy.seen." + Current.VillageId;

        // ------------------------------------------------------------------ transport

        async Task<T> Call<T>(string function, Dictionary<string, object> args, bool quiet = false) where T : class
        {
            if (!IsReady)
            {
                if (!quiet)
                {
                    CozyGui.Toast("Still connecting to the village server...", 3f);
                }
                return null;
            }
            pendingCalls++;
            try
            {
                var result = await CloudCodeService.Instance.CallModuleEndpointAsync<Result<T>>(ModuleName, function, args);
                if (result == null || !result.Ok)
                {
                    if (!quiet)
                    {
                        CozyGui.Toast(result != null && !string.IsNullOrEmpty(result.Error) ? result.Error : "Something went wrong.", 5f);
                    }
                    return null;
                }
                return result.Data;
            }
            catch (CloudCodeException error)
            {
                Debug.LogWarning($"VillageClient.{function}: {error.Message}");
                if (!quiet)
                {
                    CozyGui.Toast("Couldn't reach the village server. Check your connection.", 5f);
                }
                return null;
            }
            finally
            {
                pendingCalls--;
            }
        }
    }
}
