# Miles & Mornings

A small, handmade replacement for Strava's training view. It's one static page showing:

- **This week**: the current week's kilometres as a big number, a mini bar strip of the last 4 weeks, and their weekly average. There's deliberately no "up/down vs before" comparison.
- **Weekly distance**: rounded bars in rotating accent colours, a **3 months / 6 months / This year** toggle (3 months by default; a week counts if any of its days fall in the period, so "This year" includes the week containing January 1), and a dashed average line. The average is calculated from the weeks currently shown, so it changes with the toggle.
- **That week's runs**: tap a bar on the weekly distance chart to open a panel underneath listing that week's runs, Monday first. Tap a run to see its details. Tap the same bar again (or ×) to close the panel, or tap another bar to switch weeks. Runs come only from the live training log (see below). With `weekly.csv` the panel asks you to connect.
- **Training load**: weekly TRIMP, with a short explanation of what TRIMP means and its own **3 months / 6 months / This year** toggle, separate from the distance chart.
- **Goals**: target time and pace for 5K, 10K, half and marathon.
- **Recent races**: finish time and average pace for each race.
- **The wall**: a mood board of photos pinned up like polaroids. On desktop they overlap as a collage; on a phone they become a swipeable strip. Tap any photo to see it larger.

It's plain HTML, CSS and JS, with Chart.js 4.4.1 loaded from cdnjs. There's no build step and nothing to install.

```
index.html            page structure
styles.css            colours, type, grain, layout
app.js                data loading + charts
sheets.js             private Google Sheet reader (live training log)
data/weekly.csv       fallback / public data
config.js             Google client ID + spreadsheet ID (no secrets; safe to publish)
config.example.js     blank copy of config.js
manifest.webmanifest  app name, icons and colours for "Add to Home Screen"
icons/                app icons (iPhone, Android, browser tab)
make-upload.sh        builds _upload/ with just the files the website needs
connection-test.html  standalone sign-in + first-15-rows test (local only)
```

After editing `app.js`, `sheets.js` or `styles.css`, bump the `?v=` number on their links in `index.html` (e.g. `?v=2` → `?v=3`). Otherwise browsers may keep showing the old version.

## Running it locally

Browsers block `fetch()` for pages opened straight from disk (`file://`), so serve the folder instead. In Terminal, from this folder:

```bash
ruby -run -e httpd . -p 8000
```

Then open http://localhost:8000. (`python3 -m http.server 8000` works too if you have Python 3 installed.)

## Publishing on GitHub Pages and using it on your phone

**1. Build the upload folder.** In Terminal, from this folder:

```bash
./make-upload.sh
```

This creates `_upload/` with only the website's files. It leaves out `slider-photos/` (your originals, plus an unrelated billing screenshot), `reference/`, and the test page.

**2. Create the repository.** On github.com, go to **New repository**, name it e.g. `miles-and-mornings`, and set it to **Public** (free Pages needs that). Then click **"uploading an existing file"**, drag in **everything inside `_upload/`** (the files and folders, not the `_upload` folder itself), and click **Commit changes**.

**3. Turn on Pages.** Go to **Settings → Pages → Deploy from a branch → main / (root) → Save**. After a minute you get `https://YOUR-USERNAME.github.io/miles-and-mornings/`.

**4. Allow sign-in from that address.** In Google Cloud, go to **APIs & Services → Credentials**, open your OAuth client, and under **Authorized JavaScript origins** add `https://YOUR-USERNAME.github.io`. Use exactly that, with no `/miles-and-mornings` and no trailing slash. Keep `http://localhost:8000` too. Changes can take a few minutes to apply.

**5. Install it on your iPhone.** Open the Pages address in **Safari**, tap **Share → Add to Home Screen → Add**. It gets the M&M icon and opens full screen. Tap **Connect training log** and sign in. (On Android, use Chrome's menu → **Add to Home screen / Install app**.)

**Updating later:** run `./make-upload.sh` again, then in the repository use **Add file → Upload files** and drag in the changed files. GitHub replaces files with the same name. Pages refreshes in about a minute.

**What's public:** everything in the repository, meaning the code, `weekly.csv`, photos, goals and races. Your coach's sheet stays private. Only accounts it's shared with can read it, and while the Google app is in Testing mode only listed test users can sign in. Visitors see the `weekly.csv` version; you see live data after signing in.

**If sign-in misbehaves in the Home Screen app** (a blank popup, or it never returns), open the site in Safari itself and connect there. Google's popup sign-in can be unreliable inside iPhone Home Screen apps.

## The data

`data/weekly.csv` has one row per week, oldest first. The loader looks for these columns by header name and falls back to positions A–D:

| Column | Example | Used for |
| --- | --- | --- |
| Week label | `Nov 09 - Nov 15` | x-axis, tooltips, hero date |
| Total KM | `29.5` | hero, distance bars |
| TRIMP | `375.96` | training-load bars |
| Average | `31.4` | ignored; the chart calculates its own average from the weeks shown |

Blank rows, rows without a number for km, and any extra columns are ignored. The **last row is "this week"**.

Week labels don't include a year. The site works the years out by counting back from the newest row, which it assumes is the current (or latest) week.

## Goals and races

These aren't in the CSV. They're two short lists at the top of `app.js`:

```js
const GOALS = [
  { distance: "5K", time: "18:35", pace: "3:43" },
  …
];

const RACES = [
  { name: "Navy Run 5K", time: "20:36", pace: "4:07" },
  { name: "parkrun", note: "Oct 8", time: "20:43", pace: "4:04" }, // note is optional
  …
];
```

Races show in the order listed, so add new ones at the top. Paces are min:sec per km; the page adds "/km".

## Photos

The site loads photos from `photos/`. These are web-sized copies (about 1200px on the long side). Your full-size originals stay in `slider-photos/`, and the site doesn't use that folder.

To add a photo:

1. Make a smaller copy into `photos/` (in Terminal, from this folder):

   ```bash
   sips -s format jpeg -s formatOptions 75 -Z 1200 "slider-photos/MY_PHOTO.JPG" --out photos/my-photo.jpg
   ```

2. Add it to the `PHOTOS` list at the top of `app.js`:

   ```js
   { src: "photos/my-photo.jpg", shape: "tall", caption: "Victoria Half · 1:29:10", alt: "What's in the photo" },
   ```

   Use `shape: "tall"` for portrait photos (cropped to 4:5) and `"wide"` for landscape (cropped to 3:2). On desktop, the first three photos form the overlapping collage, and any more go in a row underneath.

## Live data from the private training log

At **http://localhost:8000**, a pill under the title says "Showing weekly.csv" and has a **Connect training log** button.

1. Click it and sign in with the Google account the sheet is shared with. It asks for read-only access.
2. The page swaps to live numbers from the coach's sheet, and the pill turns green: "Live from 'Katrina's Training Log 2025-26'".
3. **Refresh** re-reads the sheet. **Disconnect** removes the page's access and goes back to `weekly.csv`.

The sign-in lasts about an hour and survives page reloads in the same tab. After that, click Connect again.

**How it reads the sheet** (`sheets.js`):
- It requests **only these columns**:

  | Column | Header in the sheet | Used for |
  | --- | --- | --- |
  | A | weekday / WEEKLY TOTALS | finding each week |
  | B | Date | run dates, week labels |
  | C | AM / PM | ordering runs within a day |
  | D | WORKOUT | run title, description and tag |
  | I | TOTAL TIME (min) | moving time and pace |
  | N | Km Total | run distance; weekly km (totals row) |
  | P | Total Session RPE (1-10) | the effort scale |
  | T | TRIMP | weekly training load (totals row) |
  | U | Comments | the run's **Notes** |

- **Comments (column U) are now fetched** and shown as each run's "Notes", with a small lock icon. They can include things like menstrual-cycle, stress or bloodwork notes. They're only shown while you're signed in, in your own browser tab, and are never saved, cached or published. The lock marks them as private; it doesn't hide them, so be mindful when sharing your screen.
- **Injuries (Q), sleep (R) and mental health (S) are never fetched**, and neither are the coach's working columns (E–H, J–M, O).
- Each **WEEKLY TOTALS** row gives that week's km and TRIMP, using the coach's own numbers, so the charts don't depend on the runs. The week's dates come from the day rows above it.
- **Runs:** every AM/PM day row with km becomes a run. Rows without km (rest days, strength-only sessions) are skipped. A PM row takes its date from the AM row above it.
- The years stored behind the sheet's dates aren't reliable (later rows still say 2025), so it uses only month and day. It counts the year up from the title ("2025-26" → starts 2025) each time the dates wrap from December to January.
- Weeks before km logging began (before Jul 21, 2025) and weeks that haven't started yet are skipped.
- The average line isn't read from the sheet. It's the mean km of the weeks shown in the current 3 months / 6 months / This year view.

**Where it works:** the Connect pill appears at `http://localhost:8000` and on any `https://` address (like GitHub Pages), as long as `config.js` is there. Sign-in only succeeds from addresses listed under **Authorized JavaScript origins** in Google Cloud; anywhere else Google shows an "origin_mismatch" error. Without `config.js`, the pill stays hidden and the site uses `weekly.csv`. The sheet itself is never published or link-shared.

## Runs: titles, pace, effort and tags

- **Title**: taken from the first line of the workout description. The coach writes "warm-up: main set/cool-down", so the title is the main set: `15' easy + strides: Race: Navy 5k in Esquimalt/15' easy` → `Navy 5k in Esquimalt`. Without a colon, it's the first phrase (up to a comma or semicolon), skipping a warm-up: `1.5 mile WU, 3x1 mile @ "5-10k pace", …` → `3x1 mile @ "5-10k pace"`. Labels like "plan:", "Race:", "AM:", "PM:" and "XT:" are dropped. The full description shows underneath in the run's pop-out.
- **Two runs in a day** (km on both the AM and PM rows) show as two separate entries, marked AM and PM.
- **Pace** = moving time ÷ km, shown as min:sec /km. If the time is missing, time and pace show "—".
- **Effort** uses `createRpeScale()` in `app.js`, one component with two modes: read-only (a meter, used now) and editable (a real slider, for the manual-entry form).
- **Tags** (Race, Long run, Workout, Recovery) are guessed from the description using `RUN_TAG_RULES` at the top of `app.js`. Rules are checked top to bottom, and the first match wins. A run that matches nothing gets no tag. To add a keyword, add a pattern to the right rule.
  - **Race**: "Race:", "race" in quotes, parkrun, time trial, TT, PB/PR.
  - **Long run**: "long run" or "LR", a description starting with 75 minutes or more (`80-90' easy`), or 10–19 miles.
  - **Workout**: reps like `5 x 3'` (strides and pickups count), intervals, tempo, threshold, fartlek, repeats, hill sprints, "@ … pace", progression.
  - **Recovery**: "recovery run/jog", a description starting with "recovery", or shakeout.

## Switching to a published Google Sheet (public option)

All CSV loading happens in one function, `loadTrainingData()` in `app.js`, and it reads from `DATA_URL`. For a public version of the site, publish a sheet that holds only weekly totals. Don't publish the coach's log.

1. In the Sheet: **File → Share → Publish to web**.
2. Choose the tab that holds the weekly table, set the format to **Comma-separated values (.csv)**, and publish.
3. Copy the link it gives you (it ends in `output=csv`).
4. In `app.js`, change the line at the top:

   ```js
   const DATA_URL = "https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&single=true&output=csv";
   ```

Published Sheets CSVs allow cross-origin requests, so this works from any host. Google caches published sheets, so edits can take a few minutes to show up.

## Tweaking the look

- **Colours** are CSS variables at the top of `styles.css`. Bar colours come from the `PALETTE` array in `app.js`, in this rotation order: blush, burnt orange, mustard, harvest olive, moss, slate. Keep the two in sync.
- **Fonts**: *Bagel Fat One* (display) and *DM Sans* (body), both from Google Fonts. Swap them in the `<link>` in `index.html` and in `--font-display` / `--font-body`.
- **Grain**: `.grain` in `styles.css`. Raise or lower `opacity` (currently `0.16`).
- **Default ranges**: `const ranges = { distance: "3m", trimp: "3m" }` near the bottom of `app.js`. Each can be `"3m"`, `"6m"` or `"ytd"`. If you change one, also move `aria-pressed="true"` to the matching button in `index.html`.
