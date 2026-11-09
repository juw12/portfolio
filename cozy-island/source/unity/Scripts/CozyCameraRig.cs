using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CozyFishing
{
    /// <summary>
    /// Slow, floaty orbit camera: right-drag to orbit, scroll to zoom, gentle idle "breathing" sway.
    /// FocusOn() glides smoothly to a new spot (used by the ActivityHub when switching activities).
    /// </summary>
    public class CozyCameraRig : MonoBehaviour
    {
        public Transform target;
        public Vector3 targetOffset = new Vector3(0f, 1f, 0f);
        public float distance = 14f;
        public float minDistance = 2.5f;
        public float maxDistance = 30f;
        [Range(5f, 85f)] public float pitch = 32f;
        public float yaw = -40f;
        [Tooltip("Degrees per pixel of right-mouse drag.")]
        public float orbitSensitivity = 0.15f;
        [Tooltip("Fraction of distance per scroll notch.")]
        public float zoomStep = 0.1f;
        [Tooltip("Higher = snappier. ~4 gives a slow cozy glide.")]
        public float smoothing = 4f;

        [Header("Idle breathing")]
        public float swayAmount = 0.12f;
        public float swaySpeed = 0.25f;

        float currentYaw;
        float currentPitch;
        float currentDistance;
        Vector3 currentFocus;
        bool initialized;

        public void FocusOn(Transform newTarget, float newDistance, float newPitch, float? newYaw = null)
        {
            if (newTarget)
            {
                target = newTarget;
            }
            distance = newDistance;
            pitch = newPitch;
            if (newYaw.HasValue)
            {
                yaw = newYaw.Value;
            }
        }

        void LateUpdate()
        {
            if (!target)
            {
                return;
            }

            Vector3 desiredFocus = target.position + targetOffset;
            if (!initialized)
            {
                currentYaw = yaw;
                currentPitch = pitch;
                currentDistance = distance;
                currentFocus = desiredFocus;
                initialized = true;
            }

            ReadInput(out Vector2 drag, out float scrollNotches);
            yaw += drag.x * orbitSensitivity;
            if (scrollNotches != 0f)
            {
                distance = Mathf.Clamp(distance * (1f - scrollNotches * zoomStep), minDistance, maxDistance);
            }

            float k = 1f - Mathf.Exp(-smoothing * Time.deltaTime);   // frame-rate independent smoothing
            currentYaw = Mathf.LerpAngle(currentYaw, yaw, k);
            currentPitch = Mathf.Lerp(currentPitch, pitch, k);
            currentDistance = Mathf.Lerp(currentDistance, distance, k);
            currentFocus = Vector3.Lerp(currentFocus, desiredFocus, k);

            float t = Time.time * swaySpeed;
            Vector3 sway = new Vector3(Mathf.Sin(t), Mathf.Sin(t * 1.3f + 1f) * 0.5f, Mathf.Cos(t * 0.7f)) * swayAmount;
            Quaternion orbit = Quaternion.Euler(currentPitch, currentYaw, 0f);

            transform.position = currentFocus + orbit * new Vector3(0f, 0f, -currentDistance) + sway;
            transform.rotation = Quaternion.LookRotation(currentFocus - transform.position, Vector3.up);
        }

        static void ReadInput(out Vector2 drag, out float scrollNotches)
        {
            drag = Vector2.zero;
            scrollNotches = 0f;
#if ENABLE_INPUT_SYSTEM
            var mouse = Mouse.current;
            if (mouse == null)
            {
                return;
            }
            if (mouse.rightButton.isPressed)
            {
                drag = mouse.delta.ReadValue();
            }
            float scroll = mouse.scroll.ReadValue().y;
            if (Mathf.Abs(scroll) > 0.01f)
            {
                scrollNotches = Mathf.Sign(scroll);   // raw scroll units differ per platform
            }
#else
            if (Input.GetMouseButton(1))
            {
                drag = new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y")) * 10f;
            }
            scrollNotches = Mathf.Clamp(Input.mouseScrollDelta.y, -1f, 1f);
#endif
        }
    }
}
