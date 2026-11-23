# Townsquare 3D for Android

One full-screen window (Android's own WebView) around the web app (https://juw12.github.io/portfolio/townsquare-3d/): the same Townsquare 3D a phone
opens in its browser, with its own icon and no address bar. `MainActivity.java` adds what a plain WebView lacks:
Share, saving a file to Downloads, picking a file, and links to other sites opening in the browser. Because it
loads the live web app, every change to the site reaches the installed app on its next start; only a change to
this folder needs a new .apk.

Get it: [`Townsquare3D-android.apk`](https://github.com/juw12/portfolio/releases/download/townsquare-android/Townsquare3D-android.apk). Open the file on the phone and allow "install unknown apps" for your browser once.

| File | What it is |
| --- | --- |
| `app.json` | name, package id, version (raise `versionCode` and `versionName` when this folder changes), and the SHA-256 of the signing certificate |
| `AndroidManifest.xml`, `res/`, `assets/offline.html` | the app's manifest, icon and colours, the page shown when the first start has no connection |
| `src/.../MainActivity.java` | the whole program (the shell Jeda, Teduh, EarlyStar and Cairn use) |
| `build.py` | builds and signs the .apk without Gradle: aapt2, javac, d8, zipalign, apksigner |
| `smoke.py` | installs the .apk on an emulator, opens it and checks it stays up |

```
JAVA_HOME=<JDK 17> ANDROID_BUILD_TOOLS=<build-tools 34> ANDROID_JAR=<platform 34>/android.jar \
  python game/townsquare/android/build.py --keystore release.p12 --password-file release-password.txt --alias shells
```

`.github/workflows/townsquare-android.yml` does this on GitHub: it signs with the key in the repository's secrets,
checks the certificate is the one named in `app.json`, opens the app on an Android 14 emulator, and puts
`Townsquare3D-android.apk` on the `townsquare-android` release. The file there is replaced only when `versionName` in `app.json` is a
new one.

The signing key is not in this repository (its backup is the private `juw12/web-shells-signing`). Without `--keystore`
the build signs with a throwaway key, which is enough to try the app on your own phone.

Not checked: a real phone, and anything in the page that needs the camera, the microphone or a sign-in window
of another site. The emulator check cannot read the page inside a release build; it checks that the app
installs, opens its own window, stays up and does not crash, and keeps a screenshot.
