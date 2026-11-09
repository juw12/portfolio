using System;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Tiny persistent inventory / stats store (PlayerPrefs). Keys used by the kit:
    /// fish, harvest, tea_cups, mindful_seconds, photos, bird_[Name], focus_sessions,
    /// rare_seeds, eye_rests, stretch_sessions.
    /// </summary>
    public static class CozyProgress
    {
        const string Prefix = "cozy.";

        public static event Action<string, int> Changed;

        public static int Get(string key) => PlayerPrefs.GetInt(Prefix + key, 0);

        public static void Add(string key, int amount = 1)
        {
            int value = Get(key) + amount;
            PlayerPrefs.SetInt(Prefix + key, value);
            PlayerPrefs.Save();
            Changed?.Invoke(key, value);
        }

        public static bool TrySpend(string key, int amount = 1)
        {
            if (Get(key) < amount)
            {
                return false;
            }
            Add(key, -amount);
            return true;
        }

        public static string GetText(string key, string fallback = "") => PlayerPrefs.GetString(Prefix + key, fallback);

        public static void SetText(string key, string value)
        {
            PlayerPrefs.SetString(Prefix + key, value);
            PlayerPrefs.Save();
        }
    }
}
