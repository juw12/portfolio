using System;
using System.Collections.Generic;
using UnityEngine;
using Random = UnityEngine.Random;

namespace CozyFishing
{
    /// <summary>
    /// Birds visit the feeder and fence posts. While birdwatching, click a bird to photograph it
    /// and fill your bird journal (J). Rare visitors are worth waiting for.
    /// </summary>
    public class BirdwatchActivity : CozyActivity
    {
        [Serializable]
        public class BirdSpecies
        {
            public string displayName = "Robin";
            public Color bodyColor = new Color(0.55f, 0.42f, 0.32f);
            public Color accentColor = new Color(0.95f, 0.5f, 0.25f);
            [Min(0.01f)] public float rarityWeight = 5f;
            public float size = 1f;
            public Vector2 staySeconds = new Vector2(15f, 35f);
            public AudioClip[] songs;
            [Tooltip("Optional real model; empty = primitive placeholder bird.")]
            public GameObject prefab;
        }

        [Header("Birds")]
        public List<Transform> perches = new List<Transform>();
        public BirdSpecies[] species =
        {
            new BirdSpecies { displayName = "Sparrow", bodyColor = new Color(0.58f, 0.45f, 0.33f), accentColor = new Color(0.86f, 0.78f, 0.65f), rarityWeight = 8f, size = 0.9f },
            new BirdSpecies { displayName = "Robin", bodyColor = new Color(0.5f, 0.4f, 0.32f), accentColor = new Color(0.95f, 0.5f, 0.25f), rarityWeight = 6f },
            new BirdSpecies { displayName = "Blue Tit", bodyColor = new Color(0.35f, 0.55f, 0.85f), accentColor = new Color(1f, 0.88f, 0.35f), rarityWeight = 5f, size = 0.85f },
            new BirdSpecies { displayName = "Goldfinch", bodyColor = new Color(1f, 0.85f, 0.25f), accentColor = new Color(0.15f, 0.12f, 0.12f), rarityWeight = 3f, size = 0.85f },
            new BirdSpecies { displayName = "Cardinal", bodyColor = new Color(0.85f, 0.15f, 0.15f), accentColor = new Color(0.55f, 0.08f, 0.1f), rarityWeight = 2f, size = 1.1f },
            new BirdSpecies { displayName = "Kingfisher", bodyColor = new Color(0.1f, 0.6f, 0.75f), accentColor = new Color(0.95f, 0.55f, 0.2f), rarityWeight = 0.5f, size = 1f },
        };
        public Vector2 spawnIntervalSeconds = new Vector2(4f, 12f);
        public int maxBirds = 4;
        public float spawnDistance = 18f;
        [Tooltip("Birds keep visiting while you do other things.")]
        public bool visitWhileInactive = true;
        [Tooltip("e.g. a URP/Lit material - used for placeholder birds.")]
        public Material birdMaterialTemplate;

        [Header("Audio")]
        public AudioSource sfxSource;
        public AudioClip shutterClip;

        readonly List<BirdVisitor> birds = new List<BirdVisitor>();
        float nextSpawn;
        float flashAlpha;
        bool showJournal;
        BirdVisitor hovered;
        Camera viewCamera;

        void Reset()
        {
            displayName = "Birdwatching";
            enterHint = "Sit still... click a bird to take its photo. J opens your bird journal.";
            cameraDistance = 5f;
            cameraPitch = 15f;
        }

        void Start()
        {
            viewCamera = Camera.main;
            nextSpawn = Time.time + 2f;
        }

        void Update()
        {
            if ((IsActive || visitWhileInactive) && Time.time >= nextSpawn)
            {
                TrySpawn();
                nextSpawn = Time.time + Random.Range(spawnIntervalSeconds.x, spawnIntervalSeconds.y);
            }
            flashAlpha = Mathf.MoveTowards(flashAlpha, 0f, Time.deltaTime * 3f);

            if (!InputReady)
            {
                hovered = null;
                return;
            }
            if (CozyInput.JournalPressed)
            {
                showJournal = !showJournal;
            }
            hovered = RaycastBird();
            if (hovered && CozyInput.PrimaryPressed)
            {
                Photograph(hovered);
            }
        }

        protected override void OnExit()
        {
            showJournal = false;
        }

        void TrySpawn()
        {
            birds.RemoveAll(bird => bird == null);
            if (birds.Count >= maxBirds || perches.Count == 0 || species.Length == 0)
            {
                return;
            }
            var freePerches = perches.FindAll(perch => perch && !PerchTaken(perch));
            if (freePerches.Count == 0)
            {
                return;
            }

            var perchChoice = freePerches[Random.Range(0, freePerches.Count)];
            var kind = PickSpecies();
            Vector2 direction = Random.insideUnitCircle.normalized;
            Vector3 spawnPoint = perchChoice.position + new Vector3(direction.x, 0f, direction.y) * spawnDistance + Vector3.up * 6f;

            var birdObject = new GameObject($"Bird_{kind.displayName}");
            var bird = birdObject.AddComponent<BirdVisitor>();
            bird.Initialize(kind, perchChoice, spawnPoint, birdMaterialTemplate);
            bird.Departed += visitor => birds.Remove(visitor);
            birds.Add(bird);
        }

        bool PerchTaken(Transform perch)
        {
            foreach (var bird in birds)
            {
                if (bird && bird.Perch == perch && bird.CurrentMode != BirdVisitor.Mode.FlyingOut)
                {
                    return true;
                }
            }
            return false;
        }

        BirdSpecies PickSpecies()
        {
            float total = 0f;
            foreach (var kind in species)
            {
                total += kind.rarityWeight;
            }
            float roll = Random.value * total;
            foreach (var kind in species)
            {
                roll -= kind.rarityWeight;
                if (roll <= 0f)
                {
                    return kind;
                }
            }
            return species[species.Length - 1];
        }

        BirdVisitor RaycastBird()
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
                return hit.collider.GetComponentInParent<BirdVisitor>();
            }
            return null;
        }

        void Photograph(BirdVisitor bird)
        {
            PlayClip(sfxSource, shutterClip, 1f, 0.03f);
            flashAlpha = 0.8f;
            string key = "bird_" + bird.Species.displayName;
            bool firstTime = CozyProgress.Get(key) == 0;
            CozyProgress.Add(key);
            CozyProgress.Add("photos");
            if (firstTime)
            {
                CozyGui.Toast($"New species! {bird.Species.displayName} added to your journal ({SpeciesSeen()}/{species.Length})", 5f);
            }
            else
            {
                CozyGui.Toast($"Lovely shot of a {bird.Species.displayName}.", 3f);
            }
        }

        int SpeciesSeen()
        {
            int seen = 0;
            foreach (var kind in species)
            {
                if (CozyProgress.Get("bird_" + kind.displayName) > 0)
                {
                    seen++;
                }
            }
            return seen;
        }

        public override void DrawHud()
        {
            if (flashAlpha > 0f)
            {
                Color previous = GUI.color;
                GUI.color = new Color(1f, 1f, 1f, flashAlpha);
                GUI.DrawTexture(new Rect(0f, 0f, Screen.width, Screen.height), Texture2D.whiteTexture);
                GUI.color = previous;
            }

            CozyGui.Label(new Rect(0f, Screen.height - 90f, Screen.width, 26f),
                $"Click a bird to photograph  ·  J journal ({SpeciesSeen()}/{species.Length})", 15);

            if (hovered)
            {
                CozyGui.Tooltip(hovered.Species.displayName);
            }
            if (showJournal)
            {
                DrawJournal();
            }
        }

        void DrawJournal()
        {
            const float lineHeight = 26f;
            const float width = 340f;
            float height = 60f + species.Length * lineHeight;
            var rect = new Rect(Screen.width - width - 20f, 70f, width, height);
            CozyGui.PanelBox(rect);
            CozyGui.Label(new Rect(rect.x, rect.y + 8f, width, 30f), $"Bird journal  {SpeciesSeen()}/{species.Length}", 20);
            float y = rect.y + 44f;
            foreach (var kind in species)
            {
                int photos = CozyProgress.Get("bird_" + kind.displayName);
                string line = photos > 0 ? $"{kind.displayName}  ·  {photos} photo{(photos == 1 ? "" : "s")}" : "? ? ?";
                CozyGui.Label(new Rect(rect.x + 24f, y, width - 48f, lineHeight), line, 16, TextAnchor.MiddleLeft);
                y += lineHeight;
            }
        }
    }
}
