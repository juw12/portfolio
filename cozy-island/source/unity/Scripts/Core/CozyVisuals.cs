using System.Collections.Generic;
using UnityEngine;

namespace CozyFishing
{
    /// <summary>
    /// Builds simple primitive placeholder models (plants, birds) until you swap in real art.
    /// Assign a template material (e.g. a URP/Lit material) so the shader is included in builds.
    /// </summary>
    public static class CozyVisuals
    {
        static readonly Dictionary<(int, Color), Material> cache = new Dictionary<(int, Color), Material>();

        public static Material MaterialFor(Color color, Material template = null)
        {
            var key = (template ? template.GetInstanceID() : 0, color);
            if (cache.TryGetValue(key, out var material) && material)
            {
                return material;
            }

            if (template)
            {
                material = new Material(template);
            }
            else
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Lit");
                if (shader == null)
                {
                    shader = Shader.Find("Standard");
                }
                material = new Material(shader);
            }
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", color);
            }
            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", color);
            }
            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", 0.15f);
            }
            cache[key] = material;
            return material;
        }

        public static Transform Part(
            PrimitiveType type,
            Transform parent,
            Vector3 localPosition,
            Vector3 localScale,
            Color color,
            Material template = null,
            Quaternion? localRotation = null)
        {
            var part = GameObject.CreatePrimitive(type);
            var collider = part.GetComponent<Collider>();
            if (collider)
            {
                Object.Destroy(collider);
            }
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localRotation = localRotation ?? Quaternion.identity;
            part.transform.localScale = localScale;
            part.GetComponent<Renderer>().sharedMaterial = MaterialFor(color, template);
            return part.transform;
        }
    }
}
