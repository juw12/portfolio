using System;
using System.Collections.Generic;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Explore mode: click a station (or press 1-9) to start an activity. Esc returns to the island.
    /// J in explore mode opens the cozy journal (all your stats).
    /// </summary>
    public class ActivityHub : MonoBehaviour
    {
        public CozyCameraRig cameraRig;
        public Camera viewCamera;
        public List<CozyActivity> activities = new List<CozyActivity>();
        [Tooltip("-1 = start in explore mode.")]
        public int startActivity = -1;
        public float stationClickDistance = 200f;

        static readonly (string label, string key)[] StatRows =
        {
            ("Fish caught", "fish"),
            ("Plants harvested", "harvest"),
            ("Cups of tea", "tea_cups"),
            ("Bird photos", "photos"),
            ("Focus sessions", "focus_sessions"),
            ("Eye rests", "eye_rests"),
            ("Stretch breaks", "stretch_sessions"),
        };

        CozyActivity current;
        ActivityStation hovered;
        Transform exploreTarget;
        float exploreDistance;
        float explorePitch;
        bool showJournal;

        public CozyActivity Current => current;

        /// <summary>Raised after switching (null = back to explore). Avatars use it to walk to the activity.</summary>
        public event Action<CozyActivity> ActivityChanged;

        void Start()
        {
            if (!viewCamera)
            {
                viewCamera = Camera.main;
            }
            if (cameraRig)
            {
                exploreTarget = cameraRig.target;
                exploreDistance = cameraRig.distance;
                explorePitch = cameraRig.pitch;
            }
            if (startActivity >= 0 && startActivity < activities.Count)
            {
                Switch(activities[startActivity]);
            }
        }

        void Update()
        {
            for (int i = 0; i < activities.Count && i < 9; i++)
            {
                if (CozyInput.NumberPressed(i + 1))
                {
                    Switch(activities[i]);
                    return;
                }
            }

            if (current)
            {
                hovered = null;
                if (CozyInput.BackPressed)
                {
                    Switch(null);
                }
                return;
            }

            if (CozyInput.JournalPressed)
            {
                showJournal = !showJournal;
            }
            hovered = RaycastStation();
            if (hovered && hovered.activity && CozyInput.PrimaryPressed)
            {
                Switch(hovered.activity);
            }
        }

        public void Switch(CozyActivity next)
        {
            if (next == current)
            {
                return;
            }
            if (current)
            {
                current.Exit();
            }
            current = next;
            showJournal = false;
            if (current)
            {
                current.Enter();
                if (!string.IsNullOrEmpty(current.enterHint))
                {
                    CozyGui.Toast(current.enterHint, 5f);
                }
            }
            FocusCamera(current);
            ActivityChanged?.Invoke(current);
        }

        void FocusCamera(CozyActivity activity)
        {
            if (!cameraRig)
            {
                return;
            }
            if (!activity)
            {
                cameraRig.FocusOn(exploreTarget, exploreDistance, explorePitch);
                return;
            }

            Transform focus = activity.cameraFocus ? activity.cameraFocus : activity.transform;
            float? yaw = null;
            if (activity.cameraFrom)
            {
                Vector3 direction = focus.position - activity.cameraFrom.position;
                direction.y = 0f;
                if (direction.sqrMagnitude > 0.001f)
                {
                    yaw = Mathf.Atan2(direction.x, direction.z) * Mathf.Rad2Deg;
                }
            }
            cameraRig.FocusOn(focus, activity.cameraDistance, activity.cameraPitch, yaw);
        }

        ActivityStation RaycastStation()
        {
            if (!viewCamera)
            {
                return null;
            }
            Ray ray = CozyInput.PointerRay(viewCamera);
            var hits = Physics.RaycastAll(ray, stationClickDistance, ~0, QueryTriggerInteraction.Collide);
            ActivityStation best = null;
            float bestDistance = float.MaxValue;
            foreach (var hit in hits)
            {
                var station = hit.collider.GetComponentInParent<ActivityStation>();
                if (station && hit.distance < bestDistance)
                {
                    best = station;
                    bestDistance = hit.distance;
                }
            }
            return best;
        }

        void OnGUI()
        {
            if (current)
            {
                CozyGui.Label(new Rect(0f, 14f, Screen.width, 30f), current.displayName, 20);
                CozyGui.Label(new Rect(16f, Screen.height - 40f, 400f, 30f), "Esc - back to the island", 15, TextAnchor.MiddleLeft);
                current.DrawHud();
            }
            else
            {
                DrawExplorePanel();
                if (showJournal)
                {
                    DrawJournal();
                }
                if (hovered && hovered.activity)
                {
                    CozyGui.Tooltip("Click: " + hovered.activity.displayName);
                }
            }
            CozyGui.DrawToast();
        }

        void DrawExplorePanel()
        {
            const float lineHeight = 24f;
            int count = Mathf.Min(activities.Count, 9);
            var rect = new Rect(16f, 16f, 300f, 52f + (count + 2) * lineHeight);
            CozyGui.PanelBox(rect);
            CozyGui.Label(new Rect(32f, 22f, 270f, 28f), "Cozy Island", 20, TextAnchor.MiddleLeft);
            for (int i = 0; i < count; i++)
            {
                if (!activities[i])
                {
                    continue;
                }
                CozyGui.Label(new Rect(32f, 54f + i * lineHeight, 270f, lineHeight),
                    $"{i + 1}   {activities[i].displayName}", 16, TextAnchor.MiddleLeft);
            }
            CozyGui.Label(new Rect(32f, 58f + count * lineHeight, 270f, lineHeight),
                "J journal  ·  F focus timer", 14, TextAnchor.MiddleLeft);
            CozyGui.Label(new Rect(32f, 58f + (count + 1) * lineHeight, 270f, lineHeight),
                "M mini window  ·  right-drag to look", 14, TextAnchor.MiddleLeft);
        }

        void DrawJournal()
        {
            const float lineHeight = 26f;
            float height = 70f + (StatRows.Length + 1) * lineHeight;
            var rect = new Rect((Screen.width - 380f) * 0.5f, (Screen.height - height) * 0.5f, 380f, height);
            CozyGui.PanelBox(rect);
            CozyGui.Label(new Rect(rect.x, rect.y + 10f, rect.width, 34f), "Cozy journal", 22);
            float y = rect.y + 50f;
            foreach (var row in StatRows)
            {
                CozyGui.Label(new Rect(rect.x + 30f, y, 220f, lineHeight), row.label, 16, TextAnchor.MiddleLeft);
                CozyGui.Label(new Rect(rect.x + 250f, y, 100f, lineHeight), CozyProgress.Get(row.key).ToString(), 16, TextAnchor.MiddleRight);
                y += lineHeight;
            }
            int mindfulMinutes = CozyProgress.Get("mindful_seconds") / 60;
            CozyGui.Label(new Rect(rect.x + 30f, y, 220f, lineHeight), "Mindful minutes", 16, TextAnchor.MiddleLeft);
            CozyGui.Label(new Rect(rect.x + 250f, y, 100f, lineHeight), mindfulMinutes.ToString(), 16, TextAnchor.MiddleRight);
        }
    }
}
