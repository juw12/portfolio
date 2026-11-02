using CozyFishing.Village;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>Something clickable on a homestead: a bed, the sign, or the mailbox.</summary>
    public class VillageTarget : MonoBehaviour
    {
        public enum Kind { Bed, Sign, Mailbox }

        public Kind kind;
        public VillagePlot plot;
        public int bedIndex;
    }

    /// <summary>
    /// One claimable homestead in the scene (markers Homestead_N, Homestead_N_Bed_0..3, _Sign, _Mailbox).
    /// Renders the cloud state of plot N and shows the owner's name above the sign.
    /// </summary>
    public class VillagePlot : MonoBehaviour
    {
        [Range(0, VillageRules.PlotCount - 1)] public int plotIndex;
        public Transform[] beds = new Transform[VillageRules.BedsPerPlot];
        public Transform sign;
        public Transform mailbox;
        public Vector3 bedClickBox = new Vector3(0.8f, 0.5f, 0.6f);
        public float labelMaxDistance = 45f;

        VillageActivity village;
        PlantVisual[] visuals;
        string[] shownSeeds;
        Camera viewCamera;

        public PlotState State
        {
            get
            {
                var client = VillageClient.Instance;
                if (!client || client.Current == null || plotIndex >= client.Current.Plots.Count)
                {
                    return null;
                }
                return client.Current.Plots[plotIndex];
            }
        }

        public void Initialize(VillageActivity owner)
        {
            village = owner;
            visuals = new PlantVisual[beds.Length];
            shownSeeds = new string[beds.Length];
            for (int i = 0; i < beds.Length; i++)
            {
                if (!beds[i])
                {
                    continue;
                }
                visuals[i] = new PlantVisual(beds[i], owner.plantMaterialTemplate, bedClickBox, plotIndex * 3.1f + i * 1.7f);
                var target = visuals[i].Root.gameObject.AddComponent<VillageTarget>();
                target.kind = VillageTarget.Kind.Bed;
                target.plot = this;
                target.bedIndex = i;
                shownSeeds[i] = "";
            }
            AddClickTarget(sign, VillageTarget.Kind.Sign);
            AddClickTarget(mailbox, VillageTarget.Kind.Mailbox);
        }

        void AddClickTarget(Transform marker, VillageTarget.Kind kind)
        {
            if (!marker)
            {
                return;
            }
            var clickObject = new GameObject($"{kind}Click");
            clickObject.transform.SetParent(marker, false);
            var sphere = clickObject.AddComponent<SphereCollider>();
            sphere.radius = 0.45f;
            var target = clickObject.AddComponent<VillageTarget>();
            target.kind = kind;
            target.plot = this;
        }

        void Update()
        {
            if (village == null || visuals == null)
            {
                return;
            }
            PlotState plot = State;
            long now = VillageRules.NowUtc;
            for (int i = 0; i < visuals.Length; i++)
            {
                if (visuals[i] == null)
                {
                    continue;
                }
                BedState bed = plot != null && i < plot.Beds.Count ? plot.Beds[i] : null;
                string seedId = bed != null ? bed.SeedId ?? "" : "";
                var seed = village.FindSeed(seedId);
                if (shownSeeds[i] != seedId)
                {
                    shownSeeds[i] = seedId;
                    visuals[i].SetPlant(seed != null, seed != null ? seed.bloomColor : Color.white,
                        seed != null ? seed.bloomSize : 0f, seed != null ? seed.grownPrefab : null);
                }
                if (seed != null)
                {
                    bool thirsty = VillageRules.StageAt(bed, now) == VillageRules.BedStage.Thirsty;
                    visuals[i].Update(VillageRules.Growth01(bed, now), thirsty);
                }
                else
                {
                    visuals[i].Update(0f, false);
                }
            }
        }

        void OnGUI()
        {
            if (!sign || village == null)
            {
                return;
            }
            if (!viewCamera)
            {
                viewCamera = Camera.main;
                if (!viewCamera)
                {
                    return;
                }
            }
            Vector3 anchor = sign.position + Vector3.up * 0.8f;
            Vector3 screen = viewCamera.WorldToScreenPoint(anchor);
            if (screen.z <= 0f || screen.z > labelMaxDistance)
            {
                return;
            }

            PlotState plot = State;
            string label;
            if (plot == null)
            {
                if (!village.IsActive)
                {
                    return;
                }
                label = "Homestead - join a village to claim";
            }
            else if (!VillageRules.IsClaimed(plot))
            {
                if (!village.IsActive)
                {
                    return;
                }
                label = "Free plot - click the sign to claim";
            }
            else
            {
                int mates = plot.Members.Count;
                label = mates > 0 ? $"{plot.OwnerName}'s plot  +{mates}" : $"{plot.OwnerName}'s plot";
            }

            var style = CozyGui.LabelStyle(14);
            Vector2 size = style.CalcSize(new GUIContent(label)) + new Vector2(18f, 8f);
            var rect = new Rect(screen.x - size.x * 0.5f, Screen.height - screen.y - size.y, size.x, size.y);
            CozyGui.PanelBox(rect);
            CozyGui.Label(rect, label, 14);
        }
    }
}
