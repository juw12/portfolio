using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Audio;
using Random = UnityEngine.Random;

namespace CozyFishing
{
    [Serializable]
    public class AmbientLoop
    {
        public string label = "Water lapping";
        public AudioClip clip;
        [Range(0f, 1f)] public float baseVolume = 0.5f;
        [Range(0f, 1f)] public float volumeVariation = 0.25f;
        [Tooltip("How fast the volume slowly 'breathes'. 0.03-0.1 feels natural.")]
        public float variationSpeed = 0.05f;
        [NonSerialized] public AudioSource source;
        [NonSerialized] public float seed;
    }

    [Serializable]
    public class RandomOneShot
    {
        public string label = "Birds";
        public AudioClip[] clips;
        public Vector2 intervalSeconds = new Vector2(8f, 25f);
        [Range(0f, 1f)] public float volume = 0.5f;
        public Vector2 pitchRange = new Vector2(0.92f, 1.08f);
        public Vector2 distanceRange = new Vector2(6f, 20f);
        public Vector2 heightRange = new Vector2(0f, 4f);
        [NonSerialized] public float nextTime;
    }

    /// <summary>
    /// ASMR ambience: layered 2D loops whose volumes drift slowly (never static),
    /// plus randomized 3D one-shots (birds, frogs, wood creaks, wind chimes) placed around the listener.
    /// </summary>
    public class AmbientSoundscape : MonoBehaviour
    {
        [Range(0f, 1f)] public float masterVolume = 1f;
        public float fadeInSeconds = 4f;
        public AudioMixerGroup outputGroup;
        [Tooltip("Defaults to the main camera.")]
        public Transform listener;
        public List<AmbientLoop> loops = new List<AmbientLoop>();
        public List<RandomOneShot> oneShots = new List<RandomOneShot>();
        public int voicePoolSize = 8;
        public float spatialMaxDistance = 45f;

        readonly List<AudioSource> voices = new List<AudioSource>();
        float startTime;

        void Start()
        {
            if (!listener)
            {
                listener = Camera.main ? Camera.main.transform : transform;
            }
            startTime = Time.time;

            foreach (var loop in loops)
            {
                if (!loop.clip)
                {
                    continue;
                }
                var source = gameObject.AddComponent<AudioSource>();
                source.clip = loop.clip;
                source.loop = true;
                source.playOnAwake = false;
                source.spatialBlend = 0f;
                source.volume = 0f;
                source.outputAudioMixerGroup = outputGroup;
                source.Play();
                source.time = Random.Range(0f, loop.clip.length * 0.9f);  // desync layers
                loop.source = source;
                loop.seed = Random.value * 100f;
            }

            for (int i = 0; i < voicePoolSize; i++)
            {
                var voiceObject = new GameObject($"AmbientVoice_{i}");
                voiceObject.transform.SetParent(transform, false);
                var voice = voiceObject.AddComponent<AudioSource>();
                voice.playOnAwake = false;
                voice.spatialBlend = 1f;
                voice.rolloffMode = AudioRolloffMode.Logarithmic;
                voice.minDistance = 3f;
                voice.maxDistance = spatialMaxDistance;
                voice.dopplerLevel = 0f;
                voice.outputAudioMixerGroup = outputGroup;
                voices.Add(voice);
            }

            foreach (var shot in oneShots)
            {
                shot.nextTime = Time.time + Random.Range(1f, Mathf.Max(1f, shot.intervalSeconds.y));
            }
        }

        void Update()
        {
            float fade = fadeInSeconds > 0f ? Mathf.Clamp01((Time.time - startTime) / fadeInSeconds) : 1f;
            fade = fade * fade * (3f - 2f * fade);

            foreach (var loop in loops)
            {
                if (!loop.source)
                {
                    continue;
                }
                float drift = Mathf.PerlinNoise(Time.time * loop.variationSpeed, loop.seed) * 2f - 1f;
                float volume = loop.baseVolume * (1f + loop.volumeVariation * drift);
                loop.source.volume = Mathf.Clamp01(volume) * fade * masterVolume;
            }

            foreach (var shot in oneShots)
            {
                if (shot.clips == null || shot.clips.Length == 0 || Time.time < shot.nextTime)
                {
                    continue;
                }
                PlayOneShot(shot);
                shot.nextTime = Time.time + Random.Range(shot.intervalSeconds.x, shot.intervalSeconds.y);
            }
        }

        void PlayOneShot(RandomOneShot shot)
        {
            var clip = shot.clips[Random.Range(0, shot.clips.Length)];
            if (!clip)
            {
                return;
            }

            AudioSource voice = null;
            foreach (var candidate in voices)
            {
                if (!candidate.isPlaying)
                {
                    voice = candidate;
                    break;
                }
            }
            if (!voice)
            {
                return;  // all voices busy - skipping keeps the mix calm
            }

            Vector2 ring = Random.insideUnitCircle.normalized * Random.Range(shot.distanceRange.x, shot.distanceRange.y);
            float height = Random.Range(shot.heightRange.x, shot.heightRange.y);
            voice.transform.position = listener.position + new Vector3(ring.x, height, ring.y);
            voice.pitch = Random.Range(shot.pitchRange.x, shot.pitchRange.y);
            voice.volume = shot.volume * masterVolume;
            voice.clip = clip;
            voice.Play();
        }
    }
}
