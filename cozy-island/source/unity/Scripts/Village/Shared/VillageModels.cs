// Shared between the Unity client AND the Cloud Code module (linked into CozyVillage.csproj).
// Keep this file free of UnityEngine / Newtonsoft references so it compiles in both places.
using System;
using System.Collections.Generic;
using System.Text;

namespace CozyFishing.Village
{
    public enum PlotRole
    {
        None = 0,      // not in this village
        Resident = 1,  // lives in the village: can water and leave notes
        Member = 2,    // joined this plot via its invite code: can also plant and harvest
        Owner = 3,     // claimed the plot: everything, plus invites and removing plot-mates
    }

    public class Member
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
    }

    public class BedState
    {
        public string SeedId { get; set; } = "";      // "" = empty
        public double GrownSeconds { get; set; }
        public long LastTickUtc { get; set; }
        public long WaterEndsUtc { get; set; }
        public string PlantedBy { get; set; } = "";
        public string LastWateredBy { get; set; } = "";
    }

    public class Note
    {
        public string FromName { get; set; } = "";
        public string Text { get; set; } = "";
        public long Utc { get; set; }
    }

    public class PlotState
    {
        public int Index { get; set; }
        public string OwnerId { get; set; } = "";
        public string OwnerName { get; set; } = "";
        public List<Member> Members { get; set; } = new List<Member>();
        public List<BedState> Beds { get; set; } = new List<BedState>();
        public List<Note> Notes { get; set; } = new List<Note>();   // mailbox
        public List<Note> Log { get; set; } = new List<Note>();     // "Mika watered the Tulip"
        public string ActiveInviteCode { get; set; } = "";         // only sent to the owner
        public long InviteExpiresUtc { get; set; }
        public int InviteUsesLeft { get; set; }
    }

    public class VillageMeta
    {
        public string Name { get; set; } = "Cozy Village";
        public string FounderId { get; set; } = "";
        public long CreatedUtc { get; set; }
        public List<Member> Residents { get; set; } = new List<Member>();
        public string LiveSessionCode { get; set; } = "";
        public string LiveHostId { get; set; } = "";
        public string LiveHostName { get; set; } = "";
        public long LiveHeartbeatUtc { get; set; }
    }

    public class VillageSnapshot
    {
        public string VillageId { get; set; } = "";
        public VillageMeta Meta { get; set; } = new VillageMeta();
        public List<PlotState> Plots { get; set; } = new List<PlotState>();
    }

    public class VillageSummary
    {
        public string VillageId { get; set; } = "";
        public string Name { get; set; } = "";
        public int Residents { get; set; }
        public bool IsLive { get; set; }
        public string LiveHostName { get; set; } = "";
    }

    public class InviteInfo
    {
        public string Code { get; set; } = "";
        public long ExpiresUtc { get; set; }
        public int UsesLeft { get; set; }
    }

    /// <summary>Server-side only (stored privately under a peppered hash of the code).</summary>
    public class InviteRecord
    {
        public string VillageId { get; set; } = "";
        public int PlotIndex { get; set; }
        public string CreatedBy { get; set; } = "";
        public long ExpiresUtc { get; set; }
        public int UsesLeft { get; set; }
    }

    /// <summary>Every Cloud Code function returns this, so the client can show friendly errors.</summary>
    public class Result<T>
    {
        public bool Ok { get; set; }
        public string Error { get; set; } = "";
        public T Data { get; set; }

        public static Result<T> Success(T data) => new Result<T> { Ok = true, Data = data };

        public static Result<T> Fail(string error) => new Result<T> { Ok = false, Error = error };
    }

    public static class VillageRules
    {
        public const int PlotCount = 4;
        public const int BedsPerPlot = 4;
        public const int MaxMembersPerPlot = 6;
        public const int MaxResidents = 24;
        public const int MaxVillagesPerPlayer = 5;
        public const int MaxNotes = 20;
        public const int MaxLogEntries = 12;
        public const int MaxNoteLength = 140;
        public const int MaxNameLength = 20;
        public const int MaxVillageNameLength = 24;
        public const int InviteCodeLength = 6;
        public const string InviteAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
        public const double InviteLifetimeHours = 48.0;
        public const int InviteUses = 5;
        public const double WaterLastsFraction = 0.55;   // water at planting + once around halfway
        public const double LiveTimeoutMinutes = 5.0;    // host heartbeat older than this = not live

        public static readonly Dictionary<string, double> SeedGrowMinutes = new Dictionary<string, double>
        {
            { "daisy", 5.0 },
            { "tulip", 15.0 },
            { "tomato", 25.0 },
            { "sunflower", 50.0 },
            { "moonflower", 90.0 },
        };

        public enum BedStage { Empty, Thirsty, Growing, Bloomed }

        public static long NowUtc => DateTime.UtcNow.Ticks;

        public static string PlotKey(int index) => "plot_" + index;

        public static bool IsClaimed(PlotState plot) => plot != null && !string.IsNullOrEmpty(plot.OwnerId);

        public static bool IsEmpty(BedState bed) => bed == null || string.IsNullOrEmpty(bed.SeedId);

        public static double TotalSeconds(BedState bed)
        {
            if (bed != null && bed.SeedId != null && SeedGrowMinutes.TryGetValue(bed.SeedId, out double minutes))
            {
                return Math.Max(1.0, minutes * 60.0);
            }
            return 1.0;
        }

        /// <summary>Growth including time since the last server tick (water-limited). Pure - no mutation.</summary>
        public static double ProjectedGrownSeconds(BedState bed, long nowUtc)
        {
            if (IsEmpty(bed))
            {
                return 0.0;
            }
            long growEnd = Math.Min(nowUtc, bed.WaterEndsUtc);
            double extra = growEnd > bed.LastTickUtc ? (growEnd - bed.LastTickUtc) / (double)TimeSpan.TicksPerSecond : 0.0;
            return bed.GrownSeconds + extra;
        }

        public static BedStage StageAt(BedState bed, long nowUtc)
        {
            if (IsEmpty(bed))
            {
                return BedStage.Empty;
            }
            if (ProjectedGrownSeconds(bed, nowUtc) >= TotalSeconds(bed))
            {
                return BedStage.Bloomed;
            }
            return nowUtc >= bed.WaterEndsUtc ? BedStage.Thirsty : BedStage.Growing;
        }

        public static float Growth01(BedState bed, long nowUtc)
        {
            if (IsEmpty(bed))
            {
                return 0f;
            }
            return (float)Math.Min(1.0, ProjectedGrownSeconds(bed, nowUtc) / TotalSeconds(bed));
        }

        public static double MinutesLeft(BedState bed, long nowUtc)
        {
            return Math.Max(0.0, (TotalSeconds(bed) - ProjectedGrownSeconds(bed, nowUtc)) / 60.0);
        }

        public static void Tick(BedState bed, long nowUtc)
        {
            bed.GrownSeconds = ProjectedGrownSeconds(bed, nowUtc);
            bed.LastTickUtc = nowUtc;
        }

        public static void Plant(BedState bed, string seedId, string byName, long nowUtc)
        {
            bed.SeedId = seedId;
            bed.GrownSeconds = 0.0;
            bed.LastTickUtc = nowUtc;
            bed.WaterEndsUtc = 0;
            bed.PlantedBy = byName;
            bed.LastWateredBy = "";
        }

        public static void Water(BedState bed, string byName, long nowUtc)
        {
            Tick(bed, nowUtc);
            bed.WaterEndsUtc = nowUtc + (long)(TotalSeconds(bed) * WaterLastsFraction * TimeSpan.TicksPerSecond);
            bed.LastWateredBy = byName;
        }

        public static void Clear(BedState bed)
        {
            bed.SeedId = "";
            bed.GrownSeconds = 0.0;
            bed.LastTickUtc = 0;
            bed.WaterEndsUtc = 0;
            bed.PlantedBy = "";
            bed.LastWateredBy = "";
        }

        public static PlotState NewPlot(int index)
        {
            var plot = new PlotState { Index = index };
            for (int i = 0; i < BedsPerPlot; i++)
            {
                plot.Beds.Add(new BedState());
            }
            return plot;
        }

        public static bool IsResident(VillageMeta meta, string playerId)
        {
            return meta != null && meta.Residents.Exists(member => member.Id == playerId);
        }

        public static PlotRole RoleOf(VillageMeta meta, PlotState plot, string playerId)
        {
            if (string.IsNullOrEmpty(playerId) || !IsResident(meta, playerId))
            {
                return PlotRole.None;
            }
            if (plot != null && plot.OwnerId == playerId)
            {
                return PlotRole.Owner;
            }
            if (plot != null && plot.Members.Exists(member => member.Id == playerId))
            {
                return PlotRole.Member;
            }
            return PlotRole.Resident;
        }

        public static int OwnedPlotIndex(VillageSnapshot village, string playerId)
        {
            if (village == null)
            {
                return -1;
            }
            foreach (var plot in village.Plots)
            {
                if (plot.OwnerId == playerId)
                {
                    return plot.Index;
                }
            }
            return -1;
        }

        public static bool IsLive(VillageMeta meta, long nowUtc)
        {
            return meta != null
                && !string.IsNullOrEmpty(meta.LiveSessionCode)
                && nowUtc - meta.LiveHeartbeatUtc < TimeSpan.FromMinutes(LiveTimeoutMinutes).Ticks;
        }

        public static string CleanText(string text, int maxLength)
        {
            if (string.IsNullOrEmpty(text))
            {
                return "";
            }
            var builder = new StringBuilder(text.Length);
            foreach (char c in text)
            {
                if (!char.IsControl(c))
                {
                    builder.Append(c);
                }
            }
            string cleaned = builder.ToString().Trim();
            return cleaned.Length > maxLength ? cleaned.Substring(0, maxLength) : cleaned;
        }

        public static string CleanName(string name)
        {
            string cleaned = CleanText(name, MaxNameLength);
            return cleaned.Length == 0 ? "Friend" : cleaned;
        }

        /// <summary>Upper-cases and keeps only alphabet characters ("k7q-x2m" -> "K7QX2M").</summary>
        public static string NormalizeCode(string code)
        {
            if (string.IsNullOrEmpty(code))
            {
                return "";
            }
            var builder = new StringBuilder();
            foreach (char c in code.ToUpperInvariant())
            {
                if (InviteAlphabet.IndexOf(c) >= 0)
                {
                    builder.Append(c);
                }
            }
            return builder.ToString();
        }

        public static string SeedName(string seedId)
        {
            if (string.IsNullOrEmpty(seedId))
            {
                return "";
            }
            return char.ToUpperInvariant(seedId[0]) + seedId.Substring(1);
        }

        public static void AddCapped(List<Note> list, Note entry, int max)
        {
            list.Add(entry);
            while (list.Count > max)
            {
                list.RemoveAt(0);
            }
        }
    }
}
