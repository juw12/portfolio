#!/usr/bin/env python3
"""Build the Townsquare3D desktop app for the system this runs on (Windows or macOS).

    python -m pip install pyinstaller pillow pywebview
    python desktop/build.py [--require-installer]

Output in desktop/dist/ (the names the "apps" GitHub release uses):
  Windows  Townsquare3D-Windows-Setup.exe     per-user installer, no admin rights (needs Inno Setup 6)
           Townsquare3D-Windows-Portable.zip  unzip and run Townsquare3D.exe
  macOS    Townsquare3D-macOS-AppleSilicon.dmg or Townsquare3D-macOS-Intel.dmg (the chip of this Mac)
"""

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import zipfile

DESKTOP = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(DESKTOP)
BUILD = os.path.join(DESKTOP, "build")
DIST = os.path.join(DESKTOP, "dist")
ICON_SOURCE = os.path.join(APP, *"desktop/icon-512.png".split("/"))

WINDOWS_VERSION_INFO = """VSVersionInfo(
  ffi=FixedFileInfo(filevers={numbers}, prodvers={numbers}, mask=0x3f, flags=0x0, OS=0x40004,
                    fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('040904B0', [
      StringStruct('CompanyName', 'Juwen Lie'),
      StringStruct('FileDescription', 'Townsquare3D - A shared 3D world you can walk around in from phone or desktop'),
      StringStruct('FileVersion', '{version}'),
      StringStruct('InternalName', 'Townsquare3D'),
      StringStruct('LegalCopyright', 'Open source - github.com/juw12/portfolio'),
      StringStruct('OriginalFilename', 'Townsquare3D.exe'),
      StringStruct('ProductName', 'Townsquare3D'),
      StringStruct('ProductVersion', '{version}')])]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"""


def read_version():
    """The desktop shell's version: desktop/shell.json (the built app carries the same file)."""
    with open(os.path.join(DESKTOP, "shell.json"), encoding="utf-8") as handle:
        return json.load(handle)["version"]


def make_icon():
    """The app icon from the app's 512 px PNG: .ico on Windows, the PNG itself on macOS."""
    if sys.platform != "win32":
        return ICON_SOURCE
    from PIL import Image

    target = os.path.join(BUILD, "townsquare.ico")
    with Image.open(ICON_SOURCE) as image:
        image.convert("RGBA").save(target, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    return target


def run_pyinstaller(version, icon):
    env = dict(os.environ, TOWNSQUARE_VERSION=version, TOWNSQUARE_ICON=icon)
    if sys.platform == "win32":
        numbers = tuple(int(part) for part in (version.split(".") + ["0", "0", "0"])[:4])
        version_file = os.path.join(BUILD, "version_info.txt")
        with open(version_file, "w", encoding="utf-8") as handle:
            handle.write(WINDOWS_VERSION_INFO.format(numbers=numbers, version=version))
        env["TOWNSQUARE_VERSION_FILE"] = version_file
    subprocess.run(
        [
            sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
            "--distpath", DIST,
            "--workpath", os.path.join(BUILD, "pyinstaller"),
            os.path.join(DESKTOP, "townsquare.spec"),
        ],
        check=True,
        env=env,
    )


def zip_folder(folder, archive, root_name):
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for current, _dirs, files in os.walk(folder):
            for name in files:
                full = os.path.join(current, name)
                bundle.write(full, os.path.join(root_name, os.path.relpath(full, folder)))


def find_iscc():
    candidates = [
        shutil.which("iscc"),
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Inno Setup 6", "ISCC.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Inno Setup 6", "ISCC.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Inno Setup 6", "ISCC.exe"),
    ]
    return next((path for path in candidates if path and os.path.isfile(path)), None)


def package_windows(version, icon, require_installer):
    folder = os.path.join(DIST, "Townsquare3D")
    portable = os.path.join(DIST, "Townsquare3D-Windows-Portable.zip")
    zip_folder(folder, portable, "Townsquare3D")
    made = [portable]
    iscc = find_iscc()
    if not iscc:
        if require_installer:
            raise SystemExit("Inno Setup 6 (ISCC.exe) was not found - install it to build Townsquare3D-Windows-Setup.exe")
        print("Inno Setup 6 not found: skipped Townsquare3D-Windows-Setup.exe (the portable zip was built)")
        return made
    subprocess.run(
        [iscc, "/Qp", "/DAppVersion=" + version, "/DSourceDir=" + folder, "/DOutputDir=" + DIST,
         "/DIconFile=" + icon, os.path.join(DESKTOP, "townsquare.iss")],
        check=True,
    )
    return [os.path.join(DIST, "Townsquare3D-Windows-Setup.exe")] + made


def package_macos():
    app = os.path.join(DIST, "Townsquare3D.app")
    chip = "AppleSilicon" if platform.machine() == "arm64" else "Intel"
    image = os.path.join(DIST, "Townsquare3D-macOS-%s.dmg" % chip)
    stage = os.path.join(BUILD, "dmg")
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage)
    subprocess.run(["ditto", app, os.path.join(stage, "Townsquare3D.app")], check=True)  # keeps links and signature
    os.symlink("/Applications", os.path.join(stage, "Applications"))
    command = ["hdiutil", "create", "-volname", "Townsquare3D", "-srcfolder", stage, "-ov", "-format", "UDZO", image]
    # hdiutil sometimes fails with "Resource busy" while macOS scans the new volume (common on CI runners).
    for attempt in range(1, 6):
        if os.path.exists(image):
            os.remove(image)
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0:
            return [image]
        message = (result.stderr or result.stdout).strip() or "exit code %d" % result.returncode
        if attempt == 5:
            raise SystemExit("hdiutil create failed: %s" % message)
        print("hdiutil create failed (%s); trying again in %d s" % (message, 10 * attempt))
        time.sleep(10 * attempt)
    return [image]


def main():
    parser = argparse.ArgumentParser(description="Build the Townsquare3D desktop app for this system")
    parser.add_argument("--require-installer", action="store_true",
                        help="Windows: fail if Inno Setup is missing instead of building only the portable zip")
    args = parser.parse_args()
    if sys.platform not in ("win32", "darwin"):
        raise SystemExit("Townsquare3D desktop builds are made on Windows and macOS")
    try:
        import webview  # noqa: F401  (bundled by townsquare.spec)
    except ImportError:
        raise SystemExit("The Townsquare3D window needs pywebview: python -m pip install pywebview")

    version = read_version()
    os.makedirs(BUILD, exist_ok=True)
    for leftover in ("Townsquare3D", "Townsquare3D.app"):
        shutil.rmtree(os.path.join(DIST, leftover), ignore_errors=True)
    print("Building Townsquare3D %s for %s %s" % (version, platform.system(), platform.machine()))
    icon = make_icon()
    run_pyinstaller(version, icon)
    made = package_windows(version, icon, args.require_installer) if sys.platform == "win32" else package_macos()
    print("\nBuilt:")
    for path in made:
        print("  %s (%.1f MB)" % (path, os.path.getsize(path) / 1e6))


if __name__ == "__main__":
    main()
