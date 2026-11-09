using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Placeholder plant (stem, two leaves, bloom, thirsty water-drop) + a click box.
    /// Shared by the personal garden (GardenPlot) and village homesteads (VillagePlot).
    /// </summary>
    public class PlantVisual
    {
        public Transform Root { get; }

        readonly Transform plantParts;
        readonly Transform stem;
        readonly Transform leafLeft;
        readonly Transform leafRight;
        readonly Transform bloom;
        readonly Transform waterDrop;
        readonly Material template;
        readonly float swayPhase;

        GameObject prefabInstance;
        bool hasPlant;
        float bloomSize;
        float droop;

        public PlantVisual(Transform parent, Material template, Vector3 clickBoxSize, float swayPhase)
        {
            this.template = template;
            this.swayPhase = swayPhase;

            Root = new GameObject("PlantVisual").transform;
            Root.SetParent(parent, false);
            Root.rotation = Quaternion.identity;   // world-aligned even if the marker imported rotated
            var box = Root.gameObject.AddComponent<BoxCollider>();
            box.size = clickBoxSize;
            box.center = new Vector3(0f, clickBoxSize.y * 0.5f, 0f);

            plantParts = new GameObject("Plant").transform;
            plantParts.SetParent(Root, false);

            var stemColor = new Color(0.36f, 0.6f, 0.3f);
            var leafColor = new Color(0.47f, 0.74f, 0.4f);
            stem = CozyVisuals.Part(PrimitiveType.Cylinder, plantParts, Vector3.zero, Vector3.one * 0.01f, stemColor, template);
            leafLeft = CozyVisuals.Part(PrimitiveType.Sphere, plantParts, Vector3.zero, Vector3.one * 0.01f, leafColor, template);
            leafRight = CozyVisuals.Part(PrimitiveType.Sphere, plantParts, Vector3.zero, Vector3.one * 0.01f, leafColor, template);
            bloom = CozyVisuals.Part(PrimitiveType.Sphere, plantParts, Vector3.zero, Vector3.zero, Color.white, template);
            waterDrop = CozyVisuals.Part(PrimitiveType.Sphere, Root, new Vector3(0f, 0.7f, 0f),
                new Vector3(0.07f, 0.09f, 0.07f), new Color(0.45f, 0.72f, 1f), template);
            SetPlant(false, Color.white, 0f, null);
        }

        public void SetPlant(bool plant, Color bloomColor, float size, GameObject grownPrefab)
        {
            hasPlant = plant;
            bloomSize = size;
            if (prefabInstance)
            {
                Object.Destroy(prefabInstance);
            }
            prefabInstance = null;

            bool usePrefab = plant && grownPrefab;
            if (usePrefab)
            {
                prefabInstance = Object.Instantiate(grownPrefab, plantParts);
                prefabInstance.transform.localPosition = Vector3.zero;
            }

            bool usePrimitives = plant && !usePrefab;
            stem.gameObject.SetActive(usePrimitives);
            leafLeft.gameObject.SetActive(usePrimitives);
            leafRight.gameObject.SetActive(usePrimitives);
            bloom.gameObject.SetActive(usePrimitives);
            if (usePrimitives)
            {
                bloom.GetComponent<Renderer>().sharedMaterial = CozyVisuals.MaterialFor(bloomColor, template);
            }
        }

        public void Update(float growth, bool thirsty)
        {
            waterDrop.gameObject.SetActive(hasPlant && thirsty);
            if (hasPlant && thirsty)
            {
                waterDrop.localPosition = new Vector3(0f, 0.7f + Mathf.Sin(Time.time * 3f) * 0.04f, 0f);
            }
            if (!hasPlant)
            {
                return;
            }

            float eased = growth * growth * (3f - 2f * growth);
            droop = Mathf.Lerp(droop, thirsty && growth > 0.01f ? 18f : 0f, Time.deltaTime * 3f);
            float sway = Mathf.Sin(Time.time * 1.3f + swayPhase) * 3f * eased;
            plantParts.localRotation = Quaternion.Euler(0f, 0f, droop + sway);

            if (prefabInstance)
            {
                prefabInstance.transform.localScale = Vector3.one * Mathf.Lerp(0.15f, 1f, eased);
                return;
            }

            float height = Mathf.Lerp(0.03f, 0.45f, eased);
            stem.localScale = new Vector3(0.03f, height * 0.5f, 0.03f);
            stem.localPosition = new Vector3(0f, height * 0.5f, 0f);

            float leaf = Mathf.Lerp(0.02f, 0.16f, eased);
            var leafScale = new Vector3(leaf, leaf * 0.35f, leaf * 0.6f);
            leafLeft.localScale = leafScale;
            leafRight.localScale = leafScale;
            leafLeft.localPosition = new Vector3(-leaf * 0.45f, height * 0.45f, 0f);
            leafRight.localPosition = new Vector3(leaf * 0.45f, height * 0.6f, 0f);

            float currentBloom = bloomSize * Mathf.Clamp01((growth - 0.75f) / 0.25f);
            bloom.gameObject.SetActive(currentBloom > 0.001f);
            bloom.localScale = Vector3.one * currentBloom;
            bloom.localPosition = new Vector3(0f, height + currentBloom * 0.3f, 0f);
        }
    }
}
