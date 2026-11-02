using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using CozyFishing.Village;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using Unity.Services.CloudCode.Apis;
using Unity.Services.CloudCode.Core;
using Unity.Services.CloudCode.Shared;
using Unity.Services.CloudSave.Model;

namespace CozyVillage
{
    public class ModuleConfig : ICloudCodeSetup
    {
        public void Setup(ICloudCodeConfig config)
        {
            config.Dependencies.AddSingleton<IGameApiClient>(GameApiClient.Create());
        }
    }

    /// <summary>Thrown for expected rule violations; becomes a friendly Result.Fail message.</summary>
    public class VillageRuleException : Exception
    {
        public VillageRuleException(string message) : base(message)
        {
        }
    }

    /// <summary>
    /// Cloud Save layout
    ///   custom item "village_[guid]"  keys: meta, plot_0..plot_3   (server-written only)
    ///   custom item "inv_[hash40]"    key:  invite                 (hash of code + server pepper)
    ///   player data "villages"        list of village ids          (convenience index only)
    /// </summary>
    public class VillageModule
    {
        // CHANGE THIS before shipping (or load it from Cloud Code Secret Manager).
        const string InvitePepper = "replace-with-a-long-random-secret-string";

        // ------------------------------------------------------------------ villages

        [CloudCodeFunction("CreateVillage")]
        public Task<Result<VillageSnapshot>> CreateVillage(
            IExecutionContext context, IGameApiClient gameApiClient, string villageName, string displayName)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                List<string> myVillages = await store.GetPlayerVillagesAsync(me);
                if (myVillages.Count >= VillageRules.MaxVillagesPerPlayer)
                {
                    throw new VillageRuleException($"You're already in {VillageRules.MaxVillagesPerPlayer} villages.");
                }

                string villageId = "village_" + Guid.NewGuid().ToString("N");
                string name = VillageRules.CleanText(villageName, VillageRules.MaxVillageNameLength);
                var meta = new VillageMeta
                {
                    Name = name.Length == 0 ? "Cozy Village" : name,
                    FounderId = me,
                    CreatedUtc = VillageRules.NowUtc,
                };
                meta.Residents.Add(new Member { Id = me, Name = VillageRules.CleanName(displayName) });

                await store.SetAsync(villageId, "meta", meta, null);
                for (int i = 0; i < VillageRules.PlotCount; i++)
                {
                    await store.SetAsync(villageId, VillageRules.PlotKey(i), VillageRules.NewPlot(i), null);
                }
                myVillages.Add(villageId);
                await store.SetPlayerVillagesAsync(me, myVillages);
                return await store.SnapshotForAsync(villageId, me);
            });
        }

        [CloudCodeFunction("ListMyVillages")]
        public Task<Result<List<VillageSummary>>> ListMyVillages(IExecutionContext context, IGameApiClient gameApiClient)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                List<string> ids = await store.GetPlayerVillagesAsync(me);
                var summaries = new List<VillageSummary>();
                var stillValid = new List<string>();
                long now = VillageRules.NowUtc;
                foreach (string id in ids)
                {
                    var (meta, _) = await store.GetAsync<VillageMeta>(id, "meta");
                    if (meta == null || !VillageRules.IsResident(meta, me))
                    {
                        continue;
                    }
                    stillValid.Add(id);
                    bool live = VillageRules.IsLive(meta, now);
                    summaries.Add(new VillageSummary
                    {
                        VillageId = id,
                        Name = meta.Name,
                        Residents = meta.Residents.Count,
                        IsLive = live,
                        LiveHostName = live ? meta.LiveHostName : "",
                    });
                }
                if (stillValid.Count != ids.Count)
                {
                    await store.SetPlayerVillagesAsync(me, stillValid);
                }
                return summaries;
            });
        }

        [CloudCodeFunction("GetVillage")]
        public Task<Result<VillageSnapshot>> GetVillage(IExecutionContext context, IGameApiClient gameApiClient, string villageId)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                return await store.SnapshotForAsync(villageId, context.PlayerId);
            });
        }

        // ------------------------------------------------------------------ plots

        [CloudCodeFunction("ClaimPlot")]
        public Task<Result<VillageSnapshot>> ClaimPlot(
            IExecutionContext context, IGameApiClient gameApiClient, string villageId, int plotIndex, string displayName)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                string name = VillageRules.CleanName(displayName);
                CheckPlotIndex(plotIndex);
                VillageSnapshot village = await store.LoadVillageAsync(villageId);
                RequireResident(village.Meta, me);
                if (VillageRules.OwnedPlotIndex(village, me) >= 0)
                {
                    throw new VillageRuleException("You already have a plot in this village.");
                }

                await store.MutateAsync<PlotState>(villageId, VillageRules.PlotKey(plotIndex), plot =>
                {
                    if (VillageRules.IsClaimed(plot))
                    {
                        throw new VillageRuleException($"{plot.OwnerName} just claimed this plot.");
                    }
                    var fresh = VillageRules.NewPlot(plotIndex);
                    fresh.OwnerId = me;
                    fresh.OwnerName = name;
                    VillageRules.AddCapped(fresh.Log, new Note { FromName = name, Text = "claimed this plot", Utc = VillageRules.NowUtc }, VillageRules.MaxLogEntries);
                    return fresh;
                });
                return await store.SnapshotForAsync(villageId, me);
            });
        }

        [CloudCodeFunction("BedAction")]
        public Task<Result<PlotState>> BedAction(
            IExecutionContext context, IGameApiClient gameApiClient,
            string villageId, int plotIndex, int bedIndex, string action, string seedId, string displayName)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                string name = VillageRules.CleanName(displayName);
                CheckPlotIndex(plotIndex);
                if (bedIndex < 0 || bedIndex >= VillageRules.BedsPerPlot)
                {
                    throw new VillageRuleException("That bed doesn't exist.");
                }
                var (meta, _) = await store.GetAsync<VillageMeta>(villageId, "meta");
                RequireResident(meta, me);

                PlotState updated = await store.MutateAsync<PlotState>(villageId, VillageRules.PlotKey(plotIndex), plot =>
                {
                    if (!VillageRules.IsClaimed(plot))
                    {
                        throw new VillageRuleException("Nobody has claimed this plot yet.");
                    }
                    PlotRole role = VillageRules.RoleOf(meta, plot, me);
                    BedState bed = plot.Beds[bedIndex];
                    long now = VillageRules.NowUtc;
                    VillageRules.BedStage stage = VillageRules.StageAt(bed, now);
                    string logText;

                    switch (action)
                    {
                        case "plant":
                            if (role < PlotRole.Member)
                            {
                                throw new VillageRuleException($"Only {plot.OwnerName} and their plot-mates can plant here.");
                            }
                            if (stage != VillageRules.BedStage.Empty)
                            {
                                throw new VillageRuleException("Something is already growing there.");
                            }
                            if (seedId == null || !VillageRules.SeedGrowMinutes.ContainsKey(seedId))
                            {
                                throw new VillageRuleException("Unknown seed.");
                            }
                            VillageRules.Plant(bed, seedId, name, now);
                            logText = $"planted a {VillageRules.SeedName(seedId)}";
                            break;

                        case "water":
                            if (stage != VillageRules.BedStage.Thirsty)
                            {
                                throw new VillageRuleException("It doesn't need water right now.");
                            }
                            VillageRules.Water(bed, name, now);
                            logText = $"watered the {VillageRules.SeedName(bed.SeedId)}";
                            break;

                        case "harvest":
                            if (role < PlotRole.Member)
                            {
                                throw new VillageRuleException($"Only {plot.OwnerName} and their plot-mates can harvest here.");
                            }
                            if (stage != VillageRules.BedStage.Bloomed)
                            {
                                throw new VillageRuleException("It isn't ready yet.");
                            }
                            logText = $"harvested a {VillageRules.SeedName(bed.SeedId)}";
                            VillageRules.Clear(bed);
                            break;

                        default:
                            throw new VillageRuleException("Unknown action.");
                    }

                    VillageRules.AddCapped(plot.Log, new Note { FromName = name, Text = logText, Utc = now }, VillageRules.MaxLogEntries);
                    return plot;
                });
                return VillageStore.FilterPlotFor(updated, me);
            });
        }

        [CloudCodeFunction("LeaveNote")]
        public Task<Result<PlotState>> LeaveNote(
            IExecutionContext context, IGameApiClient gameApiClient, string villageId, int plotIndex, string text, string displayName)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                CheckPlotIndex(plotIndex);
                string message = VillageRules.CleanText(text, VillageRules.MaxNoteLength);
                if (message.Length == 0)
                {
                    throw new VillageRuleException("Write something first.");
                }
                var (meta, _) = await store.GetAsync<VillageMeta>(villageId, "meta");
                RequireResident(meta, me);

                PlotState updated = await store.MutateAsync<PlotState>(villageId, VillageRules.PlotKey(plotIndex), plot =>
                {
                    if (!VillageRules.IsClaimed(plot))
                    {
                        throw new VillageRuleException("This mailbox has no owner yet.");
                    }
                    VillageRules.AddCapped(plot.Notes, new Note
                    {
                        FromName = VillageRules.CleanName(displayName),
                        Text = message,
                        Utc = VillageRules.NowUtc,
                    }, VillageRules.MaxNotes);
                    return plot;
                });
                return VillageStore.FilterPlotFor(updated, me);
            });
        }

        [CloudCodeFunction("RemoveMember")]
        public Task<Result<PlotState>> RemoveMember(
            IExecutionContext context, IGameApiClient gameApiClient, string villageId, int plotIndex, string memberId)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                CheckPlotIndex(plotIndex);
                PlotState updated = await store.MutateAsync<PlotState>(villageId, VillageRules.PlotKey(plotIndex), plot =>
                {
                    bool isOwner = plot.OwnerId == me;
                    bool leavingMyself = memberId == me;
                    if (!isOwner && !leavingMyself)
                    {
                        throw new VillageRuleException("Only the plot owner can remove plot-mates.");
                    }
                    plot.Members.RemoveAll(member => member.Id == memberId);
                    return plot;
                });
                return VillageStore.FilterPlotFor(updated, me);
            });
        }

        // ------------------------------------------------------------------ invites

        [CloudCodeFunction("CreateInvite")]
        public Task<Result<InviteInfo>> CreateInvite(
            IExecutionContext context, IGameApiClient gameApiClient, string villageId, int plotIndex)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                CheckPlotIndex(plotIndex);
                var (meta, _) = await store.GetAsync<VillageMeta>(villageId, "meta");
                RequireResident(meta, me);

                string code = GenerateCode();
                long expires = VillageRules.NowUtc + TimeSpan.FromHours(VillageRules.InviteLifetimeHours).Ticks;

                await store.MutateAsync<PlotState>(villageId, VillageRules.PlotKey(plotIndex), plot =>
                {
                    if (plot.OwnerId != me)
                    {
                        throw new VillageRuleException("Only the plot owner can invite friends.");
                    }
                    plot.ActiveInviteCode = code;   // a new code replaces (revokes) the previous one
                    plot.InviteExpiresUtc = expires;
                    plot.InviteUsesLeft = VillageRules.InviteUses;
                    return plot;
                });

                var record = new InviteRecord
                {
                    VillageId = villageId,
                    PlotIndex = plotIndex,
                    CreatedBy = me,
                    ExpiresUtc = expires,
                    UsesLeft = VillageRules.InviteUses,
                };
                await store.SetAsync(InviteItemId(code), "invite", record, null);
                return new InviteInfo { Code = code, ExpiresUtc = expires, UsesLeft = VillageRules.InviteUses };
            });
        }

        [CloudCodeFunction("RedeemInvite")]
        public Task<Result<VillageSnapshot>> RedeemInvite(
            IExecutionContext context, IGameApiClient gameApiClient, string code, string displayName)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                string name = VillageRules.CleanName(displayName);
                string normalized = VillageRules.NormalizeCode(code);
                const string notFound = "That code doesn't exist or has expired. Ask your friend for a fresh one.";
                if (normalized.Length != VillageRules.InviteCodeLength)
                {
                    throw new VillageRuleException(notFound);
                }

                string inviteId = InviteItemId(normalized);
                var (invite, _) = await store.GetAsync<InviteRecord>(inviteId, "invite");
                if (invite == null || invite.ExpiresUtc < VillageRules.NowUtc || invite.UsesLeft <= 0)
                {
                    throw new VillageRuleException(notFound);
                }
                var (plotNow, _) = await store.GetAsync<PlotState>(invite.VillageId, VillageRules.PlotKey(invite.PlotIndex));
                if (plotNow == null || plotNow.ActiveInviteCode != normalized)
                {
                    throw new VillageRuleException(notFound);   // replaced by a newer code
                }
                if (plotNow.OwnerId == me)
                {
                    throw new VillageRuleException("That's your own plot! Share the code with a friend.");
                }
                bool alreadyMember = plotNow.Members.Exists(member => member.Id == me);
                if (!alreadyMember && plotNow.Members.Count >= VillageRules.MaxMembersPerPlot)
                {
                    throw new VillageRuleException("This plot already has the maximum number of plot-mates.");
                }

                List<string> myVillages = await store.GetPlayerVillagesAsync(me);
                bool alreadyIn = myVillages.Contains(invite.VillageId);
                if (!alreadyIn && myVillages.Count >= VillageRules.MaxVillagesPerPlayer)
                {
                    throw new VillageRuleException($"You're already in {VillageRules.MaxVillagesPerPlayer} villages.");
                }

                await store.MutateAsync<VillageMeta>(invite.VillageId, "meta", meta =>
                {
                    var existing = meta.Residents.FirstOrDefault(member => member.Id == me);
                    if (existing != null)
                    {
                        existing.Name = name;
                    }
                    else
                    {
                        if (meta.Residents.Count >= VillageRules.MaxResidents)
                        {
                            throw new VillageRuleException("This village is full.");
                        }
                        meta.Residents.Add(new Member { Id = me, Name = name });
                    }
                    return meta;
                });

                await store.MutateAsync<PlotState>(invite.VillageId, VillageRules.PlotKey(invite.PlotIndex), plot =>
                {
                    if (!plot.Members.Exists(member => member.Id == me))
                    {
                        if (plot.Members.Count >= VillageRules.MaxMembersPerPlot)
                        {
                            throw new VillageRuleException("This plot already has the maximum number of plot-mates.");
                        }
                        plot.Members.Add(new Member { Id = me, Name = name });
                        plot.InviteUsesLeft = Math.Max(0, plot.InviteUsesLeft - 1);
                        VillageRules.AddCapped(plot.Log, new Note { FromName = name, Text = "joined the plot", Utc = VillageRules.NowUtc }, VillageRules.MaxLogEntries);
                    }
                    return plot;
                });

                if (!alreadyMember)
                {
                    await store.MutateAsync<InviteRecord>(inviteId, "invite", record =>
                    {
                        record.UsesLeft = Math.Max(0, record.UsesLeft - 1);
                        return record;
                    });
                }

                if (!alreadyIn)
                {
                    myVillages.Add(invite.VillageId);
                    await store.SetPlayerVillagesAsync(me, myVillages);
                }
                return await store.SnapshotForAsync(invite.VillageId, me);
            });
        }

        // ------------------------------------------------------------------ live sessions

        [CloudCodeFunction("SetLiveSession")]
        public Task<Result<VillageMeta>> SetLiveSession(
            IExecutionContext context, IGameApiClient gameApiClient, string villageId, string sessionCode, string displayName)
        {
            return Run(async () =>
            {
                var store = new VillageStore(context, gameApiClient);
                string me = context.PlayerId;
                string code = VillageRules.CleanText(sessionCode, 32);
                VillageMeta updated = await store.MutateAsync<VillageMeta>(villageId, "meta", meta =>
                {
                    RequireResident(meta, me);
                    if (code.Length == 0)
                    {
                        if (meta.LiveHostId == me)
                        {
                            meta.LiveSessionCode = "";
                            meta.LiveHostId = "";
                            meta.LiveHostName = "";
                        }
                        return meta;
                    }
                    if (VillageRules.IsLive(meta, VillageRules.NowUtc) && meta.LiveHostId != me)
                    {
                        throw new VillageRuleException($"{meta.LiveHostName} is already hosting - join them instead.");
                    }
                    meta.LiveSessionCode = code;
                    meta.LiveHostId = me;
                    meta.LiveHostName = VillageRules.CleanName(displayName);
                    meta.LiveHeartbeatUtc = VillageRules.NowUtc;
                    return meta;
                });
                return updated;
            });
        }

        // ------------------------------------------------------------------ helpers

        static async Task<Result<T>> Run<T>(Func<Task<T>> body)
        {
            try
            {
                return Result<T>.Success(await body());
            }
            catch (VillageRuleException rule)
            {
                return Result<T>.Fail(rule.Message);
            }
            catch (Exception error)
            {
                return Result<T>.Fail("The village server hiccuped - please try again. (" + error.GetType().Name + ")");
            }
        }

        static void CheckPlotIndex(int plotIndex)
        {
            if (plotIndex < 0 || plotIndex >= VillageRules.PlotCount)
            {
                throw new VillageRuleException("That plot doesn't exist.");
            }
        }

        static void RequireResident(VillageMeta meta, string playerId)
        {
            if (meta == null || !VillageRules.IsResident(meta, playerId))
            {
                throw new VillageRuleException("You're not a resident of this village (or it no longer exists).");
            }
        }

        static string GenerateCode()
        {
            var builder = new StringBuilder(VillageRules.InviteCodeLength);
            for (int i = 0; i < VillageRules.InviteCodeLength; i++)
            {
                builder.Append(VillageRules.InviteAlphabet[RandomNumberGenerator.GetInt32(VillageRules.InviteAlphabet.Length)]);
            }
            return builder.ToString();
        }

        static string InviteItemId(string normalizedCode)
        {
            byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(InvitePepper + ":" + normalizedCode));
            return "inv_" + Convert.ToHexString(hash).Substring(0, 40).ToLowerInvariant();
        }
    }

    /// <summary>Thin Cloud Save wrapper: JSON-string values, write-lock retries, snapshots.</summary>
    public class VillageStore
    {
        const int MaxWriteAttempts = 4;

        readonly IExecutionContext context;
        readonly IGameApiClient api;

        public VillageStore(IExecutionContext context, IGameApiClient api)
        {
            this.context = context;
            this.api = api;
        }

        public async Task<(T value, string writeLock)> GetAsync<T>(string customId, string key) where T : class
        {
            var response = await api.CloudSaveData.GetCustomItemsAsync(
                context, context.ServiceToken, context.ProjectId, customId, new List<string> { key });
            Item item = response.Data.Results.FirstOrDefault(result => result.Key == key);
            if (item == null)
            {
                return (null, null);
            }
            return (JsonConvert.DeserializeObject<T>(item.Value.ToString()), item.WriteLock);
        }

        public Task SetAsync(string customId, string key, object value, string writeLock)
        {
            var body = new SetItemBody(key, JsonConvert.SerializeObject(value), writeLock);
            return api.CloudSaveData.SetCustomItemAsync(context, context.ServiceToken, context.ProjectId, customId, body);
        }

        /// <summary>Read-modify-write with optimistic concurrency, so two friends watering at once can't clobber each other.</summary>
        public async Task<T> MutateAsync<T>(string customId, string key, Func<T, T> change) where T : class
        {
            for (int attempt = 1; ; attempt++)
            {
                var (current, writeLock) = await GetAsync<T>(customId, key);
                if (current == null)
                {
                    throw new VillageRuleException("That village no longer exists.");
                }
                T updated = change(current);
                try
                {
                    await SetAsync(customId, key, updated, writeLock);
                    return updated;
                }
                catch (ApiException) when (attempt < MaxWriteAttempts)
                {
                    await Task.Delay(60 * attempt);   // write-lock conflict: someone else wrote first; retry
                }
            }
        }

        public async Task<VillageSnapshot> LoadVillageAsync(string villageId)
        {
            var keys = new List<string> { "meta" };
            for (int i = 0; i < VillageRules.PlotCount; i++)
            {
                keys.Add(VillageRules.PlotKey(i));
            }
            var response = await api.CloudSaveData.GetCustomItemsAsync(
                context, context.ServiceToken, context.ProjectId, villageId, keys);

            var snapshot = new VillageSnapshot { VillageId = villageId, Meta = null };
            var plots = new PlotState[VillageRules.PlotCount];
            foreach (Item item in response.Data.Results)
            {
                string json = item.Value.ToString();
                if (item.Key == "meta")
                {
                    snapshot.Meta = JsonConvert.DeserializeObject<VillageMeta>(json);
                    continue;
                }
                for (int i = 0; i < VillageRules.PlotCount; i++)
                {
                    if (item.Key == VillageRules.PlotKey(i))
                    {
                        plots[i] = JsonConvert.DeserializeObject<PlotState>(json);
                    }
                }
            }
            if (snapshot.Meta == null)
            {
                throw new VillageRuleException("That village no longer exists.");
            }
            for (int i = 0; i < VillageRules.PlotCount; i++)
            {
                snapshot.Plots.Add(plots[i] ?? VillageRules.NewPlot(i));
            }
            return snapshot;
        }

        public async Task<VillageSnapshot> SnapshotForAsync(string villageId, string playerId)
        {
            VillageSnapshot snapshot = await LoadVillageAsync(villageId);
            if (!VillageRules.IsResident(snapshot.Meta, playerId))
            {
                throw new VillageRuleException("You're not a resident of this village.");
            }
            for (int i = 0; i < snapshot.Plots.Count; i++)
            {
                snapshot.Plots[i] = FilterPlotFor(snapshot.Plots[i], playerId);
            }
            return snapshot;
        }

        /// <summary>Only the owner sees the active invite code.</summary>
        public static PlotState FilterPlotFor(PlotState plot, string playerId)
        {
            if (plot.OwnerId != playerId)
            {
                plot.ActiveInviteCode = "";
            }
            return plot;
        }

        public async Task<List<string>> GetPlayerVillagesAsync(string playerId)
        {
            var response = await api.CloudSaveData.GetItemsAsync(
                context, context.ServiceToken, context.ProjectId, playerId, new List<string> { "villages" });
            Item item = response.Data.Results.FirstOrDefault(result => result.Key == "villages");
            if (item == null)
            {
                return new List<string>();
            }
            return JsonConvert.DeserializeObject<List<string>>(item.Value.ToString()) ?? new List<string>();
        }

        public Task SetPlayerVillagesAsync(string playerId, List<string> villageIds)
        {
            var body = new SetItemBody("villages", JsonConvert.SerializeObject(villageIds));
            return api.CloudSaveData.SetItemAsync(context, context.ServiceToken, context.ProjectId, playerId, body);
        }
    }
}
