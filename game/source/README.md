# Cozy Fishing – starter kit (Blender → Unity)

## 1. Generate the island in Blender (4.x recommended)
1. Open Blender → **Scripting** tab → **Open** → `blender/cozy_fishing_scene.py` → **Run Script**.
2. It builds a low-poly island: cabin with glowing windows, wooden dock, lanterns, rowboat,
   rod + bobber, pines/round trees, bushes, flowers, lily pads, fireflies, distant mountains,
   golden-hour sun, pastel gradient sky and a tilt-shift camera.
3. Outputs go to `exports/`: `cozy_fishing.blend` and `cozy_fishing.fbx`.
   Run headless to also get a render: `blender -b --python cozy_fishing_scene.py`.
4. Change `SEED` (top of the script) for a different island layout; the other constants
   (dock length, island radius, tree count...) are all at the top too.

Viewport tip: press **Z → Rendered** to see the lighting, or **F12** for a render.

## 2. Unity project (Unity 6 LTS, URP)
1. Unity Hub → New project → **Universal 3D** template.
2. Copy `unity/Scripts/` into `Assets/CozyFishing/Scripts/`.
3. Drag `exports/cozy_fishing.fbx` into `Assets/`. In the import inspector:
   *Materials* tab → **Extract Materials** (base colours come across; re-tick **Emission**
   on `WindowGlow`, `LanternGlow`, `Firefly` and set HDR intensity ~3–6 so Bloom picks them up).
   Set the `Water` material to **Surface Type: Transparent**, or swap in a stylized water shader.
4. Drag the model into the scene. Blender lights are not exported – recreate them:
   * Directional Light: colour `#FFC68C`, intensity ~1.5, low angle (~15–20°), soft shadows.
   * Point lights at the lanterns / porch: colour `#FFB066`, range 5–6, intensity 2–4.
   * Lighting window → Environment: **Gradient** sky – Sky `#8FA8E0`, Equator `#F5C4C0`, Ground `#7A6A5A`.
   * Fog: Exponential, colour `#F2C2A8`, density ~0.01 (gives that soft, hazy depth).
5. **Global Volume** (post-processing – this is 80% of the "cozy Steam game" look):
   * Tonemapping: Neutral (or ACES)
   * Bloom: threshold 0.9, intensity 0.6, scatter 0.7
   * Color Adjustments: post exposure +0.2, contrast +10, saturation +10
   * White Balance: temperature +15
   * Vignette: 0.25, smoothness 0.4
   * Depth of Field: Bokeh, focus on the dock – gentle miniature/tilt-shift feel
   * Enable **Post Processing** on the camera.

## 3. Hook up fishing
1. Create an empty **Player** at the `PlayerSpot` marker; rotate it so its blue (Z) arrow
   points out over the water toward `FishingSpot`. Add **FishingController**.
2. Assign:
   * **Rod Tip** → the `RodTip` empty inside the imported model
   * **Bobber** → the `Bobber` mesh from the model (delete the static `FishingLine` mesh)
   * **Fishing Line** → add a `LineRenderer` (width 0.01, unlit white material)
   * **Splash Fx** (optional) → small ParticleSystem, Emission rate 0, white/teal droplets
   * **Sfx Source** → AudioSource on the Player (Spatial Blend ~0.7)
   * **Reel Loop Source** → second AudioSource with a soft reel-click loop
3. Main Camera → add **CozyCameraRig**, target = Player. Right-drag orbit, scroll zoom.
4. Rowboat / lily pads → add **FloatingBob**.
5. Empty "Ambience" → add **AmbientSoundscape**, fill in loops and one-shots (below).

Gameplay: click/Space to cast → wait (nibbles are fake-outs!) → click on the big dip →
hold to reel, release when the tension bar goes red. Rarer fish fight harder.

## 4. ASMR sound list
Loops (2D, AmbientSoundscape.loops): gentle water lapping on wood, soft wind in leaves,
distant crickets / evening insects, very quiet fireplace crackle near the cabin.
One-shots (3D, AmbientSoundscape.oneShots): songbirds, frog croaks, dock wood creaks,
wind chimes, a far-off loon, fish jumping.
Fishing SFX: rod whoosh, bobber "plop", tiny tick for nibbles, splash for bite, reel clicks
(loop), line snap, small happy chime for a catch.

Sources: freesound.org (filter **CC0**), Sonniss GDC free bundles, Pixabay sound effects.
ASMR mixing tips: close-mic'd, soft transients; low-pass anything harsh (~10–12 kHz);
keep peaks around −12 dB; randomize pitch ±5–8% so repeats never sound identical;
add a small Audio Reverb Zone around the dock.

## 5. Nature activities for laptop breaks
Every activity fits in a 5-minute break. Nothing can fail and nothing dies.

| Key | Activity | What you do | Why it helps |
|---|---|---|---|
| 1 | Fishing | cast, wait, reel | slow, rhythmic, no pressure |
| 2 | Garden | plant before work, water at the break, harvest later (real-time growth, 5–90 min) | rewards coming back; plants grow while you work |
| 3 | Tea Porch | pick a tea, then breathe along with the circle while it steeps (4-7-8, box or 4-2-6) | ~1 min of guided breathing |
| 4 | Birdwatching | birds visit the feeder/fence; click to photograph; fill the journal (J) | gentle attention, collection |
| 5 | Sunset Viewpoint | 20 s horizon eye rest (20-20-20 rule) + 1-min desk stretch routine | eye strain, neck/wrist tension |

**Focus timer (F):** a 25/5 Pomodoro with a long break every 4 sessions. Each finished session earns a
Moonflower seed (the rare 90-minute plant) and suggests a break activity. During focus it also sends a 20-20-20 reminder.
**M** shrinks the game to a 480×270 window, so it can sit in a corner while you work (it keeps running in the background).
**J** in explore mode opens the cozy journal (fish, harvests, cups of tea, photos, focus sessions, mindful minutes).

### Unity hookup (markers come from the FBX)
1. Empty **Island** → add `ActivityHub` (Camera Rig = Main Camera's CozyCameraRig) and `FocusBreakTimer`.
2. Add one activity component per area, set **Camera Focus / Camera From**, then list them in the hub in key order:
   * `FishingActivity` → Fishing = Player's FishingController, Cast Toward = `FishingSpot`;
     focus `PlayerSpot`, from `FishingCameraFrom`
   * `GardenActivity` → add `GardenPlot` to `GardenPlot_0..5` and drag them into **Plots**; focus `GardenCenter`
   * `TeaBreathingActivity` → focus `TeaSpot`, from `TeaCameraFrom`; optional steam particles on the kettle/cup
   * `BirdwatchActivity` → **Perches** = `BirdPerch_0..5`; focus `FeederSpot`, from `BirdCameraFrom`
   * `ViewpointActivity` → focus `ViewpointSpot`, from `ViewpointCameraFrom`
3. Add `ActivityStation` to `PlayerSpot`, `GardenCenter`, `TeaSpot`, `FeederSpot` and `ViewpointSpot`, and set
   each one's **Activity**. This makes them clickable in explore mode.
4. Assign a URP/Lit material to **Plant Material Template** and **Bird Material Template**. Without it, the placeholder
   plants and birds can turn pink in builds (Unity strips shaders it can't find).
5. If a marker imported rotated, reset its rotation; plots build world-aligned anyway.

Extra sounds: seed-in-soil pat, water pour loop, harvest pop, kettle hum, pour, sip, soft singing bowl
(inhale/exhale cues), camera shutter, bird songs per species, gentle chimes for the timer and stretches.

## 6. Shared village: claim a plot, invite friends, co-op + visits
The island has **4 claimable homesteads** (fence, 2 raised beds = 4 planting spots, name sign, mailbox).

**How friends join (one code does everything):**
1. Create a village (V menu), then click a free homestead's **sign** to claim it.
2. Click your sign again, choose **Create invite code**, and send your friend the 6-letter code (e.g. `K7QX2M`).
3. Your friend enters it under **Have an invite code?** and becomes your **plot-mate** (also a villager, and free to claim their own homestead).
4. From then on there's no more code typing:
   * **Live co-op:** anyone presses **Play together now**, and others see **Join [name] live** in their menu.
     You see each other walking around (right-click to walk), with name tags and emotes (Z wave, X sit, C cheers).
   * **Visits:** if nobody is hosting, friends can still open the village and water, plant and leave notes.
     When you come back: *"While you were away: Mika watered the Tulip · 2 new notes"*.

| | Owner | Plot-mate (used your code) | Villager |
|---|---|---|---|
| Plant / harvest | yes | yes | no |
| Water | yes | yes | yes (neighbourly help) |
| Leave mailbox notes | yes | yes | yes |
| Invite / remove plot-mates | yes | can leave | no |

Codes expire after 48 h or 5 uses, and **New code** revokes the old one. Every rule is enforced on the server.

### Browser version: play together today (no accounts, Python only)
The browser game (`app/CozyIsland.html`) has its own tiny village server in `server/village_server.py`
(Python standard library only, no installs).

1. Double-click **`StartVillageServer.bat`**. It builds the game, starts the server on port 8787
   and opens http://localhost:8787. Keep the black window open while friends play.
   (Double-clicking `app/CozyIsland.html` still works, but then it's offline/single-player.)
2. Walk to a free homestead sign, claim it, then click your sign: **Copy invite link** (or read out the 6-letter code).
3. Friends open the link (it ends in `?join=CODE`) or paste the code into **Have an invite code?**
   They become your plot-mate; the "Village online" list (bottom-right) shows who's here, and their little villager walks around your island.

**Where friends can connect from**
* **Same Wi-Fi / office:** the server prints a LAN address such as `http://192.168.1.23:8787` and the invite link uses it automatically.
  On the first run Windows Firewall asks for permission: allow **Private networks** only.
* **Over the internet:** run a tunnel next to the server, e.g. `cloudflared tunnel --url http://localhost:8787`,
  then restart the server with `set PUBLIC_URL=https://your-tunnel-address` so invite links use that address.
  Or deploy `village_server.py` to any small always-on Python host (set `PORT`, `PUBLIC_URL`, and `COZY_DATA` for the save file).
* **Async visits while you're offline** need the server to keep running: your PC stays on, or use a hosted server.

**Rules (enforced by the server):** owner and plot-mates plant, water and harvest; visitors may only water and leave notes;
notes are visible only to the owner and plot-mates; **New code** revokes the old code. Plants grow on server time, so they keep growing while everyone is away.
Village state is saved in `server/village_data.json`.

**Limits:** 4 homesteads; no passwords: your identity is a secret stored in the browser, so clearing site data or switching browser makes you a new villager;
updates poll every ~1.5 s (not instant sockets); fishing, birds and tea stay local to each player.
It is fine for friends but **not hardened for the open internet** (no rate limiting or moderation), so only share links with people you trust.

### Setup (Unity Gaming Services, free tier to start)
1. **Link the project:** Edit > Project Settings > Services, pick or create a cloud project.
   In the Unity Cloud dashboard, enable **Authentication (Anonymous)**, **Cloud Code**, **Cloud Save** and **Relay**.
2. **Packages** (Package Manager): `com.unity.services.multiplayer`, `com.unity.netcode.gameobjects`, `com.unity.services.cloudcode`
   (these pull in Authentication, Core and Newtonsoft Json).
3. **Deploy the server module** in `cloudcode/CozyVillage` (needs the .NET 8 SDK):
   * First change `InvitePepper` in `VillageModule.cs` to a long random string.
   * `cd cloudcode/CozyVillage`, then `dotnet new sln -n CozyVillage` and `dotnet sln add CozyVillage.csproj`
   * In Unity: Create > Services > Cloud Code C# Module Reference, point it at `CozyVillage.sln`,
     then Window > Unity Services > **Deployment** > Deploy. (Or package with `dotnet publish -c Release -r linux-x64` and use the UGS CLI.)
4. **Scene:**
   * Root GameObject **Services** with `VillageClient` + `LiveSessionManager`.
   * **NetworkManager** (Unity Transport). Player Prefab = avatar: capsule (no collider, or trigger only) +
     `NetworkObject` + `OwnerNetworkTransform` + `NetworkPlayerAvatar` (assign Body Renderer).
   * Any scene object with `NetworkObject` + `VillageNetSync`.
   * Enable **Generate Colliders** on the FBX import so right-click walking can find the ground.
   * Add `VillagePlot` to each `Homestead_N_Center` (Plot Index N; Beds = `Homestead_N_Bed_0..3`;
     Sign/Mailbox = `Homestead_N_Sign` / `_Mailbox`).
   * Add `VillageActivity` (list the 4 VillagePlots, assign a URP/Lit plant material) to the ActivityHub list,
     plus an `ActivityStation` on a homestead centre so it's clickable.
5. **Testing two players on one PC:** run the editor plus a build, or two builds with `-profile alice` / `-profile bob`
   (each profile is a separate anonymous player).

### Limits to know
* **Anonymous sign-in is per device.** Clearing data or switching PC makes a new player. Before release,
  link Steam or Unity Player Accounts in Authentication.
* Live co-op shares avatars and plots. Fishing, birds and the tea porch stay local to each player (cozy side-by-side play).
* Not yet built: releasing or transferring a homestead, moderation and reporting for notes, and per-player rate limits on
  code guesses (the 48 h / 5-use expiry plus the large code space are the current protection).

## 7. Seasons + fish journal (browser version)
The island follows the real calendar (northern hemisphere: Mar-May spring, Jun-Aug summer, Sep-Nov autumn, Dec-Feb winter).
Press **S** on the island to pick a season yourself (Calendar → Spring → Summer → Autumn → Winter → Calendar); the choice is saved.

| Season | Island | Falling | New fish | Seasonal seed |
|---|---|---|---|---|
| Spring | blossom trees, fresh grass | petals | Crappie, Cherry Salmon, Northern Pike ★★, Golden Trout ★★ | Strawberry (20 min) |
| Summer | lush green, fireflies | dandelion fluff | Largemouth Bass, Pufferfish, Catfish ★★, Mahi-mahi ★★ | Watermelon (40 min) |
| Autumn | orange/red leaves, golden grass | leaves | Common Carp, Brown Trout, Sockeye Salmon, Sturgeon ★★ | Pumpkin (45 min) |
| Winter | snow, snow-capped pines | snow | Whitefish, Smelt, Arctic Char, Burbot ★★, Aurora Koi ★★★ | Snowdrop (10 min) |

Bluegill, Perch, Rainbow Trout and the legendary Golden Koi bite all year (21 species in total).
Rarity sets bite chance and fight: common, ★ uncommon, ★★ rare, ★★★ legendary.
Press **J** while fishing for the fish journal (caught count, personal-best weight, which fish are biting now).
Seasonal seeds can only be planted in their season; anything already planted keeps growing when the season changes.
Season is personal: friends on the village server may be in a different season if they picked one with S.

## 8. Day & night, campfire cooking, Mochi the cat (browser version)
**Day & night.** The island follows your laptop clock: morning light, bright midday, the golden sunset, then a starry night
with glowing lanterns and windows. Press **N** to pick a time yourself (Clock → Morning → Day → Sunset → Night → Clock).
Birds sing by day; crickets, frogs and the occasional owl take over at night.
Night fish (Catfish, Burbot, Aurora Koi) bite about 3× as often after dark.

**Campfire cooking (7).** A campfire with a hanging pot sits beside the cabin. Every fish you catch and every crop you harvest
goes into your pantry (players who already had catches get up to 3 of each to start). Q/E picks a recipe, click to start,
click 4× to chop, then **hold to fan the fire** and keep the flame in the green zone until the dish is done (no failing,
just ★ to ★★★). J opens the cookbook.

| Recipe | Needs |
|---|---|
| Campfire Grilled Fish | any fish |
| Tomato Fish Stew | any fish + tomato |
| Cedar-Plank Salmon | Cherry Salmon (spring) or Sockeye Salmon (autumn) |
| Pumpkin Soup | pumpkin (autumn seed) |
| Skillet Strawberry Cake | strawberry (spring seed) |
| Grilled Watermelon Skewers | watermelon (summer seed) |
| Toasted Sunflower Seeds | sunflower |
| Fish Treat for Mochi | a common fish |

**Mochi, the dock cat.** She sits next to your fishing stool. Click her to pet her (purring + hearts); she gets excited
when a fish bites, meows at your catches, naps at night, and loves the fish treats you cook. Friendship (up to ♥♥♥♥♥)
grows with pets and treats and shows in the J journal.

## 9. Soft rainy days + gifts through the mailbox (browser version)
**Rain.** The island has a gentle forecast that changes every 3 hours (same for everyone on the same day; spring and
autumn are the rainiest, summer the driest). Press **R** to choose: Forecast → Rain → Clear → Forecast. While it rains:
* the sky and water turn soft grey, rain streaks fall and ripples dot the lake (in winter it becomes a quiet snowy spell);
* a soft rain loop plays, with heavier, woodier drips and patter when you are near the cabin (tea porch, campfire),
  plus a very rare far-away rumble;
* **fish bite up to 40 % sooner** and rare/legendary fish are 1.5× as likely (the fishing HUD shows "rain: quicker bites");
* the rain **waters your own garden** for you, and Mochi curls up for a nap.

**Gifts (village server only).** Every fish, crop and dish you make goes into your pantry. In the Village (6), click a
friend's mailbox → **Wrap & send a present**: pick something from your pantry, add a short note (80 characters) and send.
When a present arrives a little parcel appears on *your* mailbox; click it → **Open** to put the item into your pantry
(cook it, or feed the fish to Mochi). Presents are private to the recipient, each inbox holds up to 30 unopened gifts, and
sent/received counts show in the J journal.
Limit: the server checks names and kinds, but it trusts your browser that you really owned the item — fine among friends.

## 10. Rainbows, seasonal birds, Mochi visits friends (browser version)
**Rainbows.** When a daytime shower ends, a soft rainbow (with a faint second bow) arches over the lake for about
4 minutes, always opposite the sun — turn the camera away from the sun to see it. Rainbows you've seen are counted
in the J journal. (Test it any time with `?rainbow=1`.)

**Seasonal birds (4).** The feeder now has 12 species. New visitors: Barn Swallow (spring & summer), Hummingbird
(summer), Blue Jay (autumn), Waxwing (autumn & winter), Snow Bunting (winter) and a Barn Owl that only comes after dark
(it hoots instead of singing). Birds shelter from the rain, so they visit less often while it pours. The bird journal
(J) shows when each species comes and highlights the ones around right now.

**Mochi visits friends (village server).** Click a friend's homestead sign → **Send Mochi over for a nap**. Your dock is
empty while she's away; she naps by your friend's mailbox for 10 minutes, where everyone in the village can see her and
click to give chin scratches (you get a little note when they do). Then she trots home with a souvenir for your pantry —
something from your friend's garden, or a small fish from their dock — and tells you who petted her. One visit at a time,
one visiting cat per homestead. If your friend wasn't online when she arrived, they're told as soon as they open the game.

## 11. Desk mode: a tiny island beside your work (D)
Press **D** (or use the hint in the explore panel) and the island shrinks into a little window you keep next to your
spreadsheet or code:
* **Chrome / Edge:** it opens as a small **always-on-top floating window** (Document Picture-in-Picture, ~520×300,
  resizable). It keeps animating even if you minimise the main tab.
* **Other browsers:** the same compact view stays in the tab — make the browser window small and park it beside your work.

What happens in desk mode:
* A low view of the dock: your angler with a line in the water, Mochi beside you, the boat, the island behind — with the
  real weather, time of day, rain and rainbows.
* **Lazy fishing:** every 45–120 s (sooner in the rain) something nibbles — a gentle splash and a "Nibble! Click to reel"
  ping. Click within 12 s to land it (it goes to your journal and pantry like any catch). Miss it? Another comes along.
* **Focus button:** start/pause the 25-minute focus timer right from the little window; eye-rest and break reminders show there.
* Click Mochi to pet her. Gardens keep growing, friends' visits and presents still arrive (toasts appear in the window).
* **Low power:** ~20 fps, 1× resolution and shadows refreshed once a second.
* **Open island** (or D / Esc) brings the full view back.

## 12. Next cozy upgrades
* Stylized water shader (depth colour, foam ring around the shore and the bobber)
* Friends' cats visit *you* on their own sometimes; a cat bed you can craft for visitors
* Photograph rainbows and the owl for a "rare moments" photo album
* Swap OnGUI HUD for UI Toolkit with rounded panels and a hand-written font
