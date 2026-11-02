using UnityEngine;

namespace CozyFishing
{
    /// <summary>Plugs the existing FishingController into the ActivityHub (enables it only while active).</summary>
    public class FishingActivity : CozyActivity
    {
        public FishingController fishing;
        [Tooltip("Optional: turns the player to cast toward this point (use the FishingSpot marker).")]
        public Transform castToward;

        void Reset()
        {
            displayName = "Fishing";
            enterHint = "Click to cast. Wait for the big dip, then hold to reel.";
            cameraDistance = 9f;
            cameraPitch = 28f;
        }

        void Awake()
        {
            if (!fishing)
            {
                return;
            }
            fishing.enabled = false;
            fishing.FishCaught += OnFishCaught;
            if (castToward)
            {
                Vector3 direction = castToward.position - fishing.transform.position;
                direction.y = 0f;
                if (direction.sqrMagnitude > 0.01f)
                {
                    fishing.transform.rotation = Quaternion.LookRotation(direction);
                }
            }
        }

        void OnDestroy()
        {
            if (fishing)
            {
                fishing.FishCaught -= OnFishCaught;
            }
        }

        protected override void OnEnter()
        {
            if (fishing)
            {
                fishing.enabled = true;
            }
        }

        protected override void OnExit()
        {
            if (fishing)
            {
                fishing.enabled = false;
            }
        }

        static void OnFishCaught(FishType fish, float weightKg)
        {
            CozyProgress.Add("fish");
            CozyProgress.Add("fish_" + fish.displayName);
        }
    }
}
