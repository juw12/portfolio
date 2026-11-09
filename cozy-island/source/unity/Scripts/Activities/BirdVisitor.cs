using System;
using UnityEngine;
using Random = UnityEngine.Random;

namespace CozyFishing
{
    /// <summary>A bird that flies in, perches (hops, pecks, looks around, sings) and flies away.</summary>
    public class BirdVisitor : MonoBehaviour
    {
        public enum Mode { FlyingIn, Perched, FlyingOut }

        public BirdwatchActivity.BirdSpecies Species { get; private set; }
        public Transform Perch { get; private set; }
        public Mode CurrentMode { get; private set; }

        public event Action<BirdVisitor> Departed;

        Vector3 flightFrom;
        Vector3 flightTo;
        Vector3 flightControl;
        float flightT;
        float flightDuration;
        float stayUntil;
        float nextIdleAction;
        float nextSong;
        float actionTime;
        int action = -1;
        float yaw;
        float targetYaw;
        Transform wingLeft;
        Transform wingRight;
        AudioSource voice;

        public void Initialize(BirdwatchActivity.BirdSpecies species, Transform perch, Vector3 spawnPoint, Material template)
        {
            Species = species;
            Perch = perch;
            transform.position = spawnPoint;
            BuildModel(template);

            var sphere = gameObject.AddComponent<SphereCollider>();
            sphere.radius = 0.25f * species.size;
            sphere.center = new Vector3(0f, 0.12f * species.size, 0f);

            voice = gameObject.AddComponent<AudioSource>();
            voice.playOnAwake = false;
            voice.spatialBlend = 1f;
            voice.rolloffMode = AudioRolloffMode.Logarithmic;
            voice.minDistance = 2f;
            voice.maxDistance = 30f;
            voice.dopplerLevel = 0f;

            StartFlight(spawnPoint, perch.position, Mode.FlyingIn);
        }

        void Update()
        {
            if (CurrentMode == Mode.Perched)
            {
                UpdatePerched();
            }
            else
            {
                UpdateFlight();
            }

            if (wingLeft)
            {
                float flap = CurrentMode == Mode.Perched ? 72f : Mathf.Sin(Time.time * 26f) * 55f;
                wingLeft.localRotation = Quaternion.Euler(0f, 0f, flap);
                wingRight.localRotation = Quaternion.Euler(0f, 0f, -flap);
            }
        }

        // ------------------------------------------------------------------ flight

        void StartFlight(Vector3 from, Vector3 to, Mode mode)
        {
            CurrentMode = mode;
            flightFrom = from;
            flightTo = to;
            flightT = 0f;
            float distance = Vector3.Distance(from, to);
            flightDuration = Mathf.Clamp(distance / 6f, 1.2f, 4f);
            flightControl = (from + to) * 0.5f + Vector3.up * Mathf.Max(1.5f, distance * 0.25f);
        }

        Vector3 Bezier(float t)
        {
            float u = 1f - t;
            return u * u * flightFrom + 2f * u * t * flightControl + t * t * flightTo;
        }

        void UpdateFlight()
        {
            flightT += Time.deltaTime / flightDuration;
            float t = Mathf.Clamp01(flightT);
            float eased = CurrentMode == Mode.FlyingIn ? 1f - (1f - t) * (1f - t) : t * t;
            Vector3 position = Bezier(eased);
            Vector3 ahead = Bezier(Mathf.Min(1f, eased + 0.02f)) - position;
            ahead.y = 0f;
            if (ahead.sqrMagnitude > 1e-6f)
            {
                yaw = Mathf.Atan2(ahead.x, ahead.z) * Mathf.Rad2Deg;
                targetYaw = yaw;
            }
            transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));

            if (t < 1f)
            {
                return;
            }
            if (CurrentMode == Mode.FlyingIn)
            {
                Land();
            }
            else
            {
                Departed?.Invoke(this);
                Destroy(gameObject);
            }
        }

        void Land()
        {
            CurrentMode = Mode.Perched;
            stayUntil = Time.time + Random.Range(Species.staySeconds.x, Species.staySeconds.y);
            nextIdleAction = Time.time + Random.Range(1f, 3f);
            nextSong = Time.time + Random.Range(0.5f, 3f);
        }

        public void FlyAway()
        {
            if (CurrentMode == Mode.FlyingOut)
            {
                return;
            }
            Vector2 direction = Random.insideUnitCircle.normalized;
            Vector3 destination = transform.position + new Vector3(direction.x, 0f, direction.y) * 20f + Vector3.up * 8f;
            StartFlight(transform.position, destination, Mode.FlyingOut);
        }

        // ------------------------------------------------------------------ perched life

        void UpdatePerched()
        {
            float dt = Time.deltaTime;
            if (Time.time >= nextIdleAction)
            {
                action = Random.Range(0, 3);   // 0 hop + turn, 1 peck, 2 look around
                actionTime = 0f;
                if (action != 1)
                {
                    targetYaw += Random.Range(-70f, 70f);
                }
                nextIdleAction = Time.time + Random.Range(1.5f, 4f);
            }
            actionTime += dt;

            float hop = action == 0 && actionTime < 0.3f ? Mathf.Sin(actionTime / 0.3f * Mathf.PI) * 0.06f : 0f;
            float peck = action == 1 && actionTime < 0.5f ? Mathf.Sin(actionTime / 0.5f * Mathf.PI) * 35f : 0f;
            yaw = Mathf.LerpAngle(yaw, targetYaw, dt * 8f);
            transform.SetPositionAndRotation(Perch.position + Vector3.up * hop, Quaternion.Euler(peck, yaw, 0f));

            if (Species.songs != null && Species.songs.Length > 0 && Time.time >= nextSong)
            {
                var song = Species.songs[Random.Range(0, Species.songs.Length)];
                if (song)
                {
                    voice.pitch = Random.Range(0.95f, 1.05f);
                    voice.PlayOneShot(song);
                }
                nextSong = Time.time + Random.Range(4f, 10f);
            }

            if (Time.time >= stayUntil)
            {
                FlyAway();
            }
        }

        // ------------------------------------------------------------------ placeholder model

        void BuildModel(Material template)
        {
            var model = new GameObject("Model").transform;
            model.SetParent(transform, false);
            model.localScale = Vector3.one * Species.size;
            if (Species.prefab)
            {
                Instantiate(Species.prefab, model, false);
                return;
            }

            Color body = Species.bodyColor;
            Color accent = Species.accentColor;
            var beak = new Color(0.95f, 0.65f, 0.25f);
            var dark = new Color(0.12f, 0.1f, 0.1f);

            CozyVisuals.Part(PrimitiveType.Sphere, model, new Vector3(0f, 0.1f, 0f), new Vector3(0.16f, 0.15f, 0.22f), body, template);
            CozyVisuals.Part(PrimitiveType.Sphere, model, new Vector3(0f, 0.08f, 0.06f), new Vector3(0.13f, 0.11f, 0.15f), accent, template);
            CozyVisuals.Part(PrimitiveType.Sphere, model, new Vector3(0f, 0.19f, 0.08f), Vector3.one * 0.11f, body, template);
            CozyVisuals.Part(PrimitiveType.Cube, model, new Vector3(0f, 0.185f, 0.15f), new Vector3(0.025f, 0.025f, 0.06f), beak, template);
            CozyVisuals.Part(PrimitiveType.Sphere, model, new Vector3(-0.04f, 0.205f, 0.12f), Vector3.one * 0.018f, dark, template);
            CozyVisuals.Part(PrimitiveType.Sphere, model, new Vector3(0.04f, 0.205f, 0.12f), Vector3.one * 0.018f, dark, template);
            CozyVisuals.Part(PrimitiveType.Cube, model, new Vector3(0f, 0.12f, -0.15f), new Vector3(0.08f, 0.02f, 0.12f),
                accent, template, Quaternion.Euler(20f, 0f, 0f));
            CozyVisuals.Part(PrimitiveType.Cube, model, new Vector3(-0.03f, 0.025f, 0f), new Vector3(0.01f, 0.05f, 0.01f), dark, template);
            CozyVisuals.Part(PrimitiveType.Cube, model, new Vector3(0.03f, 0.025f, 0f), new Vector3(0.01f, 0.05f, 0.01f), dark, template);

            wingLeft = WingPivot(model, -1f, accent, template);
            wingRight = WingPivot(model, 1f, accent, template);
        }

        static Transform WingPivot(Transform parent, float side, Color color, Material template)
        {
            var pivot = new GameObject(side < 0f ? "WingL" : "WingR").transform;
            pivot.SetParent(parent, false);
            pivot.localPosition = new Vector3(0.07f * side, 0.13f, 0f);
            CozyVisuals.Part(PrimitiveType.Cube, pivot, new Vector3(0.06f * side, 0f, -0.01f), new Vector3(0.12f, 0.02f, 0.15f), color, template);
            return pivot;
        }
    }
}
