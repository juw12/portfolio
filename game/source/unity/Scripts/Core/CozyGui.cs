using System.Collections.Generic;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>Soft rounded IMGUI helpers + a toast message. Call the drawing methods from OnGUI only.</summary>
    public static class CozyGui
    {
        public static readonly Color Cream = new Color(1f, 0.96f, 0.88f);
        public static readonly Color PanelTint = new Color(0.16f, 0.12f, 0.1f, 0.6f);
        public static readonly Color Sage = new Color(0.62f, 0.85f, 0.6f);
        public static readonly Color Peach = new Color(1f, 0.78f, 0.55f);

        static readonly Dictionary<long, GUIStyle> labelStyles = new Dictionary<long, GUIStyle>();
        static GUIStyle panelStyle;
        static Texture2D roundedTexture;
        static Texture2D circleTexture;
        static string toastText;
        static float toastUntil;

        public static GUIStyle LabelStyle(int size, TextAnchor anchor = TextAnchor.MiddleCenter)
        {
            long key = size * 16L + (int)anchor;
            if (!labelStyles.TryGetValue(key, out var style))
            {
                style = new GUIStyle(GUI.skin.label) { fontSize = size, alignment = anchor, wordWrap = true };
                style.normal.textColor = Cream;
                labelStyles[key] = style;
            }
            return style;
        }

        public static void Label(Rect rect, string text, int size = 18, TextAnchor anchor = TextAnchor.MiddleCenter)
        {
            var style = LabelStyle(size, anchor);
            Color previous = GUI.color;
            GUI.color = new Color(0f, 0f, 0f, 0.5f * previous.a);
            GUI.Label(new Rect(rect.x + 1.5f, rect.y + 1.5f, rect.width, rect.height), text, style);
            GUI.color = previous;
            GUI.Label(rect, text, style);
        }

        public static void PanelBox(Rect rect, Color? tint = null)
        {
            EnsureTextures();
            Color previous = GUI.color;
            GUI.color = tint ?? PanelTint;
            GUI.Box(rect, GUIContent.none, panelStyle);
            GUI.color = previous;
        }

        public static void Bar(Rect rect, float value, Color fill)
        {
            PanelBox(rect, new Color(0f, 0f, 0f, 0.35f));
            float width = rect.width * Mathf.Clamp01(value);
            if (width > 2f)
            {
                PanelBox(new Rect(rect.x, rect.y, width, rect.height), fill);
            }
        }

        public static void Circle(Rect rect, Color color)
        {
            EnsureTextures();
            Color previous = GUI.color;
            GUI.color = color;
            GUI.DrawTexture(rect, circleTexture);
            GUI.color = previous;
        }

        /// <summary>Pointer position in GUI coordinates (origin top-left).</summary>
        public static Vector2 PointerGui
        {
            get
            {
                Vector2 pointer = CozyInput.PointerPosition;
                return new Vector2(pointer.x, Screen.height - pointer.y);
            }
        }

        public static void Tooltip(string text)
        {
            var style = LabelStyle(15, TextAnchor.MiddleCenter);
            Vector2 size = style.CalcSize(new GUIContent(text)) + new Vector2(24f, 12f);
            Vector2 pointer = PointerGui;
            var rect = new Rect(pointer.x + 18f, pointer.y + 8f, size.x, size.y);
            PanelBox(rect);
            Label(rect, text, 15);
        }

        public static void Toast(string text, float seconds = 4f)
        {
            toastText = text;
            toastUntil = Time.unscaledTime + seconds;
        }

        public static void DrawToast()
        {
            float remaining = toastUntil - Time.unscaledTime;
            if (remaining <= 0f || string.IsNullOrEmpty(toastText))
            {
                return;
            }
            Color previous = GUI.color;
            GUI.color = new Color(1f, 1f, 1f, Mathf.Clamp01(remaining / 0.6f));
            float width = Mathf.Min(640f, Screen.width - 40f);
            var rect = new Rect((Screen.width - width) * 0.5f, 56f, width, 48f);
            PanelBox(rect);
            Label(new Rect(rect.x + 12f, rect.y, rect.width - 24f, rect.height), toastText, 16);
            GUI.color = previous;
        }

        static void EnsureTextures()
        {
            if (roundedTexture && circleTexture && panelStyle != null)
            {
                return;
            }
            const int roundedSize = 32;
            const float radius = 12f;
            roundedTexture = MakeTexture(roundedSize, (x, y) =>
            {
                float dx = Mathf.Max(0f, Mathf.Max(radius - x, x - (roundedSize - radius)));
                float dy = Mathf.Max(0f, Mathf.Max(radius - y, y - (roundedSize - radius)));
                return radius - Mathf.Sqrt(dx * dx + dy * dy) + 0.5f;
            });

            const int circleSize = 256;
            circleTexture = MakeTexture(circleSize, (x, y) =>
            {
                float dx = x - circleSize * 0.5f;
                float dy = y - circleSize * 0.5f;
                return circleSize * 0.5f - 2f - Mathf.Sqrt(dx * dx + dy * dy) + 0.5f;
            });

            panelStyle = new GUIStyle { border = new RectOffset(12, 12, 12, 12) };
            panelStyle.normal.background = roundedTexture;
        }

        static Texture2D MakeTexture(int size, System.Func<float, float, float> alphaAt)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.HideAndDontSave,
            };
            var pixels = new Color32[size * size];
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float alpha = Mathf.Clamp01(alphaAt(x + 0.5f, y + 0.5f));
                    pixels[y * size + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(alpha * 255f));
                }
            }
            texture.SetPixels32(pixels);
            texture.Apply();
            return texture;
        }
    }
}
