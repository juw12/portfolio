using UnityEngine;

namespace CozyFishing
{
    /// <summary>Gentle bob + roll for things on water (rowboat, lily pads, floating crates).</summary>
    public class FloatingBob : MonoBehaviour
    {
        public float bobHeight = 0.05f;
        public float bobSpeed = 1.2f;
        public float rollDegrees = 2.5f;
        public float pitchDegrees = 1.5f;

        Vector3 basePosition;
        Quaternion baseRotation;
        float phase;

        void Start()
        {
            basePosition = transform.localPosition;
            baseRotation = transform.localRotation;
            phase = Random.value * 10f;
        }

        void Update()
        {
            float t = Time.time * bobSpeed + phase;
            transform.localPosition = basePosition + Vector3.up * (Mathf.Sin(t) * bobHeight);
            transform.localRotation = baseRotation * Quaternion.Euler(
                Mathf.Sin(t * 0.8f + 1.3f) * pitchDegrees,
                0f,
                Mathf.Sin(t * 0.6f) * rollDegrees);
        }
    }
}
