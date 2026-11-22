# Matma — a timed arithmetic game for kids

A tiny, dependency-free maths game in Polish, made for young children (~5 years old).
Solve 20 sums in a row, each one against the clock. Every right answer adds one part to a
3D space rocket. A complete rocket blasts off into space; an unfinished one crashes and burns.
Pure static HTML/CSS/JS — no backend, no build step. Same shape as the
[Słówka](https://github.com/tb-x/slowka) word game.

## What's inside

| File | What it does |
| --- | --- |
| `index.html` | The page |
| `styles.css` | All the styling |
| `game.js` | Game logic, including the task generator |
| `rocket.js` | The 3D rocket: its 20 parts, the blast-off and the crash |
| `haptics.js` | Phone vibration for game events |
| `assets/voice/`, `assets/sfx/` | Recorded voice and sound effects (see Sound and voice) |
| `manifest.webmanifest`, `icon.svg`, `icon-*.png` | The Home Screen name and icon |
| `sw.js` | Keeps a copy of the game so it works offline |
| `.nojekyll` | Tells GitHub Pages to serve the files as-is |

## How the game works

- **20 tasks, one after another, 20 rocket parts.** Each right answer drops the next part
  onto the launch pad with a bounce and a sparkle. A faint silhouette shows the whole rocket,
  so the child can see how much is left, and a badge counts `🚀 12 / 20`.
- **Win = all 20 parts.** A 3-2-1 countdown, the sky turns to night, engines fire and the
  rocket flies off the top of the screen. Trophy counter in the corner, confetti at the end.
- **Time runs out = the rocket launches anyway.** Unfinished, it sputters, hops, tips over,
  explodes, and the pieces scatter and keep burning behind the end card.
  With no parts at all there is nothing to blow up, so the end card simply appears.
- **The rocket can be turned by hand.** Dragging rotates it, a quick flick sets it spinning,
  and a tap spins it toward the tapped side. Holding a finger on it stops it. After three
  seconds without a touch it eases back into its slow automatic spin (`AUTO_SPIN` and `IDLE`
  in `rocket.js`).
- **Difficulty ramps in three steps** (edit `LEVELS` in `game.js` to change it):

  | Tasks | Kind | Example | Time |
  | --- | --- | --- | --- |
  | 1–7 | adding, both numbers 1–5 | `2 + 3` | 12 s |
  | 8–14 | adding up to 20, or subtracting with a result ≥ 0 | `5 + 12`, `14 - 6` | 18 s |
  | 15–20 | subtracting below zero, or adding up to 30 | `5 - 7` | 25 s |

- **The clock is a shrinking bar**, not a number — it goes green → orange → red and blinks
  at the end. Only running out of time ends the game.
- **A wrong answer does not end the game.** The box shakes, clears, and the child can try
  again while there is still time. At five, a slip of the finger shouldn't cost the whole run.
- **Opening the help panel pauses the clock.**
- **🏠 in the top-left corner** goes back to the list of all games.
- **Losing shows the right answer** and how many parts the rocket had, with a friendly
  "Nie szkodzi!".

## The rocket

`rocket.js` is a tiny self-written 3D renderer on a 2D `<canvas>`, so there is still no
library and no build step. Each part is a small mesh (lathed cylinders and cones, flat fins,
a sphere) that is rotated, projected with perspective, sorted back to front and flat-shaded.
Flames, smoke and sparkles are simple 2D particles. The 20 parts, bottom to top:

nozzle · engine · tank · red band · 4 fins · tank · 2 side boosters · window · blue band ·
tank · window · cabin · yellow ring · nose cone · antenna · light

To change the order or the look, edit `buildParts()` in `rocket.js`. The number of tasks in
a game must match the number of parts.

## Sound and voice

The game talks in Polish with a recorded voice (ElevenLabs "Jessica") and has sound effects. Sound starts with the
"Gramy!" tap, and the iPhone silent switch mutes it.

- **Every task is read aloud** when it appears, pieced together from recorded words: "Pięć. Plus. Siedem. Ile to jest?"
  (numbers 0–30, plus, minus). The first one starts with "Gotowi?". **Tapping the task** reads it again.
- **A right answer**: a two-note chime, the praise shown on screen said aloud ("Super!", "Tak jest!"…), and a metal
  clunk as the rocket part lands; the next task is read once the praise is finished.
- **A wrong answer**: a soft boop and "Spróbuj jeszcze raz", sometimes "Dasz radę!", or "Prawie!" when the answer was
  one off. The on-screen message says the same.
- **The time bar turning red** gives a quick beep, and "Czas ucieka!" (at most once every 30 seconds).
- **Blast-off**: a tick and "Trzy! Dwa! Jeden!", "Start!" with the launch roar, then a confetti pop and
  "Brawo! Rakieta poleciała w kosmos!".
- **Crash**: the rocket sputters, boings and goes poof, then "Ojej! Rakieta się przewróciła." (or "Prawie się udało!"
  from 15 parts on) and "Nie szkodzi!" with the end card.
- If a clip can't load (no internet on the first visit), the browser's own Polish voice says that line, and each
  effect falls back to a simple synthesized sound.

Sound knobs, at the top of the sound section in `game.js`:

| Knob | Default | What it does |
| --- | --- | --- |
| `READ_TASKS` | `true` | Read every new task aloud |
| `HURRY_GAP` | 30 s | "Czas ucieka!" at most once in this time (the beep plays every time) |
| `ALMOST_PARTS` | 15 | From this many parts, a crash says "Prawie się udało!" |
| `SFX_VOL`, `VOICE_VOL` | 0.5, 1 | Loudness of the effects and the voice |
| `CLIP_TRIM` | | Per-clip loudness (the chime, boop, launch and crash are turned down under the voice) |
| `VOICE_GAP` | 0.08 s | Pause between the pieces of a spoken task |
| `VOICE_WAIT` | 400 ms | How long to wait for a clip that's still loading before the browser voice says it |
| `ASSET_V` | 1 | Bump after replacing any file in `assets/` |

## Vibration

Game events make the phone vibrate: a light tick on every key, a short buzz for a right
answer and when a part lands, a double buzz for a mistake, a warning pulse when the time bar
turns red, 3-2-1 ticks and a long rumble at blast-off, and a sputter and a big boom on a crash.
Patterns live in `PATTERNS` in `haptics.js`. A switch in the help panel turns vibration off,
and the choice is remembered.

- **Android** uses the standard Vibration API, so every event vibrates with its full pattern.
- **iPhone / iPad** has no Vibration API in Safari. On iOS 18 and later the game instead
  clicks a hidden native switch control, which makes the system play a haptic tick, and
  builds each pattern from up to four ticks. iOS seems to play these only in direct response
  to a tap, so key presses and right or wrong answers vibrate, but events that happen on their
  own, like the countdown or the crash, may stay silent. Older iOS versions get no vibration.
- **Computers** show no switch and never vibrate.

## Design choices for young kids

- **Big on-screen number pad** in calculator layout (7-8-9 on top), with a blue **−** key,
  an orange **⌫** and a wide green **OK**. A physical keyboard works too
  (digits, `-`, Backspace, Enter).
- **Minus goes first** and tapping it twice removes it, so a child can't produce `5-` or `--3`.
  Answers are capped at two digits.
- **A plain, wide font** (Verdana / Tahoma) — the same reasoning as in Słówka: unornamented
  digits are what a child decodes fastest.
- **No double-tap zoom** (`touch-action: manipulation`), so hammering ⌫ doesn't zoom the page.
- **Fits the screen** on phones and tablets; on a wide, short screen the task sits next to
  the number pad.
- Random praise ("Super!", "Brawo!", …) after each correct answer.
- **Asset links carry a version** (`styles.css?v=6`). Bump it in `index.html` after changing a
  file, so browsers that visited before load the new version instead of a cached one.

## Play offline (add to Home Screen)

On iPhone or iPad, open the game in Safari, tap **Share → Add to Home Screen**, then open it once from the new icon while online. After that it starts full screen and works without internet. Changes arrive on their own: the next online launch downloads them and the one after shows them.

(How: `manifest.webmanifest` gives the icon and full-screen mode; `sw.js`, a service worker, keeps a copy of every file the game uses, including the scripts for the rocket and the vibration. The icons `icon-180.png` and `icon-512.png` are rendered from `icon.svg` in headless Chrome.)

## Deploying to GitHub Pages

Create an empty repository on GitHub first (no README, no .gitignore), then from this folder:

```bash
git init -b main && git add . && git commit -m "Matma: gra w liczenie dla dzieci"
```

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git && git push -u origin main
```

Then in the repository on GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, pick branch `main` and folder `/ (root)`, and click Save.

After a minute the game is live at:

```
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

Every later `git push` to `main` republishes it automatically.

## Running it locally

Just open `index.html` in a browser — it plays fine straight from disk, though some browsers
block `localStorage` on `file://` URLs, so the trophy counter won't persist. To get the full
behaviour, serve the folder:

```bash
python -m http.server 5202
```

and open <http://localhost:5202/>.

## Audio credits

All clips were made with ElevenLabs on 2026-11-22 on the paid **Creator** plan (commercial use allowed, no credit
needed). They aren't covered by any licence on this game's code and aren't licensed for reuse.

- **The voice** (`assets/voice/`, 53 clips): voice "Jessica - Playful, Bright, Warm" (a stock ElevenLabs voice) speaking
  Polish, model Eleven Multilingual v2, stability 0.6 (numbers) or 0.5 (praise and rocket lines), similarity 0.9.
  - `num-0.mp3` … `num-30.mp3` and `op-plus`, `op-minus`, `op-ile-to-jest`, 34 clips: the spoken tasks.
  - `praise-*.mp3`, 6 clips: Super, Brawo, Tak jest, Świetnie, Ekstra, Dobrze.
  - `retry-*.mp3`, 4 clips: Spróbuj jeszcze raz, Prawie, Dasz radę, Nie szkodzi.
  - `rocket-*.mp3` and `count-*.mp3`, 9 clips: Gotowi?, Czas ucieka!, Ojej! Rakieta się przewróciła., Prawie się udało!,
    Brawo! Rakieta poleciała w kosmos!, Trzy!, Dwa!, Jeden!, Start!
- **Sound effects** (`assets/sfx/`, 8 clips): ElevenLabs Sound Effects (`eleven_text_to_sound_v2`). `clunk` (a rocket part
  snapping into place), `right` (a two-note chime), `wrong` (a soft boop), `tick` (a countdown tick), `hurry` (a timer
  beep), `blastoff` (the launch roar), `crash` (sputter, boing and poof) and `confetti` (a party popper).
