using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CozyFishing
{
    /// <summary>All controls in one place. Works with the new Input System and the legacy Input Manager.</summary>
    public static class CozyInput
    {
#if ENABLE_INPUT_SYSTEM
        static bool KeyDown(Key key) => Keyboard.current != null && Keyboard.current[key].wasPressedThisFrame;
        static bool KeyHeld(Key key) => Keyboard.current != null && Keyboard.current[key].isPressed;
#endif

        /// <summary>Left click / Space / Gamepad South.</summary>
        public static bool PrimaryPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return (Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame)
                    || KeyDown(Key.Space)
                    || (Gamepad.current != null && Gamepad.current.buttonSouth.wasPressedThisFrame);
#else
                return Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space);
#endif
            }
        }

        public static bool PrimaryHeld
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return (Mouse.current != null && Mouse.current.leftButton.isPressed)
                    || KeyHeld(Key.Space)
                    || (Gamepad.current != null && Gamepad.current.buttonSouth.isPressed);
#else
                return Input.GetMouseButton(0) || Input.GetKey(KeyCode.Space);
#endif
            }
        }

        /// <summary>Escape / Gamepad East - back to the island.</summary>
        public static bool BackPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return KeyDown(Key.Escape) || (Gamepad.current != null && Gamepad.current.buttonEast.wasPressedThisFrame);
#else
                return Input.GetKeyDown(KeyCode.Escape);
#endif
            }
        }

        /// <summary>Q / left shoulder - previous option.</summary>
        public static bool PrevPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return KeyDown(Key.Q) || (Gamepad.current != null && Gamepad.current.leftShoulder.wasPressedThisFrame);
#else
                return Input.GetKeyDown(KeyCode.Q);
#endif
            }
        }

        /// <summary>E / right shoulder - next option.</summary>
        public static bool NextPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return KeyDown(Key.E) || (Gamepad.current != null && Gamepad.current.rightShoulder.wasPressedThisFrame);
#else
                return Input.GetKeyDown(KeyCode.E);
#endif
            }
        }

        /// <summary>J / Gamepad North - journal.</summary>
        public static bool JournalPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return KeyDown(Key.J) || (Gamepad.current != null && Gamepad.current.buttonNorth.wasPressedThisFrame);
#else
                return Input.GetKeyDown(KeyCode.J);
#endif
            }
        }

        /// <summary>F - start / pause the focus timer.</summary>
        public static bool FocusTogglePressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return KeyDown(Key.F);
#else
                return Input.GetKeyDown(KeyCode.F);
#endif
            }
        }

        /// <summary>M - toggle the small corner window.</summary>
        public static bool MiniWindowPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return KeyDown(Key.M);
#else
                return Input.GetKeyDown(KeyCode.M);
#endif
            }
        }

        /// <summary>Number row or numpad, 1..9.</summary>
        public static bool NumberPressed(int number)
        {
            if (number < 1 || number > 9)
            {
                return false;
            }
#if ENABLE_INPUT_SYSTEM
            return KeyDown((Key)((int)Key.Digit1 + number - 1))
                || KeyDown((Key)((int)Key.Numpad1 + number - 1));
#else
            return Input.GetKeyDown(KeyCode.Alpha1 + (number - 1))
                || Input.GetKeyDown(KeyCode.Keypad1 + (number - 1));
#endif
        }

        /// <summary>Right mouse button went down this frame (walk / camera orbit).</summary>
        public static bool SecondaryPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return Mouse.current != null && Mouse.current.rightButton.wasPressedThisFrame;
#else
                return Input.GetMouseButtonDown(1);
#endif
            }
        }

        /// <summary>Right mouse button released this frame.</summary>
        public static bool SecondaryReleased
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return Mouse.current != null && Mouse.current.rightButton.wasReleasedThisFrame;
#else
                return Input.GetMouseButtonUp(1);
#endif
            }
        }

        /// <summary>V - village menu.</summary>
        public static bool VillageMenuPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return KeyDown(Key.V);
#else
                return Input.GetKeyDown(KeyCode.V);
#endif
            }
        }

        /// <summary>Emotes: 0 = Z (wave), 1 = X (sit), 2 = C (cheers).</summary>
        public static bool EmotePressed(int index)
        {
#if ENABLE_INPUT_SYSTEM
            switch (index)
            {
                case 0: return KeyDown(Key.Z);
                case 1: return KeyDown(Key.X);
                case 2: return KeyDown(Key.C);
                default: return false;
            }
#else
            switch (index)
            {
                case 0: return Input.GetKeyDown(KeyCode.Z);
                case 1: return Input.GetKeyDown(KeyCode.X);
                case 2: return Input.GetKeyDown(KeyCode.C);
                default: return false;
            }
#endif
        }

        /// <summary>Pointer position in screen pixels (origin bottom-left).</summary>
        public static Vector2 PointerPosition
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero;
#else
                return Input.mousePosition;
#endif
            }
        }

        public static Ray PointerRay(Camera camera) => camera.ScreenPointToRay(PointerPosition);
    }
}
