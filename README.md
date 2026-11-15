# Miles & Mornings

A small, handmade replacement for Strava's training view. It's one static page showing:

- **This week**: the current week's kilometres as a big number, a mini bar strip of the last 4 weeks, and how the last 4 weeks compare with the 4 before them.
- **Weekly distance**: rounded bars in rotating accent colours, a dashed average line, and a 12w / 26w / All range toggle.
- **Training load**: weekly TRIMP on the same timeline.
- **Goals**: target time and pace for 5K, 10K, half and marathon.
- **Recent races**: finish time and average pace for each race.
- **The wall**: a mood board of photos pinned up like polaroids. On desktop they overlap as a collage; on a phone they become a swipeable strip. Tap any photo to see it larger.

It's plain HTML, CSS and JS, with Chart.js 4.4.1 loaded from cdnjs. There's no build step and nothing to install.

```
index.html      page structure
styles.css      colours, type, grain, layout
app.js          data loading + charts
data/weekly.csv the data
```

## Running it locally

Browsers block `fetch()` for pages opened straight from disk (`file://`), so serve the folder instead. In Terminal, from this folder:

```bash
ruby -run -e httpd . -p 8000
```

Then open http://localhost:8000. (`python3 -m http.server 8000` works too if you have Python 3 installed.)

To publish it, any static host works: GitHub Pages, Netlify, Cloudflare Pages. Upload the folder as-is.

## The data

`data/weekly.csv` has one row per week, oldest first. The loader looks for these columns by header name and falls back to positions A–D:

| Column | Example | Used for |
| --- | --- | --- |
| Week label | `Nov 09 - Nov 15` | x-axis, tooltips, hero date |
| Total KM | `29.5` | hero, distance bars |
| TRIMP | `375.96` | training-load bars |
| Average | `31.4` | dashed average line (drawn per row, so a rolling average also works) |

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

## Switching to Google Sheets

All loading happens in one function, `loadTrainingData()` in `app.js`, and it reads from `DATA_URL`.

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
- **Default range**: `let range = "26"` in `init()` in `app.js`.
