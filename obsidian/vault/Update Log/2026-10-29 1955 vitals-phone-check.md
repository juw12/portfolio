# Update - vitals phone apps 1.2.0 (check the phone itself)

- When: 2026-10-29 19:55
- What: Opening Vitals on an iPhone or Android phone used to say "connect your computer". Now it checks the phone itself: Home is *This phone* with a Check my phone button, plain findings (storage, heat, battery health and drain, memory, slow-down under load, time for a restart) and one-tap links to the built-in steps that fix each one. A read-only native plugin (VitalsPhone) reads storage, memory, battery, heat and uptime, plus battery temperature, health and charge cycles on Android. In Safari or a phone browser it explains what websites can't read and still runs the speed test. Pairing with a computer stays available.
- Download: https://github.com/juw12/projects/releases/tag/vitals (`Vitals-Android.apk`, `Vitals-iPhone-unsigned.ipa`)
- Repos: juw12/projects (`apps/vitals/web`, `apps/vitals/mobile/native`, `scripts/apps.json`, `.github/workflows/vitals-apps.yml`; commits fa80aeb, 331ccf9, f543790), juw12/portfolio (card copy + notes), juw12/juw12 (profile line)
- Checks: CI installs the APK on an Android emulator and reads the plugin's storage, memory and battery through the WebView debugger and checks the home screen shows them; the iPhone build runs in the simulator and the job fails unless the app logs real phone readings (first attempt didn't — Capacitor couldn't find the plugin until the Swift class got the Objective-C name VitalsPhone); brain tests 75/75.
- Limits: tested on an emulator and simulator only, not yet on a real phone; the iPhone app is unsigned (sideload, re-sign every 7 days); no phone app can clean other apps' storage, so Vitals points to the phone's own tools.

## Notes

- [[Vitals]]
