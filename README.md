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
