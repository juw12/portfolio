using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Plant before you start work, water on a break, harvest later.
    /// Click an empty plot to plant, hold on a thirsty plot to water, click a bloom to harvest. Q/E picks the seed.
    /// </summary>
    public class GardenActivity : CozyActivity
    {
        [Serializable]
        public class SeedType
        {
            public string displayName = "Daisy";
            public Color bloomColor = Color.white;
            [Min(0.1f)] public float growMinutes = 5f;
            [Tooltip("CozyProgress key spent when planting (e.g. rare_seeds). Empty = free.")]
            public string costKey = "";
            [Tooltip("Optional model, scaled up as it grows. Empty = built-in primitive plant.")]
            public GameObject grownPrefab;
            public float bloomSize = 0.16f;
        }

        [Header("Garden")]
        public List<GardenPlot> plots = new List<GardenPlot>();
        public SeedType[] seeds =
        {
            new SeedType { displayName = "Daisy", bloomColor = new Color(1f, 0.97f, 0.9f), growMinutes = 5f },
            new SeedType { displayName = "Tulip", bloomColor = new Color(0.96f, 0.5f, 0.62f), growMinutes = 15f },
            new SeedType { displayName = "Tomato", bloomColor = new Color(0.9f, 0.25f, 0.2f), growMinutes = 25f, bloomSize = 0.14f },
            new SeedType { displayName = "Sunflower", bloomColor = new Color(1f, 0.82f, 0.25f), growMinutes = 50f, bloomSize = 0.24f },
            new SeedType { displayName = "Moonflower", bloomColor = new Color(0.75f, 0.85f, 1f), growMinutes = 90f, costKey = "rare_seeds", bloomSize = 0.2f },
        };
        [Range(0.2f, 1f)] public float waterLastsFraction = 0.55f;
        public float wateringHoldSeconds = 1.2f;
        [Tooltip("e.g. a URP/Lit material - used for the placeholder plants.")]
        public Material plantMaterialTemplate;

        [Header("Audio")]
        public AudioSource sfxSource;
        [Tooltip("Looping AudioSource with a soft water-pour clip.")]
        public AudioSource wateringLoopSource;
        public AudioClip plantClip;
        public AudioClip harvestClip;

        int selectedSeed;
        GardenPlot hoveredPlot;
        float wateringProgress;
        Camera viewCamera;

        void Reset()
        {
            displayName = "Garden";
            enterHint = "Plant something now - it grows while you work.";
            cameraDistance = 7f;
            cameraPitch = 45f;
        }

        void Awake()
        {
            for (int i = 0; i < plots.Count; i++)
            {
                if (plots[i])
                {
                    plots[i].Initialize(this, i);
                }
            }
        }

        void Update()
        {
            if (!InputReady)
            {
                hoveredPlot = null;
                SetWateringSound(false);
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

            hoveredPlot = RaycastPlot();
            bool watering = false;
            if (hoveredPlot)
            {
                switch (hoveredPlot.CurrentStage)
                {
                    case GardenPlot.Stage.Empty:
                        if (CozyInput.PrimaryPressed)
                        {
                            TryPlant(hoveredPlot);
                        }
                        break;

                    case GardenPlot.Stage.Thirsty:
                        if (CozyInput.PrimaryHeld)
                        {
                            watering = true;
                            wateringProgress += Time.deltaTime / wateringHoldSeconds;
                            if (wateringProgress >= 1f)
                            {
                                hoveredPlot.Water(waterLastsFraction);
                                wateringProgress = 0f;
                            }
                        }
                        break;

                    case GardenPlot.Stage.Bloomed:
                        if (CozyInput.PrimaryPressed)
                        {
                            Harvest(hoveredPlot);
                        }
                        break;
                }
            }
            if (!watering)
            {
                wateringProgress = Mathf.MoveTowards(wateringProgress, 0f, Time.deltaTime);
            }
            SetWateringSound(watering);
        }

        protected override void OnExit()
        {
            SetWateringSound(false);
            wateringProgress = 0f;
        }

        void TryPlant(GardenPlot plot)
        {
            var seed = seeds[selectedSeed];
            if (!string.IsNullOrEmpty(seed.costKey) && !CozyProgress.TrySpend(seed.costKey))
            {
                CozyGui.Toast($"No {seed.displayName} seeds yet - finish a focus session (F) to earn one.", 5f);
                return;
            }
            plot.Plant(selectedSeed);
            PlayClip(sfxSource, plantClip);
        }

        void Harvest(GardenPlot plot)
        {
            var seed = plot.Harvest();
            if (seed == null)
            {
                return;
            }
            CozyProgress.Add("harvest");
            CozyProgress.Add("harvest_" + seed.displayName);
            PlayClip(sfxSource, harvestClip);
            CozyGui.Toast($"Harvested a {seed.displayName}! ({CozyProgress.Get("harvest_" + seed.displayName)} so far)", 4f);
        }

        GardenPlot RaycastPlot()
        {
            if (!viewCamera)
            {
                viewCamera = Camera.main;
            }
            if (!viewCamera)
            {
                return null;
            }
            Ray ray = CozyInput.PointerRay(viewCamera);
            if (Physics.Raycast(ray, out RaycastHit hit, 150f, ~0, QueryTriggerInteraction.Ignore))
            {
                return hit.collider.GetComponentInParent<GardenPlot>();
            }
            return null;
        }

        void SetWateringSound(bool on)
        {
            if (!wateringLoopSource)
            {
                return;
            }
            if (on && !wateringLoopSource.isPlaying)
            {
                wateringLoopSource.loop = true;
                wateringLoopSource.Play();
            }
            else if (!on && wateringLoopSource.isPlaying)
            {
                wateringLoopSource.Stop();
            }
        }

        public override void DrawHud()
        {
            var seed = seeds[selectedSeed];
            string cost = string.IsNullOrEmpty(seed.costKey) ? "free" : $"{CozyProgress.Get(seed.costKey)} in pouch";
            const float width = 440f;
            var rect = new Rect((Screen.width - width) * 0.5f, Screen.height - 96f, width, 60f);
            CozyGui.PanelBox(rect);
            CozyGui.Label(new Rect(rect.x, rect.y + 6f, width, 26f), $"Q  <   {seed.displayName}   >  E", 20);
            CozyGui.Label(new Rect(rect.x, rect.y + 32f, width, 22f), $"{FormatMinutes(seed.growMinutes)} to bloom  ·  {cost}", 14);

            int thirsty = 0;
            foreach (var plot in plots)
            {
                if (plot && plot.CurrentStage == GardenPlot.Stage.Thirsty)
                {
                    thirsty++;
                }
            }
            if (thirsty > 0)
            {
                CozyGui.Label(new Rect(0f, Screen.height - 128f, Screen.width, 26f),
                    thirsty == 1 ? "1 plant is thirsty" : $"{thirsty} plants are thirsty", 15);
            }

            if (hoveredPlot)
            {
                CozyGui.Tooltip(StatusText(hoveredPlot));
                if (wateringProgress > 0.01f)
                {
                    Vector2 pointer = CozyGui.PointerGui;
                    CozyGui.Bar(new Rect(pointer.x + 18f, pointer.y + 44f, 130f, 10f), wateringProgress, CozyGui.Sage);
                }
            }
        }

        string StatusText(GardenPlot plot)
        {
            var seed = plot.Seed;
            switch (plot.CurrentStage)
            {
                case GardenPlot.Stage.Empty:
                    return $"Click to plant {seeds[selectedSeed].displayName}";
                case GardenPlot.Stage.Thirsty:
                    return plot.Growth01 < 0.01f ? "Hold to water the seed" : $"{seed.displayName} is thirsty - hold to water";
                case GardenPlot.Stage.Growing:
                    return $"{seed.displayName}  ·  {plot.Growth01 * 100f:0}%  ·  ~{FormatMinutes(plot.MinutesLeft)} left";
                default:
                    return $"Click to harvest the {seed.displayName}";
            }
        }

        static string FormatMinutes(float minutes)
        {
            return minutes < 60f ? $"{Mathf.Max(1f, minutes):0} min" : $"{minutes / 60f:0.#} h";
        }
    }
}
