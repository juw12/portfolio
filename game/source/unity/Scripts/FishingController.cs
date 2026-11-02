using System;
using System.Collections;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif
using Random = UnityEngine.Random;

namespace CozyFishing
{
    [Serializable]
    public class FishType
    {
        public string displayName = "Bluegill";
        [Min(0.01f)] public float rarityWeight = 5f;
        [Range(0f, 1f)] public float difficulty = 0.3f;
        public Vector2 weightRangeKg = new Vector2(0.2f, 0.8f);
    }

    /// <summary>
    /// Cozy fishing loop: cast -> wait (nibbles) -> bite -> tension reeling mini-game -> catch.
    /// Put this on the "Player" object. Casts go along this object's forward (blue arrow).
    /// Controls: Left mouse / Space / Gamepad South.
    /// </summary>
    public class FishingController : MonoBehaviour
    {
        public enum State { Idle, Casting, Waiting, Bite, Reeling, Result }

        [Header("Scene references")]
        [Tooltip("Rod tip - use the RodTip empty from the FBX.")]
        public Transform rodTip;
        public Transform bobber;
        public LineRenderer fishingLine;
        [Tooltip("Optional splash particles (Emit is called where the bobber lands / dips).")]
        public ParticleSystem splashFx;
        public float waterLevel = 0f;

        [Header("Casting")]
        public float minCastDistance = 3f;
        public float maxCastDistance = 7f;
        public float castDuration = 0.9f;
        public float castArcHeight = 2.5f;
        public float idleHangLength = 0.6f;

        [Header("Waiting for a bite")]
        public Vector2 waitBeforeNibblesSeconds = new Vector2(2f, 6f);
        public int maxNibbles = 3;
        public float biteWindowSeconds = 1.1f;

        [Header("Reeling mini-game")]
        public float reelSpeed = 0.22f;
        public float slackDrift = 0.04f;
        public float tensionRise = 0.55f;
        public float tensionFall = 0.9f;
        public float fishPull = 0.6f;

        [Header("Line look")]
        public int lineSegments = 24;
        public float slackSag = 0.6f;

        [Header("Fish table")]
        public FishType[] fishTypes =
        {
            new FishType { displayName = "Bluegill", rarityWeight = 6f, difficulty = 0.2f, weightRangeKg = new Vector2(0.1f, 0.5f) },
            new FishType { displayName = "Perch", rarityWeight = 4f, difficulty = 0.35f, weightRangeKg = new Vector2(0.2f, 1.0f) },
            new FishType { displayName = "Rainbow Trout", rarityWeight = 2f, difficulty = 0.55f, weightRangeKg = new Vector2(0.5f, 2.5f) },
            new FishType { displayName = "Golden Koi", rarityWeight = 0.4f, difficulty = 0.8f, weightRangeKg = new Vector2(1.5f, 4.0f) },
        };

        [Header("ASMR audio")]
        [Tooltip("3D AudioSource near the player for one-shots.")]
        public AudioSource sfxSource;
        [Tooltip("Looping AudioSource with a soft reel-click clip.")]
        public AudioSource reelLoopSource;
        public AudioClip castWhoosh;
        public AudioClip bobberPlop;
        public AudioClip nibbleTick;
        public AudioClip biteSplash;
        public AudioClip catchJingle;
        public AudioClip lineSnap;
        [Range(0f, 0.3f)] public float pitchJitter = 0.08f;

        public event Action<FishType, float> FishCaught;

        public State CurrentState => state;
        public int TotalCaught { get; private set; }

        const string IdleHint = "Click / Space to cast";

        State state = State.Idle;
        Coroutine routine;
        Vector3 castPoint;
        Vector3 reelStartPoint;
        float dipOffset;
        float progress;
        float tension;
        float noiseSeed;
        bool nibbling;
        FishType hookedFish;
        string message = IdleHint;
        GUIStyle hintStyle;
        GUIStyle counterStyle;
        int enabledFrame = -1;

        void OnEnable()
        {
            // Ignore the click that switched to fishing (ActivityHub enables us mid-frame).
            enabledFrame = Time.frameCount;
        }

        void OnDisable()
        {
            // Disabling a MonoBehaviour does not stop its coroutines - reset cleanly.
            StopAllCoroutines();
            routine = null;
            if (reelLoopSource)
            {
                reelLoopSource.Stop();
            }
            nibbling = false;
            state = State.Idle;
            message = IdleHint;
            if (rodTip && bobber)
            {
                bobber.position = HangPosition();
                UpdateLine();
            }
        }

        void Start()
        {
            if (!rodTip || !bobber)
            {
                Debug.LogWarning("FishingController: assign Rod Tip and Bobber.", this);
                enabled = false;
                return;
            }
            bobber.position = HangPosition();
            if (fishingLine)
            {
                fishingLine.positionCount = lineSegments + 1;
            }
        }

        void Update()
        {
            bool inputReady = Time.frameCount > enabledFrame;
            bool pressed = inputReady && ActionPressed();
            bool held = inputReady && ActionHeld();
            dipOffset = Mathf.Lerp(dipOffset, 0f, Time.deltaTime * 3f);

            switch (state)
            {
                case State.Idle:
                    MoveBobberToHang();
                    if (pressed)
                    {
                        routine = StartCoroutine(CastRoutine());
                    }
                    break;

                case State.Waiting:
                    FloatBobber(castPoint, 1f);
                    if (pressed)
                    {
                        Finish(nibbling ? "Too early! It was only nibbling." : "Reeled in... nothing yet.");
                    }
                    break;

                case State.Bite:
                    FloatBobber(castPoint, 3f);
                    if (pressed)
                    {
                        StartReeling();
                    }
                    break;

                case State.Reeling:
                    UpdateReeling(held);
                    break;

                case State.Result:
                    MoveBobberToHang();
                    break;
            }
        }

        // ------------------------------------------------------------------ states

        IEnumerator CastRoutine()
        {
            state = State.Casting;
            message = "";
            Play(castWhoosh);

            Vector3 forward = transform.forward;
            forward.y = 0f;
            forward.Normalize();
            float distance = Random.Range(minCastDistance, maxCastDistance);
            Vector3 start = bobber.position;
            castPoint = rodTip.position + forward * distance;
            castPoint.y = waterLevel;

            float t = 0f;
            while (t < 1f)
            {
                t = Mathf.Min(1f, t + Time.deltaTime / castDuration);
                Vector3 position = Vector3.Lerp(start, castPoint, t);
                position.y += Mathf.Sin(t * Mathf.PI) * castArcHeight;
                bobber.position = position;
                yield return null;
            }

            Play(bobberPlop);
            Splash(castPoint, 14);
            dipOffset = -0.12f;
            state = State.Waiting;
            message = "Waiting... (click to reel in)";
            routine = StartCoroutine(BiteRoutine());
        }

        IEnumerator BiteRoutine()
        {
            nibbling = false;
            yield return new WaitForSeconds(Random.Range(waitBeforeNibblesSeconds.x, waitBeforeNibblesSeconds.y));

            int nibbles = Random.Range(0, maxNibbles + 1);
            for (int i = 0; i < nibbles; i++)
            {
                nibbling = true;
                dipOffset = -0.05f;
                Play(nibbleTick, 0.6f);
                yield return new WaitForSeconds(Random.Range(0.7f, 1.8f));
            }

            nibbling = false;
            hookedFish = PickFish();
            state = State.Bite;
            dipOffset = -0.35f;
            Play(biteSplash);
            Splash(bobber.position, 20);
            message = "Bite! Click now!";

            yield return new WaitForSeconds(biteWindowSeconds);
            if (state == State.Bite)
            {
                Finish("It got away...");
            }
        }

        void StartReeling()
        {
            StopRoutine();
            state = State.Reeling;
            progress = 0.15f;
            tension = 0.2f;
            noiseSeed = Random.value * 100f;
            reelStartPoint = castPoint;
            message = "Hold to reel - let go when the line gets tight!";
            if (reelLoopSource)
            {
                reelLoopSource.loop = true;
                reelLoopSource.volume = 0f;
                if (!reelLoopSource.isPlaying)
                {
                    reelLoopSource.Play();
                }
            }
        }

        void UpdateReeling(bool held)
        {
            float dt = Time.deltaTime;
            float difficulty = hookedFish.difficulty;

            // 0..1 "the fish is fighting" signal - smooth noise, mostly calm with occasional surges
            float surge = Mathf.Clamp01(Mathf.PerlinNoise(Time.time * (0.8f + difficulty * 1.5f), noiseSeed) * 1.6f - 0.5f);

            if (held)
            {
                progress += reelSpeed * (1f - 0.5f * difficulty) * dt;
                tension += (tensionRise + fishPull * difficulty * surge * 2f) * dt;
            }
            else
            {
                progress -= (slackDrift + surge * difficulty * 0.1f) * dt;
                tension -= tensionFall * dt;
            }
            progress = Mathf.Max(0f, progress);
            tension = Mathf.Clamp01(tension);

            if (tension >= 1f)
            {
                Play(lineSnap);
                Finish("Snap! The line broke.");
                return;
            }
            if (progress >= 1f)
            {
                Catch();
                return;
            }

            Vector3 landing = HangPosition();
            landing.y = waterLevel;
            Vector3 target = Vector3.Lerp(reelStartPoint, landing, progress);
            target.y = waterLevel;
            Vector3 thrash = new Vector3(
                Mathf.PerlinNoise(Time.time * 6f, noiseSeed + 3f) - 0.5f,
                0f,
                Mathf.PerlinNoise(Time.time * 6f, noiseSeed + 7f) - 0.5f) * (surge * 0.6f);
            bobber.position = target + thrash + Vector3.up * (dipOffset - surge * 0.08f);

            if (reelLoopSource)
            {
                reelLoopSource.volume = Mathf.MoveTowards(reelLoopSource.volume, held ? 0.8f : 0f, dt * 6f);
                reelLoopSource.pitch = 0.9f + tension * 0.5f;
            }
            if (surge > 0.7f && Random.value < dt * 3f)
            {
                Splash(bobber.position, 6);
            }
        }

        void Catch()
        {
            float weight = Random.Range(hookedFish.weightRangeKg.x, hookedFish.weightRangeKg.y);
            TotalCaught++;
            Play(catchJingle);
            Splash(bobber.position, 24);
            FishCaught?.Invoke(hookedFish, weight);
            Finish($"You caught a {weight:0.00} kg {hookedFish.displayName}!", 2.8f);
        }

        void Finish(string text, float holdSeconds = 1.8f)
        {
            StopRoutine();
            if (reelLoopSource)
            {
                reelLoopSource.Stop();
            }
            nibbling = false;
            state = State.Result;
            message = text;
            routine = StartCoroutine(ReturnToIdle(holdSeconds));
        }

        IEnumerator ReturnToIdle(float delay)
        {
            yield return new WaitForSeconds(delay);
            state = State.Idle;
            message = IdleHint;
            routine = null;
        }

        void StopRoutine()
        {
            if (routine != null)
            {
                StopCoroutine(routine);
                routine = null;
            }
        }

        FishType PickFish()
        {
            float total = 0f;
            foreach (var fish in fishTypes)
            {
                total += fish.rarityWeight;
            }
            float roll = Random.value * total;
            foreach (var fish in fishTypes)
            {
                roll -= fish.rarityWeight;
                if (roll <= 0f)
                {
                    return fish;
                }
            }
            return fishTypes[fishTypes.Length - 1];
        }

        // ------------------------------------------------------------------ bobber + line

        Vector3 HangPosition()
        {
            float sway = Mathf.Sin(Time.time * 1.3f) * 0.03f;
            return rodTip.position + Vector3.down * idleHangLength + transform.right * sway;
        }

        void MoveBobberToHang()
        {
            bobber.position = Vector3.Lerp(bobber.position, HangPosition(), Time.deltaTime * 6f);
        }

        void FloatBobber(Vector3 anchor, float shake)
        {
            float t = Time.time;
            float bob = Mathf.Sin(t * 2.1f) * 0.015f + Mathf.Sin(t * 3.7f) * 0.008f;
            float jitter = shake > 1f ? Mathf.Sin(t * 40f) * 0.01f * shake : 0f;
            bobber.position = new Vector3(anchor.x + jitter, waterLevel + bob + dipOffset, anchor.z);
        }

        void LateUpdate()
        {
            UpdateLine();
        }

        void UpdateLine()
        {
            if (!fishingLine || !rodTip || !bobber)
            {
                return;
            }
            if (fishingLine.positionCount != lineSegments + 1)
            {
                fishingLine.positionCount = lineSegments + 1;
            }

            Vector3 a = rodTip.position;
            Vector3 b = bobber.position;
            float slack;
            switch (state)
            {
                case State.Reeling:
                    slack = 1f - tension;
                    break;
                case State.Idle:
                case State.Result:
                    slack = 0.1f;
                    break;
                default:
                    slack = 1f;
                    break;
            }
            float sag = slackSag * slack * Mathf.Min(1f, Vector3.Distance(a, b) / 5f);
            Vector3 control = (a + b) * 0.5f + Vector3.down * (sag * 2f);  // quadratic Bezier peak = sag

            for (int i = 0; i <= lineSegments; i++)
            {
                float t = i / (float)lineSegments;
                float u = 1f - t;
                fishingLine.SetPosition(i, u * u * a + 2f * u * t * control + t * t * b);
            }
        }

        // ------------------------------------------------------------------ audio / fx

        void Play(AudioClip clip, float volume = 1f)
        {
            if (!clip || !sfxSource)
            {
                return;
            }
            sfxSource.pitch = 1f + Random.Range(-pitchJitter, pitchJitter);
            sfxSource.PlayOneShot(clip, volume);
        }

        void Splash(Vector3 position, int particles)
        {
            if (!splashFx)
            {
                return;
            }
            splashFx.transform.position = position;
            splashFx.Emit(particles);
        }

        // ------------------------------------------------------------------ input

        static bool ActionPressed()
        {
#if ENABLE_INPUT_SYSTEM
            bool mouse = Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame;
            bool key = Keyboard.current != null && Keyboard.current.spaceKey.wasPressedThisFrame;
            bool pad = Gamepad.current != null && Gamepad.current.buttonSouth.wasPressedThisFrame;
            return mouse || key || pad;
#else
            return Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space);
#endif
        }

        static bool ActionHeld()
        {
#if ENABLE_INPUT_SYSTEM
            bool mouse = Mouse.current != null && Mouse.current.leftButton.isPressed;
            bool key = Keyboard.current != null && Keyboard.current.spaceKey.isPressed;
            bool pad = Gamepad.current != null && Gamepad.current.buttonSouth.isPressed;
            return mouse || key || pad;
#else
            return Input.GetMouseButton(0) || Input.GetKey(KeyCode.Space);
#endif
        }

        // ------------------------------------------------------------------ placeholder HUD

        void OnGUI()
        {
            if (hintStyle == null)
            {
                hintStyle = new GUIStyle(GUI.skin.label) { fontSize = 22, alignment = TextAnchor.MiddleCenter };
                hintStyle.normal.textColor = new Color(1f, 0.96f, 0.88f);
                counterStyle = new GUIStyle(hintStyle) { alignment = TextAnchor.MiddleLeft, fontSize = 18 };
            }

            float w = Screen.width;
            float h = Screen.height;
            GUI.Label(new Rect(0f, h - 110f, w, 40f), message, hintStyle);
            GUI.Label(new Rect(20f, 16f, 300f, 30f), $"Fish caught: {TotalCaught}", counterStyle);

            if (state == State.Reeling)
            {
                Color calm = new Color(1f, 0.85f, 0.5f);
                Color danger = new Color(0.95f, 0.35f, 0.3f);
                DrawBar(new Rect(w * 0.5f - 160f, h - 160f, 320f, 12f), progress, new Color(0.55f, 0.85f, 0.55f));
                DrawBar(new Rect(w * 0.5f - 160f, h - 142f, 320f, 12f), tension, Color.Lerp(calm, danger, tension));
            }
        }

        static void DrawBar(Rect rect, float value, Color fill)
        {
            GUI.color = new Color(0f, 0f, 0f, 0.35f);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = fill;
            GUI.DrawTexture(new Rect(rect.x, rect.y, rect.width * Mathf.Clamp01(value), rect.height), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }
    }
}
