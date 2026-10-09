/**
 * iOS home-screen / lock-screen widget, run by the free Scriptable app.
 * Settings fills in the feed URL (tokenized) and the app URL, the user pastes it
 * into a new Scriptable script and adds a Scriptable widget pointing at it.
 *
 * The template avoids backticks and "${" so it can live in a String.raw literal.
 */

const TEMPLATE = String.raw`// Coach Center — widget iPhone (Scriptable)
// Petit, moyen, grand + écran verrouillé.
const FEED = "__FEED_URL__";
const APP = "__APP_URL__";

const C = {
  bg: new Color("#0f1318"), card: new Color("#1a2029"), text: new Color("#f1f5f9"),
  muted: new Color("#94a3b8"), orange: new Color("#f97316"),
};
const TONE = {
  green: "#22c55e", yellow: "#eab308", orange: "#f97316", red: "#ef4444",
  blue: "#3b82f6", muted: "#94a3b8", default: "#f1f5f9",
};
const ZC = { Z1: "#94a3b8", Z2: "#22c55e", Z3: "#eab308", Z4: "#f97316", Z5: "#ef4444", Z6: "#dc2626", Z7: "#a855f7" };
const tone = (t) => new Color(TONE[t] || TONE.default);

async function load() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.cacheDirectory(), "coach-center-widget.json");
  try {
    const r = new Request(FEED);
    r.timeoutInterval = 10;
    const j = await r.loadJSON();
    if (j && j.snapshot) {
      fm.writeString(cache, JSON.stringify(j));
      return j.snapshot;
    }
  } catch (e) { /* offline: fall back to cache */ }
  if (fm.fileExists(cache)) {
    try { return JSON.parse(fm.readString(cache)).snapshot; } catch (e) { return null; }
  }
  return null;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// If the app was not opened today, fall back to today's entry of the week plan.
function resolveToday(s) {
  if (!s) return null;
  const t = todayKey();
  if (s.date === t) return { fresh: true, session: s.session };
  const d = (s.week || []).find(x => x.date === t);
  if (!d) return { fresh: false, session: null };
  if (d.type === "Repos") return { fresh: false, session: { kind: "rest", title: "Repos" } };
  return { fresh: false, session: { kind: "plan", title: d.type, type: d.type, minutes: d.minutes } };
}

function zoneBar(zones, w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const total = zones.reduce((s, z) => s + z[1], 0) || 1;
  let x = 0;
  for (const z of zones) {
    const bw = (z[1] / total) * w;
    const n = parseInt(String(z[0]).slice(1), 10) || 2;
    const bh = h * Math.min(1, 0.3 + n * 0.1);
    dc.setFillColor(new Color(ZC[z[0]] || ZC.Z2));
    dc.fillRect(new Rect(x, h - bh, Math.max(bw - 0.6, 0.6), bh));
    x += bw;
  }
  return dc.getImage();
}

function text(stack, str, size, color, bold) {
  const t = stack.addText(String(str));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color || C.text;
  return t;
}

function pill(stack, str, color) {
  const p = stack.addStack();
  p.backgroundColor = new Color(color.hex, 0.18);
  p.cornerRadius = 6;
  p.setPadding(2, 6, 2, 6);
  const t = p.addText(str);
  t.font = Font.boldSystemFont(10);
  t.textColor = color;
  return p;
}

function sessionMeta(sess) {
  if (!sess) return "";
  if (sess.kind === "rest") return "Récupération";
  if (sess.kind === "race") return "Jour de course";
  const parts = [];
  if (sess.minutes) parts.push(sess.minutes + " min");
  if (sess.tss) parts.push("~" + sess.tss + " TSS");
  return parts.join(" · ");
}

function header(w, s, fresh) {
  const h = w.addStack();
  h.centerAlignContent();
  text(h, "AUJOURD'HUI", 10, C.orange, true);
  h.addSpacer();
  if (s && s.phase) text(h, s.phase, 10, C.muted);
  if (!fresh) {
    w.addSpacer(2);
    text(w, "Plan · ouvre l'app pour adapter", 9, C.muted);
  }
}

function sessionBlock(w, sess, family, fresh) {
  if (!sess) { text(w, "Pas de séance", 15, C.text, true); return; }
  const title = text(w, sess.kind === "race" ? "Course : " + sess.title : sess.title, family === "small" ? 14 : 16, C.text, true);
  title.lineLimit = 2;
  title.minimumScaleFactor = 0.7;
  w.addSpacer(2);
  text(w, [sess.type, sessionMeta(sess)].filter(Boolean).join(" · "), 11, C.muted);
  if (fresh && sess.zones && sess.zones.length) {
    w.addSpacer(6);
    const img = w.addImage(zoneBar(sess.zones, family === "small" ? 130 : 300, 22));
    img.imageSize = new Size(family === "small" ? 130 : 300, 22);
  }
}

function stat(stack, label, value, color) {
  const s = stack.addStack();
  s.layoutVertically();
  text(s, label, 9, C.muted);
  text(s, value == null ? "—" : value, 15, color || C.text, true);
}

async function build() {
  const s = await load();
  const family = config.widgetFamily || "large";
  const w = new ListWidget();
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  const r = resolveToday(s);
  const sess = r && r.session;

  // ── Lock screen ──
  if (family === "accessoryInline") {
    w.addText(sess ? sess.title + (sess.minutes ? " · " + sess.minutes + "′" : "") : "Coach Center");
    return w;
  }
  if (family === "accessoryCircular") {
    const st = w.addStack();
    st.layoutVertically();
    st.centerAlignContent();
    const v = st.addText(s && r.fresh && s.readiness ? String(s.readiness.score) : "—");
    v.font = Font.boldSystemFont(18);
    const l = st.addText("forme");
    l.font = Font.systemFont(9);
    return w;
  }
  if (family === "accessoryRectangular") {
    const t = w.addText(sess ? sess.title : "Coach Center");
    t.font = Font.boldSystemFont(13);
    t.lineLimit = 1;
    w.addText(sessionMeta(sess) || "").font = Font.systemFont(11);
    if (s && r.fresh && s.readiness) w.addText(s.readiness.score + "/100 · " + s.readiness.title).font = Font.systemFont(11);
    return w;
  }

  // ── Home screen ──
  w.backgroundColor = C.bg;
  w.setPadding(12, 14, 12, 14);

  if (!s) {
    text(w, "Coach Center", 14, C.orange, true);
    w.addSpacer(4);
    text(w, "Ouvre l'app une fois pour générer ta séance du jour.", 12, C.muted);
    return w;
  }

  header(w, s, r.fresh);
  w.addSpacer(6);

  if (family === "small") {
    sessionBlock(w, sess, family, r.fresh);
    w.addSpacer();
    if (r.fresh && s.readiness) pill(w.addStack(), s.readiness.score + " · " + s.readiness.title, tone(s.readiness.tone));
    return w;
  }

  sessionBlock(w, sess, family, r.fresh);
  w.addSpacer(8);

  const row = w.addStack();
  row.spacing = 14;
  if (r.fresh && s.readiness) stat(row, "PRÊT", s.readiness.score + "/100", tone(s.readiness.tone));
  if (s.form) stat(row, "TSB", s.form.tsb, tone(s.form.tone));
  if (s.load && s.load.target) stat(row, "SEMAINE", s.load.done + "/" + s.load.target);
  if (s.nextRace && s.nextRace.days != null) stat(row, "COURSE", "J-" + s.nextRace.days, C.orange);

  if (family === "large") {
    if (r.fresh && sess && sess.lines && sess.lines.length) {
      w.addSpacer(10);
      for (const line of sess.lines) {
        const t = text(w, "• " + line, 11, C.text);
        t.lineLimit = 1;
        t.minimumScaleFactor = 0.8;
      }
    }
    if (r.fresh && sess && sess.changes && sess.changes.length) {
      w.addSpacer(6);
      const t = text(w, "Adapté : " + sess.changes.join(" · "), 10, C.orange);
      t.lineLimit = 2;
    }
    w.addSpacer(10);
    const wk = w.addStack();
    wk.spacing = 4;
    const t = todayKey();
    const letters = ["L", "M", "M", "J", "V", "S", "D"];
    (s.week || []).forEach((d, i) => {
      const c = wk.addStack();
      c.layoutVertically();
      c.size = new Size(40, 38);
      c.cornerRadius = 6;
      c.setPadding(3, 4, 3, 4);
      c.backgroundColor = d.date === t ? new Color(C.orange.hex, 0.22) : C.card;
      text(c, letters[i], 9, d.date === t ? C.orange : C.muted, true);
      const ty = text(c, d.type === "Repos" ? "—" : d.type, 8, C.text);
      ty.lineLimit = 1;
      ty.minimumScaleFactor = 0.6;
      if (d.minutes) text(c, d.minutes + "′", 8, C.muted);
    });
    if (s.signals && s.signals.length) {
      w.addSpacer(8);
      for (const sig of s.signals.slice(0, 2)) {
        const st = text(w, "● " + sig.title, 10, tone(sig.tone));
        st.lineLimit = 1;
        st.minimumScaleFactor = 0.8;
      }
    }
  }
  w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
`;

export function buildScriptableWidget(feedUrl, appUrl) {
  return TEMPLATE.replace('__FEED_URL__', feedUrl).replace('__APP_URL__', appUrl);
}
