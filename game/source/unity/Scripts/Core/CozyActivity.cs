using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Base class for an island activity. The ActivityHub calls Enter/Exit; activities keep running
    /// (birds keep visiting, plants keep growing) but only read input while IsActive.
    /// </summary>
    public abstract class CozyActivity : MonoBehaviour
    {
        [Header("Activity")]
        public string displayName = "Activity";
        [TextArea] public string enterHint = "";

        [Header("Camera while active")]
        [Tooltip("What the camera orbits. Use the matching marker from the FBX.")]
        public Transform cameraFocus;
        [Tooltip("Optional: camera sits on this side of the focus (e.g. the *CameraFrom markers).")]
        public Transform cameraFrom;
        public float cameraDistance = 8f;
        [Range(5f, 85f)] public float cameraPitch = 30f;

        public bool IsActive { get; private set; }

        int activatedFrame = -1;

        /// <summary>True while active, skipping the frame the activity was entered (so the selecting click is not reused).</summary>
        protected bool InputReady => IsActive && Time.frameCount > activatedFrame;

        public void Enter()
        {
            IsActive = true;
            activatedFrame = Time.frameCount;
            OnEnter();
        }

        public void Exit()
        {
            if (!IsActive)
            {
                return;
            }
            IsActive = false;
            OnExit();
        }

        protected virtual void OnEnter()
        {
        }

        protected virtual void OnExit()
        {
        }

        /// <summary>Drawn by the ActivityHub inside OnGUI while this activity is active.</summary>
        public virtual void DrawHud()
        {
        }

        protected static void PlayClip(AudioSource source, AudioClip clip, float volume = 1f, float pitchJitter = 0.05f)
        {
            if (!source || !clip)
            {
                return;
            }
            source.pitch = 1f + Random.Range(-pitchJitter, pitchJitter);
            source.PlayOneShot(clip, volume);
        }
    }
}
