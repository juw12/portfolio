using System;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Brew tea on the porch. While it steeps, a soft circle guides your breathing
    /// (each tea has its own rhythm). About one minute, then sip and enjoy.
    /// </summary>
    public class TeaBreathingActivity : CozyActivity
    {
        [Serializable]
        public class TeaRecipe
        {
            public string displayName = "Chamomile";
            public string mood = "unwind";
            [Min(0.5f)] public float inhale = 4f;
            [Min(0f)] public float holdIn = 7f;
            [Min(0.5f)] public float exhale = 8f;
            [Min(0f)] public float holdOut = 0f;
            [Min(1)] public int cycles = 4;
            public Color teaColor = new Color(0.95f, 0.8f, 0.45f);
        }

        struct BreathPhase
        {
            public string label;
            public float seconds;
            public float from;
            public float to;
        }

        enum Step { Choose, Heating, Steeping, Ready, Done }

        [Header("Tea")]
        public TeaRecipe[] recipes =
        {
            new TeaRecipe { displayName = "Chamomile", mood = "unwind", inhale = 4f, holdIn = 7f, exhale = 8f, holdOut = 0f, cycles = 4, teaColor = new Color(0.95f, 0.8f, 0.45f) },
            new TeaRecipe { displayName = "Green tea", mood = "refocus", inhale = 4f, holdIn = 4f, exhale = 4f, holdOut = 4f, cycles = 4, teaColor = new Color(0.62f, 0.82f, 0.45f) },
            new TeaRecipe { displayName = "Peppermint", mood = "fresh air", inhale = 4f, holdIn = 2f, exhale = 6f, holdOut = 0f, cycles = 5, teaColor = new Color(0.55f, 0.86f, 0.72f) },
        };
        public float heatSeconds = 6f;
        public int sipsPerCup = 3;

        [Header("Effects (optional)")]
        public ParticleSystem kettleSteam;
        public ParticleSystem cupSteam;

        [Header("Audio")]
        public AudioSource sfxSource;
        public AudioClip kettleClip;
        public AudioClip pourClip;
        public AudioClip sipClip;
        [Tooltip("Very soft cue at the start of each inhale (e.g. a low singing bowl).")]
        public AudioClip inhaleCue;
        public AudioClip exhaleCue;

        Step step;
        int recipeIndex;
        float timer;
        float steepStartTime;
        int cycle;
        int phaseIndex;
        float phaseTimer;
        float breathScale = 0.35f;
        int sipsLeft;
        BreathPhase[] phases;

        TeaRecipe Recipe => recipes[recipeIndex];

        void Reset()
        {
            displayName = "Tea Porch";
            enterHint = "Pick a tea, then breathe along while it steeps.";
            cameraDistance = 4.5f;
            cameraPitch = 22f;
        }

        protected override void OnEnter()
        {
            step = Step.Choose;
        }

        protected override void OnExit()
        {
            SetSteam(kettleSteam, 0f);
            SetSteam(cupSteam, 0f);
        }

        void Update()
        {
            if (!IsActive)
            {
                return;
            }
            bool pressed = InputReady && CozyInput.PrimaryPressed;
            float dt = Time.deltaTime;

            switch (step)
            {
                case Step.Choose:
                    if (InputReady && CozyInput.PrevPressed)
                    {
                        recipeIndex = (recipeIndex + recipes.Length - 1) % recipes.Length;
                    }
                    if (InputReady && CozyInput.NextPressed)
                    {
                        recipeIndex = (recipeIndex + 1) % recipes.Length;
                    }
                    if (pressed)
                    {
                        step = Step.Heating;
                        timer = 0f;
                        PlayClip(sfxSource, kettleClip, 0.8f, 0f);
                    }
                    break;

                case Step.Heating:
                    timer += dt;
                    SetSteam(kettleSteam, Mathf.Lerp(0f, 25f, timer / heatSeconds));
                    if (timer >= heatSeconds)
                    {
                        StartSteeping();
                    }
                    break;

                case Step.Steeping:
                    if (pressed)
                    {
                        FinishSteeping();
                        break;
                    }
                    UpdateSteeping(dt);
                    break;

                case Step.Ready:
                    if (pressed)
                    {
                        PlayClip(sfxSource, sipClip);
                        sipsLeft--;
                        if (sipsLeft <= 0)
                        {
                            FinishCup();
                        }
                    }
                    break;

                case Step.Done:
                    if (pressed)
                    {
                        step = Step.Choose;
                    }
                    break;
            }
        }

        void StartSteeping()
        {
            SetSteam(kettleSteam, 0f);
            SetSteam(cupSteam, 12f);
            PlayClip(sfxSource, pourClip, 1f, 0f);
            var recipe = Recipe;
            phases = new[]
            {
                new BreathPhase { label = "Breathe in", seconds = recipe.inhale, from = 0.35f, to = 1f },
                new BreathPhase { label = "Hold", seconds = recipe.holdIn, from = 1f, to = 1f },
                new BreathPhase { label = "Breathe out", seconds = recipe.exhale, from = 1f, to = 0.35f },
                new BreathPhase { label = "Hold", seconds = recipe.holdOut, from = 0.35f, to = 0.35f },
            };
            cycle = 0;
            phaseIndex = 0;
            phaseTimer = 0f;
            breathScale = 0.35f;
            steepStartTime = Time.time;
            step = Step.Steeping;
            OnPhaseStarted();
        }

        void UpdateSteeping(float dt)
        {
            phaseTimer += dt;
            int guard = 0;
            while (phaseTimer >= phases[phaseIndex].seconds && guard++ < 8)
            {
                phaseTimer -= phases[phaseIndex].seconds;
                phaseIndex++;
                if (phaseIndex >= phases.Length)
                {
                    phaseIndex = 0;
                    cycle++;
                    if (cycle >= Recipe.cycles)
                    {
                        FinishSteeping();
                        return;
                    }
                }
                OnPhaseStarted();
            }
            var phase = phases[phaseIndex];
            float t = phase.seconds > 0f ? phaseTimer / phase.seconds : 1f;
            float eased = 0.5f - 0.5f * Mathf.Cos(t * Mathf.PI);
            breathScale = Mathf.Lerp(phase.from, phase.to, eased);
        }

        void OnPhaseStarted()
        {
            if (phases[phaseIndex].seconds <= 0f)
            {
                return;
            }
            if (phaseIndex == 0)
            {
                PlayClip(sfxSource, inhaleCue, 0.5f, 0f);
            }
            else if (phaseIndex == 2)
            {
                PlayClip(sfxSource, exhaleCue, 0.5f, 0f);
            }
        }

        void FinishSteeping()
        {
            step = Step.Ready;
            sipsLeft = sipsPerCup;
        }

        void FinishCup()
        {
            SetSteam(cupSteam, 0f);
            step = Step.Done;
            CozyProgress.Add("tea_cups");
            CozyProgress.Add("mindful_seconds", Mathf.RoundToInt(Time.time - steepStartTime));
        }

        static void SetSteam(ParticleSystem steam, float rate)
        {
            if (!steam)
            {
                return;
            }
            var emission = steam.emission;
            emission.rateOverTime = rate;
            if (rate > 0f && !steam.isPlaying)
            {
                steam.Play();
            }
        }

        public override void DrawHud()
        {
            var recipe = Recipe;
            float centerX = Screen.width * 0.5f;
            switch (step)
            {
                case Step.Choose:
                    DrawBottomPanel($"Q  <   {recipe.displayName}   >  E",
                        $"{recipe.mood}  ·  {Rhythm(recipe)} breathing  ·  click to brew");
                    break;

                case Step.Heating:
                    DrawBottomPanel("Warming the kettle...", "listen to it hum");
                    CozyGui.Bar(new Rect(centerX - 120f, Screen.height - 44f, 240f, 10f), timer / heatSeconds, CozyGui.Peach);
                    break;

                case Step.Steeping:
                    DrawBreathingCircle(recipe);
                    break;

                case Step.Ready:
                    DrawBottomPanel($"Your {recipe.displayName} is ready", $"click to sip ({sipsLeft})");
                    break;

                case Step.Done:
                    DrawBottomPanel("Ahh.", $"{CozyProgress.Get("tea_cups")} cups so far  ·  click to brew another");
                    break;
            }
        }

        void DrawBreathingCircle(TeaRecipe recipe)
        {
            float maxSize = Mathf.Min(Screen.width, Screen.height) * 0.42f;
            var center = new Vector2(Screen.width * 0.5f, Screen.height * 0.45f);
            var guide = new Rect(center.x - maxSize * 0.5f, center.y - maxSize * 0.5f, maxSize, maxSize);
            CozyGui.Circle(guide, new Color(1f, 1f, 1f, 0.12f));

            float size = maxSize * breathScale;
            var fill = new Color(recipe.teaColor.r, recipe.teaColor.g, recipe.teaColor.b, 0.55f);
            CozyGui.Circle(new Rect(center.x - size * 0.5f, center.y - size * 0.5f, size, size), fill);

            var phase = phases[phaseIndex];
            int countdown = Mathf.Max(1, Mathf.CeilToInt(phase.seconds - phaseTimer));
            CozyGui.Label(new Rect(center.x - 150f, center.y - 30f, 300f, 34f), phase.label, 26);
            CozyGui.Label(new Rect(center.x - 150f, center.y + 6f, 300f, 30f), countdown.ToString(), 20);
            CozyGui.Label(new Rect(0f, center.y + maxSize * 0.5f + 12f, Screen.width, 26f),
                $"Breath {cycle + 1} of {recipe.cycles}  ·  click to skip", 14);
        }

        static void DrawBottomPanel(string title, string subtitle)
        {
            const float width = 480f;
            var rect = new Rect((Screen.width - width) * 0.5f, Screen.height - 110f, width, 60f);
            CozyGui.PanelBox(rect);
            CozyGui.Label(new Rect(rect.x, rect.y + 6f, width, 26f), title, 20);
            CozyGui.Label(new Rect(rect.x, rect.y + 32f, width, 22f), subtitle, 14);
        }

        static string Rhythm(TeaRecipe recipe)
        {
            string text = $"{recipe.inhale:0}-{recipe.holdIn:0}-{recipe.exhale:0}";
            return recipe.holdOut > 0f ? text + $"-{recipe.holdOut:0}" : text;
        }
    }
}
