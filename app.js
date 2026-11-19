/* ------------------------------------------------------------
   Miles & Mornings — data loading + charts
   ------------------------------------------------------------ */

/**
 * Where the weekly data lives.
 * To switch to Google Sheets: File → Share → Publish to web → choose the
 * sheet, format "CSV", copy the link, and paste it here.
 */
const DATA_URL = "data/weekly.csv";

/* Goal times — edit freely. */
const GOALS = [
  { distance: "5K", time: "18:35", pace: "3:43" },
  { distance: "10K", time: "38:33", pace: "3:51" },
  { distance: "Half", time: "1:25:19", pace: "4:03" },
  { distance: "Marathon", time: "2:58", pace: "4:13" },
];

/* Recent races, newest first — add new ones at the top. */
const RACES = [
  { name: "Navy Run 5K", time: "20:36", pace: "4:07" },
  { name: "Barnburner 5000", time: "21:14", pace: "4:15" },
  { name: "parkrun", note: "Sept 26", time: "21:08", pace: "4:14" },
  { name: "parkrun", note: "Oct 8", time: "20:43", pace: "4:04" },
  { name: "RVM 8K", time: "33:39", pace: "4:13" },
  { name: "Cowichan Classic", time: "21:20", pace: "4:18" },
];

/* Mood-board photos — files live in photos/. `shape` is "tall" or "wide". */
const PHOTOS = [
  {
    src: "photos/navy-run.jpg",
    shape: "tall",
    caption: "Navy Run 5K · 20:36",
    alt: "Arms up, grinning, crossing the Navy Run finish line in the sun",
  },
  {
    src: "photos/cowichan-classic.jpg",
    shape: "wide",
    caption: "Cowichan Classic · 21:20",
    alt: "Waving down the gravel finish chute under the yellow Run Cowichan arch, autumn trees behind",
  },
  {
    src: "photos/trail-stride.jpg",
    shape: "tall",
    caption: "the feeling I'm chasing",
    alt: "Blurred mid-stride leg and shoe against a pale sky and green hills",
  },
];

/**
 * RUN TAG RULES: how a run's tag is guessed from its workout description.
 * Checked top to bottom; the first rule with a matching pattern wins.
 * No match means no tag. When unsure, leave it untagged.
 */
const RUN_TAG_RULES = [
  {
    tag: "Race",
    patterns: [
      /\brace\s*:/i,                    // the coach's "Race: Navy 5k"
      /["“]race["”]/i,                  // Parkrun 5k "race"
      /\bparkrun\b/i,
      /\btime[\s-]?trial\b/i,
      /\bTT\b/,
      /\bP[BR]\b/,
    ],
  },
  {
    tag: "Long run",
    patterns: [
      /\blong\s*run\b/i,
      /\bLR\b/,
      /^\s*(plan\s*:\s*)?(up to\s+)?(7[5-9]|[89]\d|[1-9]\d\d)\s*(-\s*\d+\s*)?('|min)/i, // starts with 75' or more: "80-90' easy"
      /^\s*(plan\s*:\s*)?1\d(\.\d+)?\s*miles?\b/i,                                 // "10 miles easy"
    ],
  },
  {
    tag: "Workout",
    patterns: [
      /\b\d+\s*[x×]\s*\d/i,             // 3x1 mile, 6 × 400m
      /\bintervals?\b/i,
      /\btempo\b/i,
      /\bthreshold\b/i,
      /\bfartlek\b/i,
      /\brepeats?\b/i,
      /\bhill\s*(repeats?|reps|sprints)\b/i,
      /@\s*["“]?[^,;]*\bpace\b/i,     // "@ 5-10k pace"
      /\bprogression\b/i,
    ],
  },
  {
    tag: "Recovery",
    patterns: [/\brecovery\s*(run|jog)\b/i, /^\s*recovery\b/i, /\bshake\s*-?\s*out\b/i],
  },
];

/* Accent palette, in bar-rotation order (matches styles.css). */
const PALETTE = ["#E9A9BC", "#D9673A", "#E2AE3C", "#8C8A3A", "#4F5E36", "#6F8BA6"];
const INK = "#2F2A24";
const INK_SOFT = "#6E6458";
const GRID = "rgba(84, 60, 30, 0.08)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ============================================================
   Data loading — the one function to repoint later
   ============================================================ */

/**
 * Fetch a CSV (local file or published Google Sheets URL) and return
 * clean rows: [{ label, km, trimp, start: Date|null }, …]
 * oldest → newest. Blank rows and any extra columns are ignored.
 * (An "Average" column, if present, is ignored: the chart calculates its own.)
 */
async function loadTrainingData(url = DATA_URL) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load data (${res.status}) from ${url}`);
  const text = await res.text();

  const table = parseCSV(text);
  if (!table.length) return [];

  // Find columns by header name, falling back to position (A–D).
  const header = table[0].map((h) => h.trim().toLowerCase());
  const find = (re, fallback) => {
    const i = header.findIndex((h) => re.test(h));
    return i === -1 ? fallback : i;
  };
  const col = {
    label: find(/week|date|range/, 0),
    km: find(/km|dist/, 1),
    trimp: find(/trimp|load/, 2),
  };
  const hasHeader = isNaN(toNumber(table[0][col.km]));
  const body = hasHeader ? table.slice(1) : table;

  const rows = body
    .map((r) => ({
      label: (r[col.label] || "").trim(),
      km: toNumber(r[col.km]),
      trimp: toNumber(r[col.trimp]),
    }))
    .filter((r) => r.label && Number.isFinite(r.km));

  attachDates(rows);
  return rows;
}

/** Small CSV parser that understands quoted fields ("a, b"). */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toNumber(v) {
  if (v == null) return NaN;
  const s = String(v).replace(/[^\d.\-]/g, "");
  return s === "" ? NaN : Number(s);
}

/**
 * Labels look like "Nov 09 - Nov 15" with no year. Walk backwards from the
 * newest row (assumed to be the current or most recent week) and step the
 * year back whenever the month jumps forward.
 */
function attachDates(rows) {
  const today = new Date();
  let year = today.getFullYear();
  let nextMonth = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const m = rows[i].label.match(/([A-Za-z]{3})\w*\s+(\d{1,2})/);
    const month = m ? MONTHS.indexOf(m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase()) : -1;
    if (month === -1) { rows[i].start = null; continue; }
    const day = Number(m[2]);
    if (nextMonth === null) {
      // If the newest week would start in the future, it belongs to last year.
      if (new Date(year, month, day) > today) year--;
    } else if (month > nextMonth) {
      year--;
    }
    rows[i].start = new Date(year, month, day);
    nextMonth = month;
  }
}

/* ============================================================
   Formatting helpers
   ============================================================ */

const fmtKm = (n) => (Math.round((n + Number.EPSILON) * 10) / 10).toFixed(1).replace(/\.0$/, "");

function prettyRange(row) {
  if (!row.start) return row.label;
  const s = row.start;
  const e = new Date(s); e.setDate(s.getDate() + 6);
  const sm = MONTHS[s.getMonth()], em = MONTHS[e.getMonth()];
  return sm === em ? `${sm} ${s.getDate()} – ${e.getDate()}` : `${sm} ${s.getDate()} – ${em} ${e.getDate()}`;
}

function shortLabel(row) {
  if (!row.start) return row.label.split(/\s*-\s*/)[0];
  return `${MONTHS[row.start.getMonth()]} ${row.start.getDate()}`;
}

function tooltipTitle(row) {
  if (!row.start) return row.label;
  return `${prettyRange(row)}, ${row.start.getFullYear()}`;
}

const colorAt = (i) => PALETTE[i % PALETTE.length];

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============================================================
   Hero
   ============================================================ */

function renderHero(rows) {
  const now = rows[rows.length - 1];
  document.getElementById("hero-week").textContent = prettyRange(now);
  countUp(document.getElementById("hero-km"), now.km);

  // Last 4 weeks as a mini bar strip (oldest → this week).
  const last4 = rows.slice(-4);
  const max = Math.max(...last4.map((r) => r.km), 1);
  const bars = document.getElementById("trend-bars");
  bars.innerHTML = "";
  last4.forEach((r, i) => {
    const b = document.createElement("span");
    b.className = "trend-bar" + (i === last4.length - 1 ? " is-now" : "");
    b.style.height = `${Math.max(6, (r.km / max) * 100)}%`;
    b.style.background = colorAt(rows.length - last4.length + i);
    b.style.animationDelay = `${i * 90}ms`;
    b.title = `${prettyRange(r)}: ${fmtKm(r.km)} km`;
    bars.appendChild(b);
  });

  // Just the recent shape of things. No "vs before" scoring; weeks are allowed to be what they are.
  const a4 = last4.reduce((s, r) => s + r.km, 0) / (last4.length || 1);
  document.getElementById("trend-text").innerHTML =
    `<strong>${fmtKm(a4)} km</strong> a week over the last 4 weeks.`;
}

function countUp(el, target) {
  if (reduceMotion) { el.textContent = fmtKm(target); return; }
  const dur = 900, t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = p < 1 ? (target * eased).toFixed(1) : fmtKm(target);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ============================================================
   Charts
   ============================================================ */

function setChartDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = INK_SOFT;
  // Adjust the defaults; don't replace the object. Chart.js reads other keys
  // from it (like how to animate colours), and losing them freezes every chart.
  Object.assign(Chart.defaults.animation, { duration: reduceMotion ? 0 : 700, easing: "easeOutQuart" });
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: "#FBF6EE",
    titleColor: INK,
    bodyColor: INK_SOFT,
    borderColor: "#EADFCB",
    borderWidth: 1,
    padding: 12,
    cornerRadius: 12,
    displayColors: false,
    itemSort: (a, b) => a.datasetIndex - b.datasetIndex, // the week's km first, then the average
    titleFont: { weight: "600" },
  });
}

function baseOptions(rows, unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    layout: { padding: { top: 6 } },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          autoSkip: true,
          maxRotation: 0,
          autoSkipPadding: 14,
          callback: (v, i) => shortLabel(rows[i]),
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: GRID, drawTicks: false },
        border: { display: false },
        ticks: { padding: 8, maxTicksLimit: 5 },
        title: { display: false, text: unit },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { title: (items) => tooltipTitle(rows[items[0].dataIndex]) } },
    },
  };
}

/* Draws the average value as a little pill at the right end of the line. */
const avgLabelPlugin = {
  id: "avgLabel",
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(1);
    if (!meta || meta.hidden || !meta.data.length) return;
    const pt = meta.data[meta.data.length - 1];
    const val = chart.data.datasets[1].data.at(-1);
    if (!Number.isFinite(val)) return;
    const { ctx, chartArea } = chart;
    const text = `avg ${fmtKm(val)}`;
    ctx.save();
    ctx.font = `600 11px ${Chart.defaults.font.family}`;
    const w = ctx.measureText(text).width + 14, h = 20;
    const x = Math.min(chartArea.right - w, pt.x - w + 4);
    const y = pt.y - h - 6;
    ctx.fillStyle = "#6F8BA6";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = "#FBF6EE";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 7, y + h / 2 + 0.5);
    ctx.restore();
  },
};

let distanceChart, trimpChart;

/**
 * Weeks to show for a range button, by date:
 *   "3m"  → weeks overlapping the last 3 months (from today, same day 3 months back)
 *   "6m"  → same, 6 months
 *   "ytd" → weeks overlapping this calendar year (from January 1)
 * A week counts if any of its 7 days fall in the period, so the week containing
 * January 1 is included in "This year".
 */
function weeksInRange(all, range) {
  const today = new Date();
  const from =
    range === "ytd" ? new Date(today.getFullYear(), 0, 1)
    : new Date(today.getFullYear(), today.getMonth() - (range === "6m" ? 6 : 3), today.getDate());

  if (all.some((r) => !r.start)) {
    // Undated rows (unusual CSV labels): fall back to roughly the same number of weeks.
    const n = range === "6m" ? 26 : range === "ytd" ? Math.ceil((today - from) / 6048e5) + 1 : 13;
    return all.slice(-n);
  }
  return all.filter((r) => {
    const end = new Date(r.start);
    end.setDate(end.getDate() + 6);
    return end >= from;
  });
}

/** Shared setup for a chart over a date range: the weeks, colours and bar shape. */
function chartWeeks(all, range) {
  const rows = weeksInRange(all, range);
  const offset = all.length - rows.length; // keeps bar colours stable across ranges
  const narrow = window.innerWidth < 760;
  return {
    rows,
    colors: rows.map((_, i) => colorAt(offset + i)),
    lastIdx: rows.length - 1,
    radius: rows.length > 40 ? 4 : narrow ? 6 : 10,
  };
}

function renderDistance(all, range) {
  const { rows, colors, lastIdx, radius } = chartWeeks(all, range);

  // Average of exactly the weeks on screen, so it changes with the range.
  const avgKm = rows.reduce((s, r) => s + r.km, 0) / (rows.length || 1);

  const distData = {
    labels: rows.map((r) => r.label),
    datasets: [
      {
        type: "bar",
        label: "Distance",
        data: rows.map((r) => r.km),
        ...barStyles(colors, lastIdx, rows.findIndex(isSelected)),
        borderRadius: radius,
        borderSkipped: false,
        categoryPercentage: 0.86,
        barPercentage: 0.9,
        order: 2,
      },
      {
        type: "line",
        label: "Average",
        data: rows.map(() => avgKm),
        borderColor: "#6F8BA6",
        borderWidth: 2,
        borderDash: [6, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.3,
        fill: false,
        order: 1,
      },
    ],
  };
  const distOpts = baseOptions(rows, "km");
  distOpts.plugins.tooltip.callbacks.label = (ctx) =>
    ctx.datasetIndex === 0 ? `${fmtKm(ctx.parsed.y)} km` : `average ${fmtKm(ctx.parsed.y)} km`;

  distanceView = { rows, colors, lastIdx };
  // If the open week isn't in this range any more, close its panel.
  if (selectedWeek !== null && !rows.some(isSelected)) closeRunsPanel({ returnFocus: false, redraw: false });

  if (distanceChart) distanceChart.destroy();
  buildBarHits(rows);
  distanceChart = new Chart(document.getElementById("distance-chart"), {
    data: distData,
    options: distOpts,
    plugins: [avgLabelPlugin, barHitsPlugin],
  });
}

/** Bar colours and outlines. With a week selected, the others fade back. */
function barStyles(colors, lastIdx, selIdx) {
  const picked = selIdx !== -1;
  return {
    backgroundColor: colors.map((c, i) => (!picked || i === selIdx ? c : withAlpha(c, 0.35))),
    hoverBackgroundColor: colors.map((c, i) => (i === selIdx ? c : withAlpha(c, picked ? 0.6 : 0.8))),
    // This week keeps its thin outline, unless another week is selected (then only that one is outlined).
    borderColor: colors.map((_, i) => (i === selIdx || (!picked && i === lastIdx) ? INK : "transparent")),
    borderWidth: colors.map((_, i) => (i === selIdx ? 3 : !picked && i === lastIdx ? 2 : 0)),
  };
}

function restyleBars() {
  if (!distanceChart || !distanceView) return;
  const { rows, colors, lastIdx } = distanceView;
  Object.assign(distanceChart.data.datasets[0], barStyles(colors, lastIdx, rows.findIndex(isSelected)));
  distanceChart.update();
}

/* ============================================================
   Week buttons over the distance bars
   ============================================================ */

let distanceView = null;   // { rows, colors, lastIdx } currently drawn
let selectedWeek = null;   // key of the week whose runs are open, or null
const weekKey = (r) => (r.start ? r.start.getTime() : r.label);
const isSelected = (r) => selectedWeek !== null && weekKey(r) === selectedWeek;

/** Keeps each week button lined up with its bar's full column (bar + gap + label). */
const barHitsPlugin = {
  id: "barHits",
  afterUpdate(chart) {
    const wrap = document.getElementById("bar-hits");
    const btns = wrap.children;
    const x = chart.scales.x;
    const n = btns.length;
    if (!x || !n) return;
    const { top } = chart.chartArea;
    const colW = (x.right - x.left) / n;
    const canvas = chart.canvas;
    for (let i = 0; i < n; i++) {
      const s = btns[i].style;
      s.left = `${canvas.offsetLeft + x.getPixelForValue(i) - colW / 2}px`;
      s.width = `${colW}px`;
      s.top = `${canvas.offsetTop + top}px`;
      s.height = `${chart.height - top}px`;
    }
  },
};

function buildBarHits(rows) {
  const wrap = document.getElementById("bar-hits");
  const selIdx = rows.findIndex(isSelected);
  const focusIdx = selIdx !== -1 ? selIdx : rows.length - 1; // one Tab stop: the open week, else this week
  wrap.innerHTML = rows.map((r, i) => `
    <button type="button" class="bar-hit" data-i="${i}" tabindex="${i === focusIdx ? 0 : -1}"
      aria-controls="runs-panel" aria-expanded="${i === selIdx}"
      aria-label="Week of ${esc(prettyRange(r))}, ${fmtKm(r.km)} km${i === rows.length - 1 ? ", this week" : ""}"></button>`
  ).join("");
}

function syncBarHits() {
  if (!distanceView) return;
  const selIdx = distanceView.rows.findIndex(isSelected);
  const btns = [...document.querySelectorAll("#bar-hits .bar-hit")];
  const focusIdx = selIdx !== -1 ? selIdx : btns.length - 1;
  btns.forEach((b, i) => {
    b.setAttribute("aria-expanded", String(i === selIdx));
    b.tabIndex = i === focusIdx ? 0 : -1;
  });
}

/** Show (or clear) the chart's own tooltip for a week, for hover and keyboard focus. */
function showBarTip(i) {
  const c = distanceChart;
  if (!c) return;
  const els = i === null ? [] : [{ datasetIndex: 0, index: i }, { datasetIndex: 1, index: i }];
  c.setActiveElements(els);
  c.tooltip.setActiveElements(els, { x: 0, y: 0 });
  c.update();
}

function setupBarHits() {
  const wrap = document.getElementById("bar-hits");
  const idx = (el) => Number(el.closest(".bar-hit").dataset.i);

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest(".bar-hit");
    if (b) toggleWeek(idx(b));
  });
  wrap.addEventListener("pointerover", (e) => {
    if (e.pointerType === "mouse" && e.target.closest(".bar-hit")) showBarTip(idx(e.target));
  });
  wrap.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") showBarTip(null); });
  wrap.addEventListener("focusin", (e) => {
    const b = e.target.closest(".bar-hit");
    if (b && b.matches(":focus-visible")) showBarTip(idx(b));
  });
  wrap.addEventListener("focusout", (e) => { if (!wrap.contains(e.relatedTarget)) showBarTip(null); });

  // Arrow keys move between weeks (one Tab stop for the whole chart).
  wrap.addEventListener("keydown", (e) => {
    const btns = [...wrap.querySelectorAll(".bar-hit")];
    const i = btns.indexOf(document.activeElement);
    if (i === -1) return;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(btns.length - 1, i + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? btns.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    btns[i].tabIndex = -1;
    btns[to].tabIndex = 0;
    btns[to].focus();
  });
}

/** Tap a bar: open its week; tap it again: close; tap another: switch. */
function toggleWeek(i) {
  const row = distanceView && distanceView.rows[i];
  if (!row) return;
  if (isSelected(row)) { closeRunsPanel({ returnFocus: false }); return; }
  selectedWeek = weekKey(row);
  restyleBars();
  syncBarHits();
  renderRunsPanel({ announce: true });
  const panel = document.getElementById("runs-panel");
  const r = panel.getBoundingClientRect();
  if (r.bottom > window.innerHeight) {
    panel.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }
}

function closeRunsPanel({ returnFocus = true, redraw = true } = {}) {
  const key = selectedWeek;
  selectedWeek = null;
  document.getElementById("runs-panel").hidden = true;
  document.getElementById("runs-status").textContent = "";
  if (!redraw) return;
  restyleBars();
  syncBarHits();
  if (returnFocus && distanceView) {
    const i = distanceView.rows.findIndex((r) => weekKey(r) === key);
    const b = document.querySelector(`#bar-hits .bar-hit[data-i="${i}"]`);
    if (b) b.focus();
  }
}

function renderTrimp(all, range) {
  const { rows, colors, radius } = chartWeeks(all, range);
  const trimpOpts = baseOptions(rows, "TRIMP");
  trimpOpts.plugins.tooltip.callbacks.label = (ctx) => `TRIMP ${Math.round(ctx.parsed.y)}`;

  if (trimpChart) trimpChart.destroy();
  trimpChart = new Chart(document.getElementById("trimp-chart"), {
    type: "bar",
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: "TRIMP",
          data: rows.map((r) => (Number.isFinite(r.trimp) ? r.trimp : null)),
          backgroundColor: colors.map((c) => withAlpha(c, 0.5)),
          hoverBackgroundColor: colors,
          borderColor: colors,
          borderWidth: { top: 2, left: 0, right: 0, bottom: 0 },
          borderRadius: radius,
          borderSkipped: false,
          categoryPercentage: 0.86,
          barPercentage: 0.9,
        },
      ],
    },
    options: trimpOpts,
  });
}

/** Each chart keeps its own date range. */
function renderCharts(all) {
  renderDistance(all, ranges.distance);
  renderTrimp(all, ranges.trimp);
}

/* ============================================================
   Runs: helpers
   ============================================================ */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** First matching tag from RUN_TAG_RULES, or null. */
function runTag(description) {
  const text = description || "";
  const rule = RUN_TAG_RULES.find((r) => r.patterns.some((p) => p.test(text)));
  return rule ? rule.tag : null;
}

/**
 * A short title from the workout description's first line.
 * The coach writes "warm-up: main set/cool-down", so the title is the main set:
 *   "15' easy + strides: Race: Navy 5k in Esquimalt/15' easy" → "Navy 5k in Esquimalt"
 *   "10-15' easy: 5k time trial at ParkRun"                   → "5k time trial at ParkRun"
 * Without a colon it's the first phrase (up to a comma or semicolon), skipping a warm-up:
 *   "1.5 mile WU, 3x1 mile @ 5-10k pace, …"                   → "3x1 mile @ 5-10k pace"
 * "plan:" and "Race:" labels are dropped. Long titles are trimmed at a word.
 */
const WARMUP_WORDS = /\b(easy|wu|warm[\s-]?up|strides?|drills?|dribbles?)\b/i;

function runTitle(run) {
  const firstLine = (run.description.split("\n").find((l) => l.trim()) || "").trim();

  // Split on label colons ("strides: …"), not clock colons ("@5:15/km").
  const parts = firstLine.split(/:\s+|:$/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(plan|race|pm|am|xt)$/i.test(p));
  let main = parts.length > 1
    ? parts.slice(0, -1).find((p) => !WARMUP_WORDS.test(p) && !/\b(as|of)$/i.test(p)) || parts[parts.length - 1]
    : parts[0] || "";
  main = main.replace(/\s*\/[^/]*\b(easy|cd|cool[\s-]?down)\b[^/]*$/i, ""); // drop a trailing "/15' easy" cool-down

  const phrases = main.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  while (phrases.length > 1 && /\b(wu|warm[\s-]?up)\b/i.test(phrases[0])) phrases.shift();
  let t = (phrases[0] || "").replace(/\s{2,}/g, " ").replace(/[.\s]+$/, "");
  if (!t) return `${fmtKm(run.km)} km run`;
  if (t.length > 42) t = t.slice(0, 42).replace(/\s+\S*$/, "") + "…";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Seconds → "43:30" or "1:32:05". */
function fmtDuration(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

const runTime = (run) => (run.minutes ? fmtDuration(run.minutes * 60) : null);
const runPace = (run) => (run.minutes && run.km ? fmtDuration((run.minutes * 60) / run.km) : null);

function effortWord(v) {
  return v <= 3 ? "easy" : v <= 6 ? "moderate" : v <= 8 ? "hard" : "max effort";
}

/** Runs sorted Monday first, AM before PM. */
function sortedRuns(row) {
  return [...row.runs].sort((a, b) => a.date - b.date || (a.slot === b.slot ? 0 : a.slot === "AM" ? -1 : 1));
}

const sameDayCount = (runs, run) => runs.filter((r) => r.date.getTime() === run.date.getTime()).length;

/* ============================================================
   RPE scale: one reusable component.
   createRpeScale({ value, readOnly, onChange, label })
     readOnly: true  → a meter (what the run pop-out uses)
     readOnly: false → a real slider (for the manual-entry form, next)
   ============================================================ */

let rpeIds = 0;

function createRpeScale({ value = null, readOnly = true, onChange = null, label = "Effort (RPE)" } = {}) {
  const root = document.createElement("div");
  root.className = "rpe" + (readOnly ? " rpe--readonly" : "");
  const labelId = `rpe-label-${++rpeIds}`;

  if (readOnly && !Number.isFinite(value)) {
    root.innerHTML = `<p class="rpe-label" id="${labelId}">${esc(label)}</p><p class="rpe-empty">No RPE logged</p>`;
    return root;
  }

  const v0 = Number.isFinite(value) ? value : 5;
  root.innerHTML = `
    <p class="rpe-label" id="${labelId}">${esc(label)} <span class="rpe-num" aria-hidden="true"></span></p>
    <div class="rpe-track">
      <span class="rpe-ticks" aria-hidden="true">${"<i></i>".repeat(10)}</span>
      <span class="rpe-thumb" aria-hidden="true"></span>
    </div>
    <div class="rpe-ends" aria-hidden="true"><span>Easy</span><span>Moderate</span><span>Max effort</span></div>`;

  const track = root.querySelector(".rpe-track");
  const thumb = root.querySelector(".rpe-thumb");
  const num = root.querySelector(".rpe-num");
  let input = null;

  if (readOnly) {
    track.setAttribute("role", "meter");
    track.setAttribute("aria-labelledby", labelId);
    track.setAttribute("aria-valuemin", "1");
    track.setAttribute("aria-valuemax", "10");
  } else {
    input = document.createElement("input");
    Object.assign(input, { type: "range", min: 1, max: 10, step: 1, className: "rpe-input" });
    input.setAttribute("aria-labelledby", labelId);
    input.addEventListener("input", () => {
      set(Number(input.value));
      if (onChange) onChange(Number(input.value));
    });
    track.append(input);
  }

  function set(v) {
    root.style.setProperty("--rpe-pos", (v - 1) / 9);
    thumb.textContent = v;
    num.textContent = `· ${v} / 10`;
    const text = `${v} out of 10, ${effortWord(v)}`;
    if (readOnly) {
      track.setAttribute("aria-valuenow", String(v));
      track.setAttribute("aria-valuetext", text);
    } else {
      input.value = v;
      input.setAttribute("aria-valuetext", text);
    }
  }
  set(v0);

  return Object.assign(root, { setValue: set });
}

/* ============================================================
   Runs panel (under the distance chart) and run pop-out
   ============================================================ */

const TAG_CLASS = { "Race": "race", "Long run": "long", "Workout": "workout", "Recovery": "recovery" };
const tagChip = (tag) => (tag ? `<span class="tag tag--${TAG_CLASS[tag]}">${esc(tag)}</span>` : "");
const LOCK_ICON = `<svg class="lock" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
  <path d="M4.5 7V5.25a3.5 3.5 0 0 1 7 0V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="2.75" y="7" width="10.5" height="7.25" rx="2.2" fill="currentColor"/></svg>`;

let panelRuns = []; // runs listed in the panel, in display order

function renderRunsPanel({ announce = false } = {}) {
  const panel = document.getElementById("runs-panel");
  const row = distanceView && distanceView.rows.find(isSelected);
  if (!row) { panel.hidden = true; return; }

  const title = document.getElementById("runs-title");
  const body = document.getElementById("runs-body");
  const hasRuns = Array.isArray(row.runs);
  panelRuns = hasRuns ? sortedRuns(row) : [];
  const n = panelRuns.length;

  title.innerHTML = `${esc(prettyRange(row))} <span class="runs-title-meta">· ${fmtKm(row.km)} km${hasRuns && n ? ` · ${n} run${n === 1 ? "" : "s"}` : ""}</span>`;

  if (!hasRuns) {
    const canConnect = !document.getElementById("source").hidden && !document.getElementById("source-connect").hidden;
    body.innerHTML = `
      <p class="runs-empty">Connect your training log to see this week's runs.</p>
      ${canConnect ? `<button type="button" class="runs-connect">Connect training log</button>` : ""}`;
  } else if (!n) {
    body.innerHTML = `<p class="runs-empty">Rest week, no runs logged.</p>`;
  } else {
    body.innerHTML = `<ol class="run-list">${panelRuns.map((run, i) => {
      const pace = runPace(run);
      const twoToday = sameDayCount(panelRuns, run) > 1;
      return `
      <li>
        <button type="button" class="run-row" data-i="${i}" aria-haspopup="dialog" style="--accent:${colorAt(run.date.getDay() + 1)}">
          <span class="run-stamp" aria-hidden="true">
            <span class="run-stamp-day">${DAY_NAMES[run.date.getDay()].slice(0, 3)}</span>
            <span class="run-stamp-date">${run.date.getDate()}</span>
          </span>
          <span class="run-main">
            <span class="run-name">${esc(runTitle(run))}</span>
            <span class="run-meta">
              <span class="visually-hidden">${DAY_NAMES[run.date.getDay()]} ${MONTH_NAMES[run.date.getMonth()]} ${run.date.getDate()}${twoToday ? (run.slot === "AM" ? ", morning" : ", evening") : ""}: </span>
              ${twoToday ? `${run.slot} · ` : ""}${fmtKm(run.km)} km${pace ? ` · ${pace} /km` : ""}
            </span>
          </span>
          ${tagChip(runTag(run.description))}
        </button>
      </li>`;
    }).join("")}</ol>`;
  }

  panel.hidden = false;
  if (announce) {
    document.getElementById("runs-status").textContent =
      `${prettyRange(row)}: ${!hasRuns ? "connect your training log to see runs" : n ? `${n} run${n === 1 ? "" : "s"}` : "no runs logged"}.`;
  }
}

let runOpener = null;

function openRun(run, opener) {
  const box = document.getElementById("run-dialog");
  if (typeof box.showModal !== "function") return;
  runOpener = opener;

  const tag = runTag(run.description);
  const title = runTitle(run);
  const twoToday = sameDayCount(panelRuns, run) > 1;
  const d = run.date;
  const dateText = `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}` +
    (d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : "") +
    (twoToday ? (run.slot === "AM" ? " · Morning" : " · Evening") : "");
  const desc = run.description.trim();
  const showDesc = desc && desc.replace(/^plan\s*:\s*/i, "").replace(/[.\s]+$/, "").toLowerCase() !== title.toLowerCase();
  const stat = (label, value) => `
    <div class="run-stat"><dt>${label}</dt><dd>${value ? esc(value) : `<span class="run-stat-none">—</span>`}</dd></div>`;

  const content = document.getElementById("run-content");
  content.innerHTML = `
    <p class="run-when">${tagChip(tag)}<span>${esc(dateText)}</span></p>
    <h2 class="run-title" id="run-title">${esc(title)}</h2>
    ${showDesc ? `<p class="run-desc">${esc(desc)}</p>` : ""}
    <dl class="run-stats">
      ${stat("Distance", `${fmtKm(run.km)} km`)}
      ${stat("Time", runTime(run))}
      ${stat("Pace", runPace(run) && `${runPace(run)} /km`)}
    </dl>
    <div class="run-rpe"></div>
    <section class="run-notes" aria-labelledby="run-notes-label">
      <h3 class="run-notes-label" id="run-notes-label">${LOCK_ICON}Notes</h3>
      ${run.notes ? `<p class="run-notes-text">${esc(run.notes)}</p>` : `<p class="run-notes-text run-notes-text--none">No notes</p>`}
    </section>`;
  content.querySelector(".run-rpe").append(createRpeScale({ value: run.rpe, readOnly: true }));

  box.showModal();
  box.querySelector(".run-sheet-inner").scrollTop = 0;
}

function setupRuns() {
  setupBarHits();

  document.getElementById("runs-close").addEventListener("click", () => closeRunsPanel());

  document.getElementById("runs-body").addEventListener("click", (e) => {
    const row = e.target.closest(".run-row");
    if (row) { openRun(panelRuns[Number(row.dataset.i)], row); return; }
    if (e.target.closest(".runs-connect")) document.getElementById("source-connect").click();
  });

  const box = document.getElementById("run-dialog");
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); }); // tap outside closes
  box.addEventListener("close", () => {
    if (runOpener && runOpener.isConnected) runOpener.focus();
    runOpener = null;
  });
}

/* ============================================================
   Goals + races (static lists, no CSV needed)
   ============================================================ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderGoals() {
  document.getElementById("goals").innerHTML = GOALS.map(
    (g, i) => `
    <li class="goal" style="--accent:${colorAt(i + 1)}">
      <span class="goal-dist">${esc(g.distance)}</span>
      <span class="goal-time">${esc(g.time)}</span>
      <span class="goal-pace">${esc(g.pace)} /km</span>
    </li>`
  ).join("");
}

function renderRaces() {
  document.getElementById("races").innerHTML = RACES.map(
    (r, i) => `
    <li class="race">
      <span class="race-dot" style="background:${colorAt(i)}" aria-hidden="true"></span>
      <span class="race-name">${esc(r.name)}${r.note ? ` <span class="race-note">${esc(r.note)}</span>` : ""}</span>
      <span class="race-time">${esc(r.time)}</span>
      <span class="race-pace">${esc(r.pace)} /km</span>
    </li>`
  ).join("");
}

function renderCollage() {
  const collage = document.getElementById("collage");
  const tapes = ["rgba(226,174,60,.6)", "rgba(233,169,188,.65)", "rgba(111,139,166,.5)", "rgba(140,138,58,.5)"];
  collage.insertAdjacentHTML(
    "afterbegin",
    PHOTOS.map(
      (p, i) => `
      <figure class="polaroid polaroid--${p.shape === "wide" ? "wide" : "tall"}" style="--i:${i}">
        <span class="tape" style="background:${tapes[i % tapes.length]}" aria-hidden="true"></span>
        <button type="button" class="polaroid-btn" data-i="${i}" aria-label="Enlarge: ${esc(p.caption)}">
          <img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" />
        </button>
        <figcaption>${esc(p.caption)}</figcaption>
      </figure>`
    ).join("")
  );

  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightbox-img");
  const cap = document.getElementById("lightbox-caption");
  collage.addEventListener("click", (e) => {
    const btn = e.target.closest(".polaroid-btn");
    if (!btn || typeof box.showModal !== "function") return;
    const p = PHOTOS[Number(btn.dataset.i)];
    img.src = p.src;
    img.alt = p.alt;
    cap.textContent = p.caption;
    box.showModal();
  });
  // Click outside the photo closes it.
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
}

/* ============================================================
   Boot
   ============================================================ */

function showError(err) {
  console.error(err);
  clearError();
  document.querySelector(".wall").insertAdjacentHTML(
    "afterbegin",
    `<div class="error" role="alert"><strong>Couldn't load your weeks.</strong><br>${esc(err.message)}.<br>
     If you opened this file directly, serve the folder instead: <code>ruby -run -e httpd . -p 8000</code></div>`
  );
  document.getElementById("trend-text").textContent = "No data yet.";
}

function clearError() {
  document.querySelectorAll(".wall > .error").forEach((e) => e.remove());
}

let allRows = [];   // what the page is showing now
let csvRows = null; // weekly.csv, kept so "Disconnect" can fall back to it
const ranges = { distance: "3m", trimp: "3m" }; // default view for both charts: last 3 months

/** Draw everything that depends on the weekly rows. */
function renderAll(rows, sourceNote) {
  allRows = rows;
  clearError();
  renderHero(rows);
  renderCharts(rows);
  renderRunsPanel(); // keeps an open week open when the data source changes
  const first = rows[0];
  document.getElementById("foot-text").textContent =
    `${rows.length} weeks logged since ${first.start ? `${MONTHS[first.start.getMonth()]} ${first.start.getFullYear()}` : first.label}` +
    (sourceNote ? ` · ${sourceNote}` : "");
}

function setupChartControls() {
  // One toggle per chart: <div class="range" data-chart="distance|trimp">
  document.querySelectorAll(".range[data-chart]").forEach((group) => {
    const chart = group.dataset.chart;
    const buttons = group.querySelectorAll("button");
    buttons.forEach((b) => b.addEventListener("click", () => {
      ranges[chart] = b.dataset.range;
      buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (!allRows.length) return;
      if (chart === "trimp") renderTrimp(allRows, ranges.trimp);
      else renderDistance(allRows, ranges.distance);
    }));
  });

  // Bar corner radius depends on width; redraw when crossing the breakpoint.
  let wasNarrow = window.innerWidth < 760;
  window.addEventListener("resize", () => {
    const isNarrow = window.innerWidth < 760;
    if (isNarrow !== wasNarrow && allRows.length) { wasNarrow = isNarrow; renderCharts(allRows); }
  });
}

/* ---------- live training log (private Google Sheet) ---------- */

function setSource(state, text) {
  const bar = document.getElementById("source");
  bar.hidden = false;
  bar.dataset.state = state; // csv | loading | live | error
  document.getElementById("source-text").textContent = text;
  document.getElementById("source-connect").hidden = !(state === "csv" || state === "error");
  document.getElementById("source-refresh").hidden = state !== "live";
  document.getElementById("source-disconnect").hidden = state !== "live";
}

async function goLive() {
  setSource("loading", "Reading your training log…");
  try {
    const { title, weeks, doubleDays } = await SheetSource.load();
    if (!weeks.length) throw new Error("Connected, but found no weeks with km logged yet.");
    if (doubleDays && doubleDays.length) console.info("Days with more than one run:", doubleDays.map((d) => d.toDateString()));
    renderAll(weeks, "live from your training log");
    const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setSource("live", `Live from “${title}” · ${t}`);
  } catch (err) {
    console.error(err);
    if (!SheetSource.signedIn || err.needsSignIn) {
      setSource("error", `${err.message} Showing weekly.csv for now.`);
    } else {
      setSource("error", err.message);
    }
  }
}

async function setupSheetSource() {
  if (typeof SheetSource === "undefined" || !(await SheetSource.available())) return; // public site: CSV only

  document.getElementById("source-connect").addEventListener("click", async () => {
    setSource("loading", "Waiting for Google sign-in…");
    try {
      await SheetSource.signIn();
      await goLive();
    } catch (err) {
      setSource("error", err.message);
    }
  });
  document.getElementById("source-refresh").addEventListener("click", goLive);
  document.getElementById("source-disconnect").addEventListener("click", () => {
    SheetSource.signOut();
    if (csvRows) renderAll(csvRows);
    setSource("csv", "Disconnected. Showing weekly.csv.");
  });

  if (SheetSource.restore()) {
    await goLive();
  } else {
    setSource("csv", "Showing weekly.csv");
  }
}

async function init() {
  renderGoals();
  renderRaces();
  renderCollage();
  if (typeof Chart === "undefined") {
    showError(new Error("Chart.js didn't load (are you offline?)"));
    return;
  }
  setChartDefaults();
  setupChartControls();
  setupRuns();

  try {
    csvRows = await loadTrainingData();
    if (!csvRows.length) throw new Error("The CSV had no usable rows");
    renderAll(csvRows);
  } catch (err) {
    showError(err);
  }

  await setupSheetSource();
}

// Wait for web fonts so canvas labels render in DM Sans, not a fallback.
(document.fonts ? document.fonts.ready : Promise.resolve()).then(init);
