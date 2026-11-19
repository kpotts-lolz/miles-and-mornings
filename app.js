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

function renderCharts(all, range) {
  const rows = range === "all" ? all : all.slice(-Number(range));
  const offset = all.length - rows.length; // keeps bar colours stable across ranges
  const colors = rows.map((_, i) => colorAt(offset + i));
  const lastIdx = rows.length - 1;
  const narrow = window.innerWidth < 760;
  const radius = rows.length > 40 ? 4 : narrow ? 6 : 10;

  // Average of exactly the weeks on screen, so it changes with 12w / 26w / All.
  const avgKm = rows.reduce((s, r) => s + r.km, 0) / (rows.length || 1);

  /* ---- Distance ---- */
  const distData = {
    labels: rows.map((r) => r.label),
    datasets: [
      {
        type: "bar",
        label: "Distance",
        data: rows.map((r) => r.km),
        backgroundColor: colors,
        hoverBackgroundColor: colors.map((c) => withAlpha(c, 0.8)),
        borderRadius: radius,
        borderSkipped: false,
        borderColor: rows.map((_, i) => (i === lastIdx ? INK : "transparent")),
        borderWidth: rows.map((_, i) => (i === lastIdx ? 2 : 0)),
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

  if (distanceChart) distanceChart.destroy();
  distanceChart = new Chart(document.getElementById("distance-chart"), {
    data: distData,
    options: distOpts,
    plugins: [avgLabelPlugin],
  });

  /* ---- TRIMP ---- */
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

  document.getElementById("dist-sub").textContent =
    range === "all" ? `kilometres per week · all ${all.length} weeks` : `kilometres per week · last ${rows.length} weeks`;
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
let range = "26";

/** Draw everything that depends on the weekly rows. */
function renderAll(rows, sourceNote) {
  allRows = rows;
  clearError();
  renderHero(rows);
  renderCharts(rows, range);
  const first = rows[0];
  document.getElementById("foot-text").textContent =
    `${rows.length} weeks logged since ${first.start ? `${MONTHS[first.start.getMonth()]} ${first.start.getFullYear()}` : first.label}` +
    (sourceNote ? ` · ${sourceNote}` : "");
}

function setupChartControls() {
  const buttons = document.querySelectorAll(".range button");
  const pick = (r) => {
    range = r;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === r)));
    if (allRows.length) renderCharts(allRows, r);
  };
  buttons.forEach((b) => b.addEventListener("click", () => pick(b.dataset.range)));

  // Bar corner radius depends on width; redraw when crossing the breakpoint.
  let wasNarrow = window.innerWidth < 760;
  window.addEventListener("resize", () => {
    const isNarrow = window.innerWidth < 760;
    if (isNarrow !== wasNarrow && allRows.length) { wasNarrow = isNarrow; renderCharts(allRows, range); }
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
    const { title, weeks } = await SheetSource.load();
    if (!weeks.length) throw new Error("Connected, but found no weeks with km logged yet.");
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
