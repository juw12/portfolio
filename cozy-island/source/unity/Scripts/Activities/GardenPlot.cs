using System;
using System.Globalization;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// One planting spot. Growth uses real UTC time, so plants keep growing while you work
    /// (even while the game is closed). Water at planting and again about halfway.
    /// Plants never die - a thirsty plant just pauses until you water it.
    /// </summary>
    public class GardenPlot : MonoBehaviour
    {
        public enum Stage { Empty, Thirsty, Growing, Bloomed }

        [Tooltip("Save id. Defaults to the GameObject name.")]
        public string plotId;
        public Vector3 clickBoxSize = new Vector3(0.8f, 0.5f, 0.6f);

        public Stage CurrentStage { get; private set; }

        public GardenActivity.SeedType Seed =>
            garden && seedIndex >= 0 && seedIndex < garden.seeds.Length ? garden.seeds[seedIndex] : null;

        public float Growth01 => Seed == null ? 0f : Mathf.Clamp01((float)(grownSeconds / TotalSeconds));

        public float MinutesLeft => Seed == null ? 0f : Mathf.Max(0f, (float)((TotalSeconds - grownSeconds) / 60.0));

        double TotalSeconds => Math.Max(1.0, Seed.growMinutes * 60.0);

        static long NowTicks => DateTime.UtcNow.Ticks;

        string SaveKey => "garden." + plotId;

        GardenActivity garden;
        int seedIndex = -1;
        double grownSeconds;
        long lastTickUtc;
        long waterEndsUtc;
        float swayPhase;
        PlantVisual visual;

        public void Initialize(GardenActivity owner, int index)
        {
            garden = owner;
            swayPhase = index * 1.7f;
            if (string.IsNullOrEmpty(plotId))
            {
                plotId = $"{name}_{index}";
            }
            visual = new PlantVisual(transform, garden.plantMaterialTemplate, clickBoxSize, swayPhase);
            Load();
            Tick();
            RebuildPlantVisual();
        }

        void Update()
        {
            if (!garden)
            {
                return;
            }
            Tick();
            UpdateVisual();
        }

        void Tick()
        {
            if (Seed == null)
            {
                CurrentStage = Stage.Empty;
                return;
            }
            long now = NowTicks;
            long growEnd = Math.Min(now, waterEndsUtc);
            if (growEnd > lastTickUtc)
            {
                grownSeconds += (growEnd - lastTickUtc) / (double)TimeSpan.TicksPerSecond;
            }
            lastTickUtc = now;

            if (grownSeconds >= TotalSeconds)
            {
                CurrentStage = Stage.Bloomed;
            }
            else if (now >= waterEndsUtc)
            {
                CurrentStage = Stage.Thirsty;
            }
            else
            {
                CurrentStage = Stage.Growing;
            }
        }

        public void Plant(int index)
        {
            seedIndex = index;
            grownSeconds = 0.0;
            lastTickUtc = NowTicks;
            waterEndsUtc = 0;
            Tick();
            RebuildPlantVisual();
            Save();
        }

        public void Water(float lastsFraction)
        {
            Tick();
            long now = NowTicks;
            lastTickUtc = now;
            waterEndsUtc = now + (long)(TotalSeconds * lastsFraction * TimeSpan.TicksPerSecond);
            Tick();
            Save();
        }

        public GardenActivity.SeedType Harvest()
        {
            var harvested = Seed;
            seedIndex = -1;
            grownSeconds = 0.0;
            waterEndsUtc = 0;
            Tick();
            RebuildPlantVisual();
            Save();
            return harvested;
        }

        // ------------------------------------------------------------------ save / load

        void Save()
        {
            string data = string.Join("|",
                seedIndex.ToString(CultureInfo.InvariantCulture),
                grownSeconds.ToString("R", CultureInfo.InvariantCulture),
                lastTickUtc.ToString(CultureInfo.InvariantCulture),
                waterEndsUtc.ToString(CultureInfo.InvariantCulture));
            CozyProgress.SetText(SaveKey, data);
        }

        void Load()
        {
            string[] parts = CozyProgress.GetText(SaveKey).Split('|');
            if (parts.Length != 4)
            {
                return;
            }
            bool ok = int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out int loadedSeed)
                & double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out double loadedGrown)
                & long.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out long loadedTick)
                & long.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out long loadedWater);
            if (!ok || loadedSeed >= garden.seeds.Length)
            {
                return;
            }
            seedIndex = loadedSeed;
            grownSeconds = loadedGrown;
            lastTickUtc = loadedTick;
            waterEndsUtc = loadedWater;
        }

        void OnApplicationPause(bool paused)
        {
            if (paused && garden)
            {
                Tick();
                Save();
            }
        }

        void OnApplicationQuit()
        {
            if (garden)
            {
                Tick();
                Save();
            }
        }

        // ------------------------------------------------------------------ visuals

        void RebuildPlantVisual()
        {
            var seed = Seed;
            visual.SetPlant(seed != null, seed != null ? seed.bloomColor : Color.white,
                seed != null ? seed.bloomSize : 0f, seed != null ? seed.grownPrefab : null);
        }

        void UpdateVisual()
        {
            visual.Update(Growth01, CurrentStage == Stage.Thirsty);
        }
    }
}
