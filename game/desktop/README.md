# CozyIsland for Windows and Mac

A small native window around the live site (https://juw12.github.io/portfolio/cozy-island/): Microsoft Edge WebView2 on Windows, the system
WebKit on macOS, both through [pywebview](https://pywebview.flowrl.com/). The window keeps its own browser data
(what you saved in it), so it is all still there the next time CozyIsland opens. Because it loads the live
site, every push to `main` reaches the installed app on its next start; only a change to this folder needs a new build.

| File | What it is |
| --- | --- |
| `game_app.py` | the program: one window, remembers its size, a second start brings the open window forward |
| `shell.json` | the shell's version (bump it when this folder changes) |
| `build.py` | builds the app for the system it runs on |
| `game.spec`, `game.iss` | PyInstaller recipe, Windows installer (Inno Setup 6, per user, no admin rights) |
| `smoke_test.py` | opens the built app and checks its window shows CozyIsland |
| `offline.html` | shown when the site cannot be reached on the very first start |

```
python -m pip install pyinstaller pillow pywebview
python desktop/build.py
python desktop/smoke_test.py --built --local-site
```

`.github/workflows/game-desktop.yml` does the same on Windows, an Apple-chip Mac and an Intel Mac, installs and uninstalls
the Windows setup, and publishes the files that passed to the
[game-desktop release](https://github.com/juw12/portfolio/releases/tag/game-desktop). The download links never change.
