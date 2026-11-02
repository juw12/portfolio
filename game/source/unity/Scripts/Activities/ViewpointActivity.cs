using System;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Sunset bench: a 20-second eye rest on the far horizon (the 20-20-20 rule),
    /// then an optional one-minute desk-worker stretch routine.
    /// </summary>
    public class ViewpointActivity : CozyActivity
    {
        [Serializable]
        public class StretchStep
        {
            public string instruction = "Roll your shoulders back slowly";
            [Min(3f)] public float seconds = 10f;
        }

        enum Step { EyeRest, Offer, Stretching, Done }

        [Header("Eye rest")]
        public float eyeRestSeconds = 20f;

        [Header("Stretches")]
        public StretchStep[] stretches =
        {
            new StretchStep { instruction = "Roll your shoulders back, slowly, five times", seconds = 12f },
            new StretchStep { instruction = "Tilt your head to the left... hold... now to the right", seconds = 14f },
            new StretchStep { instruction = "Arm out, palm forward, gently pull your fingers back. Swap hands.", seconds = 14f },
            new StretchStep { instruction = "Interlace your fingers and reach up high", seconds = 10f },
            new StretchStep { instruction = "Close your eyes. Three slow breaths.", seconds = 15f },
        };

        [Header("Audio")]
        public AudioSource sfxSource;
        public AudioClip stepChime;
        public AudioClip doneChime;

        Step step;
        float timer;
        int stretchIndex;

        void Reset()
        {
            displayName = "Sunset Viewpoint";
            enterHint = "Let your eyes soften on the far mountains.";
            cameraDistance = 3.5f;
            cameraPitch = 8f;
        }

        protected override void OnEnter()
        {
            step = Step.EyeRest;
            timer = 0f;
        }

        void Update()
        {
            if (!IsActive)
            {
                return;
            }
            timer += Time.deltaTime;
            bool pressed = InputReady && CozyInput.PrimaryPressed;

            switch (step)
            {
                case Step.EyeRest:
                    if (timer >= eyeRestSeconds)
                    {
                        CozyProgress.Add("eye_rests");
                        PlayClip(sfxSource, doneChime, 0.7f, 0f);
                        step = Step.Offer;
                        timer = 0f;
                    }
                    break;

                case Step.Offer:
                    if (pressed && stretches.Length > 0)
                    {
                        step = Step.Stretching;
                        stretchIndex = 0;
                        timer = 0f;
                        PlayClip(sfxSource, stepChime, 0.6f, 0f);
                    }
                    break;

                case Step.Stretching:
                    if (timer >= stretches[stretchIndex].seconds || pressed)
                    {
                        stretchIndex++;
                        timer = 0f;
                        if (stretchIndex >= stretches.Length)
                        {
                            step = Step.Done;
                            CozyProgress.Add("stretch_sessions");
                            PlayClip(sfxSource, doneChime, 0.7f, 0f);
                        }
                        else
                        {
                            PlayClip(sfxSource, stepChime, 0.6f, 0f);
                        }
                    }
                    break;

                case Step.Done:
                    if (pressed)
                    {
                        step = Step.EyeRest;
                        timer = 0f;
                    }
                    break;
            }
        }

        public override void DrawHud()
        {
            float y = Screen.height * 0.2f;
            switch (step)
            {
                case Step.EyeRest:
                    int left = Mathf.Max(1, Mathf.CeilToInt(eyeRestSeconds - timer));
                    CozyGui.Label(new Rect(0f, y, Screen.width, 34f), "Look at the far horizon. Let your eyes soften.", 22);
                    CozyGui.Label(new Rect(0f, y + 38f, Screen.width, 30f), left.ToString(), 20);
                    CozyGui.Bar(new Rect(Screen.width * 0.5f - 120f, y + 74f, 240f, 8f), timer / eyeRestSeconds, CozyGui.Peach);
                    break;

                case Step.Offer:
                    CozyGui.Label(new Rect(0f, y, Screen.width, 34f), "Eyes rested.", 22);
                    CozyGui.Label(new Rect(0f, y + 36f, Screen.width, 28f), "Click for a one-minute stretch, or Esc to head back.", 16);
                    break;

                case Step.Stretching:
                    var current = stretches[stretchIndex];
                    float width = Mathf.Min(620f, Screen.width - 40f);
                    var rect = new Rect((Screen.width - width) * 0.5f, y - 10f, width, 100f);
                    CozyGui.PanelBox(rect);
                    CozyGui.Label(new Rect(rect.x + 16f, rect.y + 8f, width - 32f, 54f), current.instruction, 20);
                    CozyGui.Bar(new Rect(rect.x + 60f, rect.y + 66f, width - 120f, 8f), timer / current.seconds, CozyGui.Sage);
                    CozyGui.Label(new Rect(rect.x, rect.y + 76f, width, 22f),
                        $"{stretchIndex + 1} / {stretches.Length}  ·  click to skip", 13);
                    break;

                case Step.Done:
                    CozyGui.Label(new Rect(0f, y, Screen.width, 34f), "All done. Your shoulders say thanks.", 22);
                    CozyGui.Label(new Rect(0f, y + 36f, Screen.width, 28f), "Click to rest your eyes again.", 16);
                    break;
            }
        }
    }
}
