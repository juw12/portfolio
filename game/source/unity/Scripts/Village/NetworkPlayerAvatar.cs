using System.Text;
using Unity.Collections;
using Unity.Netcode;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// A friend on the island during live co-op: name tag, click-to-walk (right-click the ground),
    /// walks to whichever activity you open, and emotes (Z wave, X sit, C cheers).
    /// Player prefab: capsule (no collider or trigger only) + NetworkObject + OwnerNetworkTransform + this.
    /// </summary>
    public class NetworkPlayerAvatar : NetworkBehaviour
    {
        public static NetworkPlayerAvatar Local { get; private set; }

        public float walkSpeed = 2.6f;
        public float waterLevel = 0f;
        public Renderer bodyRenderer;
        [Tooltip("Name of the spawn marker exported from Blender.")]
        public string spawnMarkerName = "VillageSpawn";

        static readonly string[] EmoteTexts = { "waves hello", "sits down", "cheers with tea" };

        readonly NetworkVariable<FixedString32Bytes> displayName = new NetworkVariable<FixedString32Bytes>(
            default, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Owner);

        Vector3? walkTarget;
        Vector2 rightPressPosition;
        string emoteText = "";
        float emoteUntil;
        ActivityHub hub;
        Camera viewCamera;
        GUIStyle tagStyle;

        public override void OnNetworkSpawn()
        {
            TintBody();
            if (!IsOwner)
            {
                return;
            }
            Local = this;
            displayName.Value = new FixedString32Bytes(ClipToFixed(VillageClient.DisplayName, 29));

            var spawn = GameObject.Find(spawnMarkerName);
            if (spawn)
            {
                Vector2 offset = Random.insideUnitCircle * 1.2f;
                transform.position = spawn.transform.position + new Vector3(offset.x, 0f, offset.y);
            }
            hub = FindFirstObjectByType<ActivityHub>();
            if (hub)
            {
                hub.ActivityChanged += OnActivityChanged;
            }
        }

        public override void OnNetworkDespawn()
        {
            if (Local == this)
            {
                Local = null;
            }
            if (hub)
            {
                hub.ActivityChanged -= OnActivityChanged;
            }
        }

        void Update()
        {
            if (!IsSpawned || !IsOwner)
            {
                return;
            }
            if (!viewCamera)
            {
                viewCamera = Camera.main;
            }

            // Right-click (without dragging the camera) = walk there.
            if (CozyInput.SecondaryPressed)
            {
                rightPressPosition = CozyInput.PointerPosition;
            }
            if (CozyInput.SecondaryReleased && (CozyInput.PointerPosition - rightPressPosition).magnitude < 6f)
            {
                TryWalkToPointer();
            }

            for (int i = 0; i < EmoteTexts.Length; i++)
            {
                if (CozyInput.EmotePressed(i))
                {
                    EmoteRpc(i);
                }
            }

            MoveTowardTarget();
        }

        void TryWalkToPointer()
        {
            if (!viewCamera)
            {
                return;
            }
            var hits = Physics.RaycastAll(CozyInput.PointerRay(viewCamera), 200f, ~0, QueryTriggerInteraction.Ignore);
            float best = float.MaxValue;
            Vector3? point = null;
            foreach (var hit in hits)
            {
                if (hit.collider.transform.IsChildOf(transform) || hit.distance >= best)
                {
                    continue;
                }
                best = hit.distance;
                point = hit.point;
            }
            if (point.HasValue && point.Value.y > waterLevel + 0.05f)
            {
                walkTarget = point.Value;
            }
        }

        void OnActivityChanged(CozyActivity activity)
        {
            if (activity && activity.cameraFocus)
            {
                Vector2 offset = Random.insideUnitCircle * 0.8f;
                walkTarget = activity.cameraFocus.position + new Vector3(offset.x, 0f, offset.y);
            }
        }

        void MoveTowardTarget()
        {
            if (!walkTarget.HasValue)
            {
                return;
            }
            Vector3 position = transform.position;
            Vector3 toTarget = walkTarget.Value - position;
            toTarget.y = 0f;
            float distance = toTarget.magnitude;
            if (distance < 0.05f)
            {
                walkTarget = null;
                return;
            }
            Vector3 step = toTarget / distance * Mathf.Min(distance, walkSpeed * Time.deltaTime);
            Vector3 next = position + step;
            next.y = GroundHeight(next, position.y);
            transform.SetPositionAndRotation(next, Quaternion.Slerp(transform.rotation,
                Quaternion.LookRotation(toTarget), Time.deltaTime * 10f));
        }

        float GroundHeight(Vector3 at, float fallback)
        {
            var hits = Physics.RaycastAll(at + Vector3.up * 20f, Vector3.down, 40f, ~0, QueryTriggerInteraction.Ignore);
            float best = float.MaxValue;
            float height = fallback;
            foreach (var hit in hits)
            {
                if (hit.collider.transform.IsChildOf(transform) || hit.distance >= best)
                {
                    continue;
                }
                best = hit.distance;
                height = hit.point.y;
            }
            return height;
        }

        [Rpc(SendTo.Everyone)]
        void EmoteRpc(int emote)
        {
            if (emote < 0 || emote >= EmoteTexts.Length)
            {
                return;
            }
            emoteText = EmoteTexts[emote];
            emoteUntil = Time.time + 3f;
        }

        void TintBody()
        {
            if (!bodyRenderer)
            {
                return;
            }
            Color tint = Color.HSVToRGB(OwnerClientId * 0.17f % 1f, 0.45f, 0.95f);
            var material = bodyRenderer.material;   // per-avatar instance
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", tint);
            }
            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", tint);
            }
        }

        static string ClipToFixed(string text, int maxBytes)
        {
            string clipped = text ?? "";
            while (Encoding.UTF8.GetByteCount(clipped) > maxBytes && clipped.Length > 0)
            {
                clipped = clipped.Substring(0, clipped.Length - 1);
            }
            return clipped;
        }

        void OnGUI()
        {
            if (!IsSpawned)
            {
                return;
            }
            if (!viewCamera)
            {
                viewCamera = Camera.main;
                if (!viewCamera)
                {
                    return;
                }
            }
            Vector3 screen = viewCamera.WorldToScreenPoint(transform.position + Vector3.up * 2.1f);
            if (screen.z <= 0f)
            {
                return;
            }
            float x = screen.x;
            float y = Screen.height - screen.y;
            string label = displayName.Value.ToString();
            if (Time.time < emoteUntil)
            {
                label = $"{label}  ·  {emoteText}";
            }
            tagStyle ??= CozyGui.LabelStyle(14);
            Vector2 size = tagStyle.CalcSize(new GUIContent(label)) + new Vector2(18f, 8f);
            var rect = new Rect(x - size.x * 0.5f, y - size.y, size.x, size.y);
            CozyGui.PanelBox(rect, new Color(0.16f, 0.12f, 0.1f, IsOwner ? 0.35f : 0.55f));
            CozyGui.Label(rect, label, 14);
        }
    }
}
