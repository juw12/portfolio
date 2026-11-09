using System;
using System.Collections.Generic;
using CozyFishing.Village;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Shared village: claim a homestead, invite friends with a code, tend plots together
    /// (live co-op when someone is hosting, or visit anytime while they're offline).
    /// Click signs / beds / mailboxes; V opens the village menu.
    /// </summary>
    public class VillageActivity : CozyActivity
    {
        [Serializable]
        public class VillageSeed
        {
            [Tooltip("Must match VillageRules.SeedGrowMinutes on the server.")]
            public string id = "daisy";
            public string displayName = "Daisy";
            public Color bloomColor = Color.white;
            public float bloomSize = 0.16f;
            [Tooltip("CozyProgress key spent when planting (e.g. rare_seeds). Empty = free.")]
            public string costKey = "";
            public GameObject grownPrefab;
        }

        enum Panel { None, Menu, Invite, Mailbox }

        [Header("Village")]
        public List<VillagePlot> plots = new List<VillagePlot>();
        public VillageSeed[] seeds =
        {
            new VillageSeed { id = "daisy", displayName = "Daisy", bloomColor = new Color(1f, 0.97f, 0.9f) },
            new VillageSeed { id = "tulip", displayName = "Tulip", bloomColor = new Color(0.96f, 0.5f, 0.62f) },
            new VillageSeed { id = "tomato", displayName = "Tomato", bloomColor = new Color(0.9f, 0.25f, 0.2f), bloomSize = 0.14f },
            new VillageSeed { id = "sunflower", displayName = "Sunflower", bloomColor = new Color(1f, 0.82f, 0.25f), bloomSize = 0.24f },
            new VillageSeed { id = "moonflower", displayName = "Moonflower", bloomColor = new Color(0.75f, 0.85f, 1f), bloomSize = 0.2f, costKey = "rare_seeds" },
        };
        [Tooltip("e.g. a URP/Lit material for the placeholder plants.")]
        public Material plantMaterialTemplate;

        [Header("Audio")]
        public AudioSource sfxSource;
        public AudioClip plantClip;
        public AudioClip waterClip;
        public AudioClip harvestClip;
        public AudioClip noteClip;

        Panel panel;
        int panelPlot;
        int selectedSeed;
        VillageTarget hovered;
        Camera viewCamera;
        Vector2 scroll;
        string nameInput;
        string villageNameInput = "Cozy Village";
        string codeInput = "";
        string noteInput = "";

        VillageClient Client => VillageClient.Instance;
        VillageSnapshot Village => Client ? Client.Current : null;
        string Me => Client ? Client.PlayerId : "";

        void Reset()
        {
            displayName = "Village";
            enterHint = "Claim a homestead, invite friends, tend plots together. V = village menu.";
            cameraDistance = 16f;
            cameraPitch = 40f;
        }

        void Awake()
        {
            foreach (var plot in plots)
            {
                if (plot)
                {
                    plot.Initialize(this);
                }
            }
            nameInput = VillageClient.DisplayName;
        }

        public VillageSeed FindSeed(string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return null;
            }
            foreach (var seed in seeds)
            {
                if (seed.id == id)
                {
                    return seed;
                }
            }
            return null;
        }

        protected override void OnEnter()
        {
            // Focus on your own homestead if you have one (the hub reads cameraFocus right after Enter).
            int mine = VillageRules.OwnedPlotIndex(Village, Me);
            var myPlot = plots.Find(plot => plot && plot.plotIndex == mine);
            if (myPlot)
            {
                cameraFocus = myPlot.transform;
            }
            panel = Village == null ? Panel.Menu : Panel.None;
        }

        protected override void OnExit()
        {
            panel = Panel.None;
        }

        void Update()
        {
            if (!InputReady)
            {
                hovered = null;
                return;
            }
            if (CozyInput.VillageMenuPressed)
            {
                panel = panel == Panel.None ? Panel.Menu : Panel.None;
            }
            if (panel != Panel.None)
            {
                hovered = null;   // menus own the mouse while open
                return;
            }
            if (CozyInput.PrevPressed)
            {
                selectedSeed = (selectedSeed + seeds.Length - 1) % seeds.Length;
            }
            if (CozyInput.NextPressed)
            {
                selectedSeed = (selectedSeed + 1) % seeds.Length;
            }

            hovered = RaycastTarget();
            if (hovered && CozyInput.PrimaryPressed && Client && !Client.Busy)
            {
                HandleClick(hovered);
            }
        }

        VillageTarget RaycastTarget()
        {
            if (!viewCamera)
            {
                viewCamera = Camera.main;
            }
            if (!viewCamera)
            {
                return null;
            }
            if (Physics.Raycast(CozyInput.PointerRay(viewCamera), out RaycastHit hit, 200f, ~0, QueryTriggerInteraction.Ignore))
            {
                return hit.collider.GetComponentInParent<VillageTarget>();
            }
            return null;
        }

        // ------------------------------------------------------------------ world clicks

        async void HandleClick(VillageTarget target)
        {
            if (Village == null)
            {
                CozyGui.Toast("Create or join a village first (V).", 4f);
                panel = Panel.Menu;
                return;
            }
            int plotIndex = target.plot.plotIndex;
            PlotState plot = Village.Plots[plotIndex];
            PlotRole role = VillageRules.RoleOf(Village.Meta, plot, Me);

            switch (target.kind)
            {
                case VillageTarget.Kind.Sign:
                    if (!VillageRules.IsClaimed(plot))
                    {
                        if (VillageRules.OwnedPlotIndex(Village, Me) >= 0)
                        {
                            CozyGui.Toast("You already have a homestead here. Invite friends to it instead!", 4f);
                        }
                        else
                        {
                            await Client.ClaimPlotAsync(plotIndex);
                        }
                    }
                    else if (role == PlotRole.Owner)
                    {
                        OpenPanel(Panel.Invite, plotIndex);
                    }
                    else
                    {
                        string mates = plot.Members.Count > 0
                            ? " with " + string.Join(", ", plot.Members.ConvertAll(member => member.Name))
                            : "";
                        CozyGui.Toast($"{plot.OwnerName}'s homestead{mates}.", 4f);
                    }
                    break;

                case VillageTarget.Kind.Mailbox:
                    if (VillageRules.IsClaimed(plot))
                    {
                        OpenPanel(Panel.Mailbox, plotIndex);
                    }
                    break;

                case VillageTarget.Kind.Bed:
                    await HandleBedClick(plot, role, target.bedIndex);
                    break;
            }
        }

        async System.Threading.Tasks.Task HandleBedClick(PlotState plot, PlotRole role, int bedIndex)
        {
            if (!VillageRules.IsClaimed(plot))
            {
                CozyGui.Toast("Claim this homestead (click its sign) to start planting.", 4f);
                return;
            }
            BedState bed = plot.Beds[bedIndex];
            switch (VillageRules.StageAt(bed, VillageRules.NowUtc))
            {
                case VillageRules.BedStage.Empty:
                    if (role < PlotRole.Member)
                    {
                        CozyGui.Toast($"Ask {plot.OwnerName} for their invite code to plant here.", 4f);
                        return;
                    }
                    var seed = seeds[selectedSeed];
                    if (!string.IsNullOrEmpty(seed.costKey) && CozyProgress.Get(seed.costKey) <= 0)
                    {
                        CozyGui.Toast($"No {seed.displayName} seeds yet - finish a focus session (F) to earn one.", 5f);
                        return;
                    }
                    if (await Client.BedActionAsync(plot.Index, bedIndex, "plant", seed.id))
                    {
                        if (!string.IsNullOrEmpty(seed.costKey))
                        {
                            CozyProgress.TrySpend(seed.costKey);
                        }
                        PlayClip(sfxSource, plantClip);
                    }
                    break;

                case VillageRules.BedStage.Thirsty:
                    if (await Client.BedActionAsync(plot.Index, bedIndex, "water"))
                    {
                        PlayClip(sfxSource, waterClip);
                        if (role < PlotRole.Member)
                        {
                            CozyGui.Toast($"You watered {plot.OwnerName}'s {VillageRules.SeedName(bed.SeedId)}. They'll see it was you.", 4f);
                        }
                    }
                    break;

                case VillageRules.BedStage.Growing:
                    CozyGui.Toast($"{VillageRules.SeedName(bed.SeedId)} is growing - about {VillageRules.MinutesLeft(bed, VillageRules.NowUtc):0} min to go.", 3f);
                    break;

                case VillageRules.BedStage.Bloomed:
                    if (role < PlotRole.Member)
                    {
                        CozyGui.Toast($"It's ready! Only {plot.OwnerName} and their plot-mates can harvest.", 4f);
                        return;
                    }
                    string seedName = VillageRules.SeedName(bed.SeedId);
                    if (await Client.BedActionAsync(plot.Index, bedIndex, "harvest"))
                    {
                        CozyProgress.Add("harvest");
                        CozyProgress.Add("harvest_" + seedName);
                        PlayClip(sfxSource, harvestClip);
                        CozyGui.Toast($"Harvested a {seedName}!", 3f);
                    }
                    break;
            }
        }

        void OpenPanel(Panel which, int plotIndex)
        {
            panel = which;
            panelPlot = plotIndex;
            scroll = Vector2.zero;
            noteInput = "";
            if (which == Panel.Mailbox && Village != null && Village.Plots[plotIndex].OwnerId == Me)
            {
                Client.MarkMailboxRead();
            }
        }

        // ------------------------------------------------------------------ HUD

        public override void DrawHud()
        {
            switch (panel)
            {
                case Panel.Menu:
                    DrawMenu();
                    return;
                case Panel.Invite:
                    DrawInvite();
                    return;
                case Panel.Mailbox:
                    DrawMailbox();
                    return;
            }

            var seed = seeds[selectedSeed];
            string cost = string.IsNullOrEmpty(seed.costKey) ? "" : $"  ·  {CozyProgress.Get(seed.costKey)} in pouch";
            const float width = 440f;
            var rect = new Rect((Screen.width - width) * 0.5f, Screen.height - 96f, width, 60f);
            CozyGui.PanelBox(rect);
            CozyGui.Label(new Rect(rect.x, rect.y + 6f, width, 26f), $"Q  <   {seed.displayName}   >  E", 20);
            CozyGui.Label(new Rect(rect.x, rect.y + 32f, width, 22f), $"V village menu  ·  right-click to walk{cost}", 14);

            if (hovered)
            {
                CozyGui.Tooltip(HoverText(hovered));
            }
            if (Client && Client.Busy)
            {
                CozyGui.Label(new Rect(Screen.width - 180f, Screen.height - 40f, 160f, 30f), "syncing...", 13, TextAnchor.MiddleRight);
            }
        }

        string HoverText(VillageTarget target)
        {
            if (Village == null)
            {
                return "Join a village first (V)";
            }
            PlotState plot = Village.Plots[target.plot.plotIndex];
            PlotRole role = VillageRules.RoleOf(Village.Meta, plot, Me);
            switch (target.kind)
            {
                case VillageTarget.Kind.Sign:
                    if (!VillageRules.IsClaimed(plot))
                    {
                        return "Click to claim this homestead";
                    }
                    return role == PlotRole.Owner ? "Your homestead - click to invite friends" : $"{plot.OwnerName}'s homestead";
                case VillageTarget.Kind.Mailbox:
                    return VillageRules.IsClaimed(plot) ? $"{plot.OwnerName}'s mailbox ({plot.Notes.Count} notes)" : "Empty mailbox";
            }

            if (!VillageRules.IsClaimed(plot))
            {
                return "Unclaimed bed";
            }
            BedState bed = plot.Beds[target.bedIndex];
            long now = VillageRules.NowUtc;
            string seedName = VillageRules.SeedName(bed.SeedId);
            switch (VillageRules.StageAt(bed, now))
            {
                case VillageRules.BedStage.Empty:
                    return role >= PlotRole.Member ? $"Click to plant {seeds[selectedSeed].displayName}" : "Empty bed";
                case VillageRules.BedStage.Thirsty:
                    return VillageRules.Growth01(bed, now) < 0.01f ? $"{seedName} seed - click to water" : $"{seedName} is thirsty - click to water";
                case VillageRules.BedStage.Growing:
                    string by = string.IsNullOrEmpty(bed.LastWateredBy) ? "" : $"  ·  watered by {bed.LastWateredBy}";
                    return $"{seedName}  ·  {VillageRules.Growth01(bed, now) * 100f:0}%{by}";
                default:
                    return role >= PlotRole.Member ? $"Click to harvest the {seedName}" : $"{seedName} is in bloom";
            }
        }

        // ------------------------------------------------------------------ panels

        Rect BeginPanel(float width, float height, string title)
        {
            var rect = new Rect((Screen.width - width) * 0.5f, (Screen.height - height) * 0.5f, width, height);
            CozyGui.PanelBox(rect);
            CozyGui.Label(new Rect(rect.x, rect.y + 10f, width, 32f), title, 22);
            GUILayout.BeginArea(new Rect(rect.x + 24f, rect.y + 50f, width - 48f, height - 64f));
            return rect;
        }

        static void EndPanel()
        {
            GUILayout.EndArea();
        }

        static void Text(string text, int size = 15)
        {
            GUILayout.Label(text, CozyGui.LabelStyle(size, TextAnchor.MiddleLeft));
        }

        void DrawMenu()
        {
            var client = Client;
            BeginPanel(460f, 560f, Village != null ? Village.Meta.Name : "Village");
            scroll = GUILayout.BeginScrollView(scroll);

            if (!client || !client.IsReady)
            {
                Text(client ? client.Status : "Add a VillageClient to the scene.");
                GUILayout.EndScrollView();
                CloseButton();
                EndPanel();
                return;
            }

            GUILayout.BeginHorizontal();
            Text("Your name", 15);
            nameInput = GUILayout.TextField(nameInput ?? "", VillageRules.MaxNameLength, GUILayout.Width(200f));
            if (GUILayout.Button("Save", GUILayout.Width(60f)))
            {
                VillageClient.DisplayName = nameInput;
                nameInput = VillageClient.DisplayName;
                CozyGui.Toast($"Hi, {nameInput}!", 2f);
            }
            GUILayout.EndHorizontal();
            GUILayout.Space(10f);

            if (Village != null)
            {
                DrawCurrentVillage();
                GUILayout.Space(12f);
            }

            Text("Your villages", 17);
            if (client.MyVillages.Count == 0)
            {
                Text("None yet - create one or use a friend's invite code.", 14);
            }
            foreach (var summary in client.MyVillages)
            {
                GUILayout.BeginHorizontal();
                string live = summary.IsLive ? $"  ·  {summary.LiveHostName} is playing" : "";
                Text($"{summary.Name}  ({summary.Residents}){live}", 14);
                bool isCurrent = Village != null && Village.VillageId == summary.VillageId;
                GUI.enabled = !isCurrent && !client.Busy;
                if (GUILayout.Button(isCurrent ? "Here" : "Visit", GUILayout.Width(70f)))
                {
                    _ = client.LoadVillageAsync(summary.VillageId);
                }
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
            GUILayout.Space(12f);

            Text("Have an invite code?", 17);
            GUILayout.BeginHorizontal();
            codeInput = GUILayout.TextField(codeInput ?? "", 12, GUILayout.Width(160f));
            GUI.enabled = !client.Busy && VillageRules.NormalizeCode(codeInput).Length == VillageRules.InviteCodeLength;
            if (GUILayout.Button("Join plot", GUILayout.Width(110f)))
            {
                JoinWithCode();
            }
            GUI.enabled = true;
            GUILayout.EndHorizontal();
            GUILayout.Space(12f);

            Text("Start a new village", 17);
            GUILayout.BeginHorizontal();
            villageNameInput = GUILayout.TextField(villageNameInput ?? "", VillageRules.MaxVillageNameLength, GUILayout.Width(220f));
            GUI.enabled = !client.Busy;
            if (GUILayout.Button("Create", GUILayout.Width(90f)))
            {
                _ = client.CreateVillageAsync(villageNameInput);
            }
            GUI.enabled = true;
            GUILayout.EndHorizontal();

            GUILayout.EndScrollView();
            CloseButton();
            EndPanel();
        }

        async void JoinWithCode()
        {
            if (await Client.RedeemInviteAsync(codeInput))
            {
                codeInput = "";
                panel = Panel.None;
            }
        }

        void DrawCurrentVillage()
        {
            var client = Client;
            var meta = Village.Meta;
            int mine = VillageRules.OwnedPlotIndex(Village, Me);
            Text($"{meta.Residents.Count} villagers: {string.Join(", ", meta.Residents.ConvertAll(member => member.Name))}", 14);
            Text(mine >= 0 ? $"Your homestead: #{mine + 1}" : "No homestead yet - click a free plot's sign to claim one.", 14);

            if (mine >= 0 && GUILayout.Button("Invite friends to my plot"))
            {
                OpenPanel(Panel.Invite, mine);
            }

            var live = LiveSessionManager.Instance;
            bool someoneLive = VillageRules.IsLive(meta, VillageRules.NowUtc);
            if (!live)
            {
                Text("(Live play isn't set up in this scene.)", 13);
                return;
            }
            GUI.enabled = !live.Busy && !client.Busy;
            if (live.IsLive)
            {
                Text(live.IsHost ? "You're hosting - villagers can join from their menu." : "You're playing live.", 14);
                if (GUILayout.Button("Leave live session"))
                {
                    _ = live.LeaveAsync();
                }
            }
            else if (someoneLive && meta.LiveHostId != Me)
            {
                if (GUILayout.Button($"Join {meta.LiveHostName} live"))
                {
                    _ = live.JoinAsync(meta.LiveSessionCode, meta.LiveHostName);
                    panel = Panel.None;
                }
                Text("...or just keep visiting quietly.", 13);
            }
            else if (GUILayout.Button("Play together now (host)"))
            {
                _ = live.HostAsync(Village.VillageId);
            }
            GUI.enabled = true;
        }

        void DrawInvite()
        {
            var client = Client;
            if (Village == null)
            {
                panel = Panel.None;
                return;
            }
            PlotState plot = Village.Plots[panelPlot];
            BeginPanel(440f, 430f, "Invite friends");
            Text("Friends who use this code join your homestead. They can plant, water and harvest with you - live, or any time while you're away.", 14);
            GUILayout.Space(10f);

            bool valid = !string.IsNullOrEmpty(plot.ActiveInviteCode)
                && plot.InviteExpiresUtc > VillageRules.NowUtc
                && plot.InviteUsesLeft > 0;
            if (valid)
            {
                double hours = TimeSpan.FromTicks(plot.InviteExpiresUtc - VillageRules.NowUtc).TotalHours;
                GUILayout.Label(plot.ActiveInviteCode, CozyGui.LabelStyle(38));
                Text($"Expires in {hours:0} h  ·  {plot.InviteUsesLeft} uses left", 13);
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("Copy code"))
                {
                    GUIUtility.systemCopyBuffer = plot.ActiveInviteCode;
                    CozyGui.Toast("Invite code copied - paste it to your friends!", 3f);
                }
                GUI.enabled = !client.Busy;
                if (GUILayout.Button("New code"))
                {
                    _ = client.CreateInviteAsync(panelPlot);
                }
                GUI.enabled = true;
                GUILayout.EndHorizontal();
                Text("A new code makes the old one stop working.", 12);
            }
            else
            {
                GUI.enabled = !client.Busy;
                if (GUILayout.Button("Create invite code", GUILayout.Height(36f)))
                {
                    _ = client.CreateInviteAsync(panelPlot);
                }
                GUI.enabled = true;
            }

            GUILayout.Space(12f);
            Text($"Plot-mates ({plot.Members.Count}/{VillageRules.MaxMembersPerPlot})", 16);
            foreach (var member in plot.Members)
            {
                GUILayout.BeginHorizontal();
                Text(member.Name, 14);
                GUI.enabled = !client.Busy;
                if (GUILayout.Button("Remove", GUILayout.Width(80f)))
                {
                    _ = client.RemoveMemberAsync(panelPlot, member.Id);
                }
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
            CloseButton();
            EndPanel();
        }

        void DrawMailbox()
        {
            var client = Client;
            if (Village == null)
            {
                panel = Panel.None;
                return;
            }
            PlotState plot = Village.Plots[panelPlot];
            PlotRole role = VillageRules.RoleOf(Village.Meta, plot, Me);
            BeginPanel(460f, 520f, $"{plot.OwnerName}'s mailbox");

            scroll = GUILayout.BeginScrollView(scroll, GUILayout.Height(260f));
            if (plot.Notes.Count == 0 && plot.Log.Count == 0)
            {
                Text("Nothing here yet.", 14);
            }
            for (int i = plot.Notes.Count - 1; i >= 0; i--)
            {
                var note = plot.Notes[i];
                Text($"<{note.FromName}>  {note.Text}", 14);
                Text(Ago(note.Utc), 11);
            }
            if (plot.Log.Count > 0)
            {
                GUILayout.Space(8f);
                Text("Recent goings-on", 15);
                for (int i = plot.Log.Count - 1; i >= 0; i--)
                {
                    var entry = plot.Log[i];
                    Text($"{entry.FromName} {entry.Text}  ·  {Ago(entry.Utc)}", 13);
                }
            }
            GUILayout.EndScrollView();

            if (role >= PlotRole.Resident)
            {
                GUILayout.Space(8f);
                Text(role == PlotRole.Owner ? "Leave yourself a reminder" : $"Leave {plot.OwnerName} a note", 15);
                noteInput = GUILayout.TextField(noteInput ?? "", VillageRules.MaxNoteLength);
                GUI.enabled = !client.Busy && noteInput.Trim().Length > 0;
                if (GUILayout.Button("Send note"))
                {
                    SendNote();
                }
                GUI.enabled = true;
            }
            CloseButton();
            EndPanel();
        }

        async void SendNote()
        {
            string text = noteInput;
            if (await Client.LeaveNoteAsync(panelPlot, text))
            {
                noteInput = "";
                PlayClip(sfxSource, noteClip);
            }
        }

        void CloseButton()
        {
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Close"))
            {
                panel = Panel.None;
            }
        }

        static string Ago(long utcTicks)
        {
            var span = TimeSpan.FromTicks(Math.Max(0, VillageRules.NowUtc - utcTicks));
            if (span.TotalMinutes < 1)
            {
                return "just now";
            }
            if (span.TotalHours < 1)
            {
                return $"{span.TotalMinutes:0} min ago";
            }
            if (span.TotalDays < 1)
            {
                return $"{span.TotalHours:0} h ago";
            }
            return $"{span.TotalDays:0} d ago";
        }
    }
}
