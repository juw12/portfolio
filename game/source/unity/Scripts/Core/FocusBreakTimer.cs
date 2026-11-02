using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Pomodoro timer for laptop work: F starts focus (F again pauses), a gentle chime ends it,
    /// you earn a rare seed, and the game suggests a cozy break. Also nudges the 20-20-20 eye rule.
    /// Runs in the background, so you can leave the game in a small corner window (M) while working.
    /// </summary>
    public class FocusBreakTimer : MonoBehaviour
    {
        public enum Phase { Idle, Focus, Break }

        [Header("Pomodoro")]
        [Min(1f)] public float focusMinutes = 25f;
        [Min(1f)] public float shortBreakMinutes = 5f;
        [Min(1f)] public float longBreakMinutes = 15f;
        [Min(1)] public int sessionsBeforeLongBreak = 4;

        [Header("Reward per finished focus session")]
        public string rewardKey = "rare_seeds";
        public string rewardLabel = "Moonflower seed";

        [Header("20-20-20 eye rest")]
        public bool eyeRestReminders = true;
        [Min(1f)] public float eyeRestEveryMinutes = 20f;

        [Header("Audio")]
        public AudioSource chimeSource;
        public AudioClip focusDoneChime;
        public AudioClip breakDoneChime;
        public AudioClip reminderChime;

        [Header("Break ideas")]
        public string[] breakSuggestions =
        {
            "brew a cup of tea on the porch",
            "check on the garden",
            "watch the birds at the feeder",
            "rest your eyes at the sunset viewpoint",
            "cast a line off the dock",
        };

        [Header("Mini window (M)")]
        public Vector2Int miniWindowSize = new Vector2Int(480, 270);

        public Phase CurrentPhase { get; private set; }
        public float RemainingSeconds { get; private set; }
        public bool Paused { get; private set; }

        int sessionsDone;
        float focusElapsed;
        float nextEyeRestAt;
        bool miniWindow;
        int savedWidth;
        int savedHeight;
        FullScreenMode savedMode;

        void Awake()
        {
            Application.runInBackground = true;
        }

        void Update()
        {
            if (CozyInput.FocusTogglePressed)
            {
                ToggleFocus();
            }
            if (CozyInput.MiniWindowPressed)
            {
                ToggleMiniWindow();
            }
            if (CurrentPhase == Phase.Idle || Paused)
            {
                return;
            }

            float dt = Time.unscaledDeltaTime;
            RemainingSeconds -= dt;

            if (CurrentPhase == Phase.Focus && eyeRestReminders)
            {
                focusElapsed += dt;
                if (focusElapsed >= nextEyeRestAt)
                {
                    nextEyeRestAt += eyeRestEveryMinutes * 60f;
                    Chime(reminderChime);
                    CozyGui.Toast("20-20-20: look at something ~6 m away for 20 seconds.", 8f);
                }
            }

            if (RemainingSeconds > 0f)
            {
                return;
            }
            if (CurrentPhase == Phase.Focus)
            {
                CompleteFocus();
            }
            else
            {
                CompleteBreak();
            }
        }

        public void ToggleFocus()
        {
            switch (CurrentPhase)
            {
                case Phase.Idle:
                case Phase.Break:
                    StartFocus();
                    break;
                case Phase.Focus:
                    Paused = !Paused;
                    CozyGui.Toast(Paused ? "Focus paused" : "Focus resumed", 2f);
                    break;
            }
        }

        void StartFocus()
        {
            CurrentPhase = Phase.Focus;
            RemainingSeconds = focusMinutes * 60f;
            Paused = false;
            focusElapsed = 0f;
            nextEyeRestAt = eyeRestEveryMinutes * 60f;
            CozyGui.Toast("Focus time. The island will wait for you.", 3f);
        }

        void CompleteFocus()
        {
            sessionsDone++;
            CozyProgress.Add("focus_sessions");
            if (!string.IsNullOrEmpty(rewardKey))
            {
                CozyProgress.Add(rewardKey);
            }
            bool longBreak = sessionsDone % sessionsBeforeLongBreak == 0;
            float breakMinutes = longBreak ? longBreakMinutes : shortBreakMinutes;
            CurrentPhase = Phase.Break;
            RemainingSeconds = breakMinutes * 60f;
            Chime(focusDoneChime);

            string idea = breakSuggestions.Length > 0
                ? breakSuggestions[Random.Range(0, breakSuggestions.Length)]
                : "stretch a little";
            CozyGui.Toast($"Nice work! +1 {rewardLabel}. Take {breakMinutes:0} minutes and {idea}.", 10f);
        }

        void CompleteBreak()
        {
            CurrentPhase = Phase.Idle;
            Chime(breakDoneChime);
            CozyGui.Toast("Break's over. Press F when you're ready to focus again.", 8f);
        }

        void ToggleMiniWindow()
        {
            if (!miniWindow)
            {
                savedWidth = Screen.width;
                savedHeight = Screen.height;
                savedMode = Screen.fullScreenMode;
                Screen.SetResolution(miniWindowSize.x, miniWindowSize.y, FullScreenMode.Windowed);
            }
            else
            {
                Screen.SetResolution(savedWidth, savedHeight, savedMode);
            }
            miniWindow = !miniWindow;
        }

        void Chime(AudioClip clip)
        {
            if (chimeSource && clip)
            {
                chimeSource.PlayOneShot(clip);
            }
        }

        void OnGUI()
        {
            string text;
            Color tint;
            switch (CurrentPhase)
            {
                case Phase.Focus:
                    text = $"Focus  {Format(RemainingSeconds)}" + (Paused ? "  (paused)" : "");
                    tint = new Color(0.2f, 0.32f, 0.26f, 0.7f);
                    break;
                case Phase.Break:
                    text = $"Break  {Format(RemainingSeconds)}";
                    tint = new Color(0.45f, 0.28f, 0.2f, 0.7f);
                    break;
                default:
                    text = "F  start focus";
                    tint = CozyGui.PanelTint;
                    break;
            }
            if (sessionsDone > 0)
            {
                text += $"  ·  {sessionsDone} done";
            }
            const float width = 260f;
            var rect = new Rect(Screen.width - width - 16f, 16f, width, 34f);
            CozyGui.PanelBox(rect, tint);
            CozyGui.Label(rect, text, 16);
        }

        static string Format(float seconds)
        {
            int total = Mathf.Max(0, Mathf.CeilToInt(seconds));
            return $"{total / 60:00}:{total % 60:00}";
        }
    }
}
