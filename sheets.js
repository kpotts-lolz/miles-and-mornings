/* ------------------------------------------------------------
   Miles & Mornings — private Google Sheets source
   Signs in with Google (read-only) and turns the coach's training log
   into weekly rows: [{ label, km, trimp, start: Date }, …] oldest → newest.

   Only columns A, B, N and T are ever requested:
     A  weekday / "WEEKLY TOTALS"     B  date
     N  km                            T  TRIMP
   Sleep, injuries, mental health and comments never leave the sheet.
   ------------------------------------------------------------ */

const SheetSource = (() => {
  /* Offer sign-in on localhost:8000 and on any https host (e.g. GitHub Pages).
     Google still only accepts the origins authorized on the OAuth client, so
     add each hosted address in Google Cloud → Credentials → Authorized JavaScript origins. */
  const LOCAL_ORIGIN = "http://localhost:8000";
  const canOfferSignIn = () => location.origin === LOCAL_ORIGIN || location.protocol === "https:";
  const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
  const FIRST_DATA_ROW = 3; // rows 1–2 are the two-row header
  const TOKEN_KEY = "mm.sheetToken";
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  let cfg = null;
  let tokenClient = null;
  let token = null;

  /* ---------- setup ---------- */

  /** Resolves true if this page can use the sheet (right origin + config.js present). */
  async function available() {
    if (!canOfferSignIn()) return false;
    try {
      await loadScript("config.js");
      cfg = window.APP_CONFIG;
      if (!cfg || !cfg.clientId || !cfg.spreadsheetId || !cfg.tabName) return false;
      await loadScript("https://accounts.google.com/gsi/client");
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Couldn't load ${src}`));
      document.head.append(s);
    });
  }

  /* ---------- tokens (kept for this tab only, until they expire) ---------- */

  function saveToken(t, expiresInSec) {
    token = t;
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ t, exp: Date.now() + (expiresInSec - 60) * 1000 }));
    } catch (_) { /* storage blocked: token lives in memory only */ }
  }

  function clearToken() {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
  }

  /** Reuse a still-valid token from earlier in this tab, so reloads stay live. */
  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
      if (saved && saved.t && saved.exp > Date.now()) { token = saved.t; return true; }
    } catch (_) {}
    clearToken();
    return false;
  }

  /** Opens Google's popup. Resolves when access is granted; rejects with a friendly Error. */
  function signIn() {
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) {
            return reject(friendly(resp.error === "access_denied"
              ? "Access denied — the page needs read-only access to your sheets."
              : `Google sign-in error: ${resp.error}`));
          }
          if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
            return reject(friendly("Access denied — leave the Google Sheets box ticked when you sign in."));
          }
          saveToken(resp.access_token, Number(resp.expires_in) || 3600);
          resolve();
        },
        error_callback: (err) => {
          const type = err && err.type;
          reject(friendly(
            type === "popup_closed" ? "Sign-in cancelled." :
            type === "popup_failed_to_open" ? "The Google popup was blocked. Allow popups for this site." :
            `Sign-in didn't complete (${type || "unknown"}).`
          ));
        },
      });
      tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  function signOut() {
    const t = token;
    clearToken();
    if (t && window.google) google.accounts.oauth2.revoke(t, () => {});
  }

  function friendly(message, extra = {}) {
    return Object.assign(new Error(message), extra);
  }

  /* ---------- reading the sheet ---------- */

  /** Fetch columns A, B, N, T and return { title, weeks }. `t` overrides the stored token (for testing). */
  async function load(t = token) {
    if (!t) throw friendly("Not signed in.", { needsSignIn: true });

    const id = encodeURIComponent(cfg.spreadsheetId);
    const tab = `'${cfg.tabName.replace(/'/g, "''")}'`;
    const cols = ["A", "B", "N", "T"];
    const params = cols.map((c) => "ranges=" + encodeURIComponent(`${tab}!${c}${FIRST_DATA_ROW}:${c}`)).join("&");
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}` +
      "&majorDimension=COLUMNS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER";
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title`;

    const headers = { Authorization: `Bearer ${t}` };
    const [res, metaRes] = await Promise.all([fetch(url, { headers }), fetch(metaUrl, { headers })]);
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (body.error && body.error.message) || `HTTP ${res.status}`;
      if (res.status === 401) { clearToken(); throw friendly("Your Google sign-in expired. Connect again.", { needsSignIn: true }); }
      if (res.status === 404) throw friendly("Spreadsheet not found — check spreadsheetId in config.js.");
      if (res.status === 403) throw friendly("This Google account can't open the training log. Sign in with the account it's shared with.", { needsSignIn: true });
      if (res.status === 400 && /parse range/i.test(msg)) throw friendly(`No tab called "${cfg.tabName}" — check tabName in config.js.`);
      throw friendly(`Google Sheets error: ${msg}`);
    }

    const meta = metaRes.ok ? await metaRes.json().catch(() => ({})) : {};
    const title = (meta.properties && meta.properties.title) || "training log";
    const [A, B, N, T] = (body.valueRanges || []).map((vr) => (vr.values && vr.values[0]) || []);
    return { title, weeks: parseWeeks(A, B, N, T, title) };
  }

  /**
   * Walk the log top to bottom. Day rows carry dates (AM rows only); each
   * "WEEKLY TOTALS" row closes the week above it and holds the coach's own
   * km (N) and TRIMP (T) for that week.
   */
  function parseWeeks(A, B, N, T, title = "") {
    const today = new Date();
    let year = seasonStartYear(B, title, today);
    let prevMonth = null;
    let weekStart = null;
    const weeks = [];

    const len = Math.max(A.length, B.length);
    for (let i = 0; i < len; i++) {
      const a = String(A[i] ?? "").trim();

      if (/weekly\s*totals?/i.test(a)) {
        if (weekStart) {
          weeks.push({ start: weekStart, km: num(N[i]), trimp: num(T[i]) });
        }
        weekStart = null;
        continue;
      }

      // The sheet shows only month + day, and the years stored behind the
      // dates aren't reliable (later rows still say 2025). So use month/day
      // and count the year up whenever the month wraps (Dec → Jan).
      const d = toMonthDay(B[i]);
      if (d) {
        if (prevMonth !== null && d.month < prevMonth) year++;
        prevMonth = d.month;
        if (!weekStart) weekStart = new Date(year, d.month, d.day);
      }
    }

    // Keep weeks that have started, and drop leading weeks before km logging began.
    let rows = weeks.filter((w) => w.start <= today);
    const firstKm = rows.findIndex((w) => Number.isFinite(w.km) && w.km > 0);
    rows = firstKm === -1 ? [] : rows.slice(firstKm);

    return rows.map((w) => ({
      label: weekLabel(w.start),
      start: w.start,
      km: Number.isFinite(w.km) ? w.km : 0,
      trimp: Number.isFinite(w.trimp) ? w.trimp : 0,
    }));
  }

  /** Cell → number. Trims float noise (22.049999… → 22.05) so rounding matches what the sheet shows. */
  function num(v) {
    if (String(v ?? "").trim() === "") return NaN;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : NaN;
  }

  function serialToUTCDate(v) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); // Sheets serial: days since 1899-12-30
  }

  /** Cell → { month, day } from a real date (serial number) or text like "July 21"; null if not a date. */
  function toMonthDay(v) {
    if (typeof v === "number" && v > 20000 && v < 80000) {
      const u = serialToUTCDate(v);
      return { month: u.getUTCMonth(), day: u.getUTCDate() };
    }
    const m = String(v ?? "").trim().match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})/);
    if (!m) return null;
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return month === -1 ? null : { month, day: Number(m[2]) };
  }

  /** Year of the first row: from the title ("Training Log 2025-26" → 2025), else the first stored date. */
  function seasonStartYear(B, title, today) {
    const y = String(title).match(/(20\d{2})/);
    if (y) return Number(y[1]);
    const firstSerial = B.find((v) => typeof v === "number" && v > 20000 && v < 80000);
    if (firstSerial) return serialToUTCDate(firstSerial).getUTCFullYear();
    const first = B.map(toMonthDay).find(Boolean);
    return first && first.month > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear();
  }

  function weekLabel(start) {
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const f = (d) => `${d.toLocaleString("en", { month: "short" })} ${String(d.getDate()).padStart(2, "0")}`;
    return `${f(start)} - ${f(end)}`;
  }

  return { available, restore, signIn, signOut, load, parseWeeks, get signedIn() { return !!token; } };
})();
