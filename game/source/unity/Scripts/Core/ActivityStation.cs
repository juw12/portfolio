using UnityEngine;

namespace CozyFishing
{
    /// <summary>Clickable spot on the island that starts an activity. Adds a trigger sphere if no collider exists.</summary>
    public class ActivityStation : MonoBehaviour
    {
        public CozyActivity activity;
        public float clickRadius = 1.5f;

        void Awake()
        {
            if (!GetComponent<Collider>())
            {
                var sphere = gameObject.AddComponent<SphereCollider>();
                sphere.isTrigger = true;
                sphere.radius = clickRadius;
                sphere.center = new Vector3(0f, 0.6f, 0f);
            }
        }
    }
}
