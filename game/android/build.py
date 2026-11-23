#!/usr/bin/env python3
"""Build the Android app in this folder without Gradle: aapt2, javac, d8, zipalign, apksigner.

    python android/build.py --keystore PATH.p12 --password-file PATH.txt [--alias NAME]

Needs three things, named by environment variables:
    JAVA_HOME            a JDK 17 (https://adoptium.net)
    ANDROID_BUILD_TOOLS  the folder of Android build-tools 34 (aapt2, d8, zipalign, apksigner)
    ANDROID_JAR          android.jar of platform 34
Without --keystore the app is signed with a throwaway key: fine to try on your own phone, useless as
an update of the published app. The result is android/dist/<Name>-android.apk.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))


def run(*command):
    print("+", " ".join(os.path.basename(part) if index == 0 else part for index, part in enumerate(command)), flush=True)
    subprocess.run(command, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keystore")
    parser.add_argument("--password-file")
    parser.add_argument("--alias", default="release")
    args = parser.parse_args()
    for name in ("JAVA_HOME", "ANDROID_BUILD_TOOLS", "ANDROID_JAR"):
        if not os.environ.get(name):
            raise SystemExit("Set %s (see the top of this file)" % name)
    java_bin = os.path.join(os.environ["JAVA_HOME"], "bin")
    tools = os.environ["ANDROID_BUILD_TOOLS"]
    android_jar = os.environ["ANDROID_JAR"]
    os.environ["PATH"] = java_bin + os.pathsep + os.environ["PATH"]
    with open(os.path.join(HERE, "app.json"), encoding="utf-8") as handle:
        app = json.load(handle)

    work = os.path.join(HERE, "build")
    dist = os.path.join(HERE, "dist")
    shutil.rmtree(work, ignore_errors=True)
    for folder in ("gen", "classes", "dex"):
        os.makedirs(os.path.join(work, folder))
    os.makedirs(dist, exist_ok=True)

    resources = os.path.join(work, "resources.zip")
    run(os.path.join(tools, "aapt2"), "compile", "--dir", os.path.join(HERE, "res"), "-o", resources)
    unsigned = os.path.join(work, "unsigned.apk")
    run(os.path.join(tools, "aapt2"), "link", "-o", unsigned, "-I", android_jar,
        "--manifest", os.path.join(HERE, "AndroidManifest.xml"), "--java", os.path.join(work, "gen"),
        "-A", os.path.join(HERE, "assets"),
        "--min-sdk-version", str(app["minSdk"]), "--target-sdk-version", str(app["targetSdk"]),
        "--version-code", str(app["versionCode"]), "--version-name", app["versionName"], resources)

    sources = []
    for root in (os.path.join(HERE, "src"), os.path.join(work, "gen")):
        for folder, _, files in os.walk(root):
            sources += [os.path.join(folder, name) for name in files if name.endswith(".java")]
    run(os.path.join(java_bin, "javac"), "-source", "8", "-target", "8", "-Xlint:-options", "-bootclasspath", android_jar,
        "-d", os.path.join(work, "classes"), *sources)
    classes = []
    for folder, _, files in os.walk(os.path.join(work, "classes")):
        classes += [os.path.join(folder, name) for name in files if name.endswith(".class")]
    run(os.path.join(tools, "d8"), "--release", "--lib", android_jar, "--min-api", str(app["minSdk"]),
        "--output", os.path.join(work, "dex"), *classes)
    with zipfile.ZipFile(unsigned, "a", zipfile.ZIP_DEFLATED) as archive:
        archive.write(os.path.join(work, "dex", "classes.dex"), "classes.dex")

    aligned = os.path.join(work, "aligned.apk")
    run(os.path.join(tools, "zipalign"), "-f", "-p", "4", unsigned, aligned)
    keystore, password_file, alias = args.keystore, args.password_file, args.alias
    if not keystore:
        keystore = os.path.join(work, "throwaway.p12")
        password_file = os.path.join(work, "throwaway.txt")
        alias = "throwaway"
        with open(password_file, "w", encoding="utf-8") as handle:
            handle.write("throwaway-key")
        run(os.path.join(java_bin, "keytool"), "-genkeypair", "-keystore", keystore, "-storetype", "PKCS12",
            "-storepass:file", password_file, "-alias", alias, "-keyalg", "RSA", "-keysize", "2048",
            "-validity", "30", "-dname", "CN=throwaway")
        print("No --keystore: signed with a throwaway key.")
    result = os.path.join(dist, "%s-android.apk" % app["name"])
    run(os.path.join(tools, "apksigner"), "sign", "--ks", keystore, "--ks-type", "PKCS12", "--ks-key-alias", alias,
        "--ks-pass", "file:" + password_file, "--out", result, aligned)
    run(os.path.join(tools, "apksigner"), "verify", "--verbose", "--print-certs", result)
    if os.path.exists(result + ".idsig"):
        os.remove(result + ".idsig")
    print("Built %s (%d bytes)" % (result, os.path.getsize(result)))


if __name__ == "__main__":
    sys.exit(main())
