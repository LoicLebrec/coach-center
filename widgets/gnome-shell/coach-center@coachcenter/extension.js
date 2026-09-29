/**
 * Coach Center — GNOME Shell panel widget.
 * Reads the same widget feed as the iPhone widget (tokenized JSON URL) from
 * ~/.config/coach-center/widget.json: { "feedUrl": "...", "appUrl": "..." }
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup?version=3.0';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const REFRESH_SECONDS = 30 * 60;
const CONFIG_PATH = GLib.build_filenamev([GLib.get_user_config_dir(), 'coach-center', 'widget.json']);
const CACHE_PATH = GLib.build_filenamev([GLib.get_user_cache_dir(), 'coach-center', 'widget.json']);
const ZC = { Z1: '#94a3b8', Z2: '#22c55e', Z3: '#eab308', Z4: '#f97316', Z5: '#ef4444', Z6: '#dc2626', Z7: '#a855f7' };
const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function readJson(path) {
  try {
    const [ok, bytes] = GLib.file_get_contents(path);
    return ok ? JSON.parse(new TextDecoder().decode(bytes)) : null;
  } catch {
    return null;
  }
}

function writeJson(path, obj) {
  try {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
    GLib.file_set_contents(path, JSON.stringify(obj));
  } catch (e) {
    console.warn(`[coach-center] cache write failed: ${e.message}`);
  }
}

function todayKey() {
  return GLib.DateTime.new_now_local().format('%Y-%m-%d');
}

// If the snapshot is from another day, fall back to today's week-plan entry.
function resolveToday(s) {
  if (!s) return null;
  const t = todayKey();
  if (s.date === t) return { fresh: true, session: s.session };
  const d = (s.week || []).find(x => x.date === t);
  if (!d) return { fresh: false, session: null };
  if (d.type === 'Repos') return { fresh: false, session: { kind: 'rest', title: 'Repos' } };
  return { fresh: false, session: { kind: 'plan', title: d.type, type: d.type, minutes: d.minutes } };
}

function meta(sess) {
  if (!sess) return '';
  if (sess.kind === 'rest') return 'Récupération';
  if (sess.kind === 'race') return 'Jour de course';
  return [sess.type, sess.minutes ? `${sess.minutes} min` : null, sess.tss ? `~${sess.tss} TSS` : null].filter(Boolean).join(' · ');
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
  _init(ext) {
    super._init(0.0, 'Coach Center');
    this._ext = ext;
    this._session = new Soup.Session({ timeout: 15 });

    const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
    this._dot = new St.Label({ text: '●', style_class: 'cc-panel-dot', y_align: Clutter.ActorAlign.CENTER });
    this._label = new St.Label({ text: ' Coach', style_class: 'cc-panel-label', y_align: Clutter.ActorAlign.CENTER });
    box.add_child(this._dot);
    box.add_child(this._label);
    this.add_child(box);

    this._content = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    this._body = new St.BoxLayout({ vertical: true, style_class: 'cc-box', x_expand: true });
    this._content.add_child(this._body);
    this.menu.addMenuItem(this._content);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const refresh = new PopupMenu.PopupMenuItem('Actualiser');
    refresh.connect('activate', () => this.refresh());
    this.menu.addMenuItem(refresh);
    const open = new PopupMenu.PopupMenuItem('Ouvrir Coach Center');
    open.connect('activate', () => {
      const url = readJson(CONFIG_PATH)?.appUrl;
      if (url) Gio.AppInfo.launch_default_for_uri(url, null);
    });
    this.menu.addMenuItem(open);

    this._render(readJson(CACHE_PATH)?.snapshot || null, null);
    this.refresh();
    this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
      this.refresh();
      return GLib.SOURCE_CONTINUE;
    });
  }

  refresh() {
    const cfg = readJson(CONFIG_PATH);
    if (!cfg?.feedUrl) {
      this._render(null, `Configure ${CONFIG_PATH}`);
      return;
    }
    const msg = Soup.Message.new('GET', cfg.feedUrl);
    if (!msg) {
      this._render(null, 'URL du flux invalide');
      return;
    }
    this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
      try {
        const bytes = session.send_and_read_finish(res);
        if (msg.get_status() !== 200) throw new Error(`HTTP ${msg.get_status()}`);
        const json = JSON.parse(new TextDecoder().decode(bytes.get_data()));
        writeJson(CACHE_PATH, json);
        this._render(json.snapshot, null);
      } catch (e) {
        this._render(readJson(CACHE_PATH)?.snapshot || null, `Hors ligne (${e.message})`);
      }
    });
  }

  _text(parent, text, style) {
    const l = new St.Label({ text: String(text ?? ''), style_class: style || '' });
    l.clutter_text.line_wrap = true;
    parent.add_child(l);
    return l;
  }

  _render(s, error) {
    if (!this._body) return;
    this._body.destroy_all_children();
    const r = resolveToday(s);
    const sess = r?.session;

    // Panel label: short and glanceable.
    let short = 'Coach';
    if (sess) short = sess.kind === 'rest' ? 'Repos' : `${sess.type || sess.title}${sess.minutes ? ` ${sess.minutes}′` : ''}`;
    this._label.text = ` ${short}`;
    const tone = r?.fresh && s?.readiness?.tone;
    this._dot.style_class = `cc-panel-dot${tone ? ` cc-${tone}` : ''}`;

    if (!s) {
      this._text(this._body, 'COACH CENTER', 'cc-eyebrow');
      this._text(this._body, error || 'Ouvre l’app pour générer ta séance du jour.', 'cc-muted');
      return;
    }

    const head = new St.BoxLayout();
    this._text(head, 'AUJOURD’HUI', 'cc-eyebrow');
    head.add_child(new St.Widget({ x_expand: true }));
    this._text(head, s.phase || '', 'cc-muted');
    this._body.add_child(head);
    if (!r.fresh) this._text(this._body, 'Plan de la semaine · ouvre l’app pour adapter', 'cc-muted');

    this._text(this._body, sess ? (sess.kind === 'race' ? `🏁 ${sess.title}` : sess.title) : 'Pas de séance', 'cc-title');
    this._text(this._body, meta(sess), 'cc-muted');

    if (r.fresh && sess?.zones?.length) {
      const bar = new St.BoxLayout({ style_class: 'cc-zonebar', y_align: Clutter.ActorAlign.END });
      const total = sess.zones.reduce((a, z) => a + z[1], 0) || 1;
      const W = 320;
      for (const [zone, min] of sess.zones) {
        const n = parseInt(String(zone).slice(1), 10) || 2;
        bar.add_child(new St.Widget({
          y_align: Clutter.ActorAlign.END,
          style: `background-color: ${ZC[zone] || ZC.Z2}; width: ${Math.max(1, Math.round((min / total) * W))}px; height: ${Math.round(4 + n * 1.5)}px;`,
        }));
      }
      this._body.add_child(bar);
    }
    if (r.fresh && sess?.lines?.length) for (const line of sess.lines) this._text(this._body, `• ${line}`, 'cc-line');
    if (r.fresh && sess?.changes?.length) this._text(this._body, `Adapté : ${sess.changes.join(' · ')}`, 'cc-change');

    const stats = new St.BoxLayout({ style_class: 'cc-stats' });
    const stat = (label, value, t) => {
      const b = new St.BoxLayout({ vertical: true });
      this._text(b, label, 'cc-stat-label');
      this._text(b, value ?? '—', `cc-stat-value${t ? ` cc-${t}` : ''}`);
      stats.add_child(b);
    };
    if (r.fresh && s.readiness) stat('PRÊT', `${s.readiness.score}/100`, s.readiness.tone);
    if (s.form) stat('TSB', s.form.tsb, s.form.tone);
    if (s.load?.target) stat('SEMAINE', `${s.load.done}/${s.load.target}`);
    if (s.nextRace?.days != null) stat('COURSE', `J-${s.nextRace.days}`, 'orange');
    this._body.add_child(stats);

    const week = new St.BoxLayout({ style_class: 'cc-week' });
    const t = todayKey();
    (s.week || []).forEach((d, i) => {
      const c = new St.BoxLayout({ vertical: true, style_class: `cc-day${d.date === t ? ' cc-day-today' : ''}` });
      this._text(c, LETTERS[i], 'cc-day-letter');
      this._text(c, d.type === 'Repos' ? '—' : (d.type || '').slice(0, 7), 'cc-day-type');
      if (d.minutes) this._text(c, `${d.minutes}′`, 'cc-muted');
      week.add_child(c);
    });
    this._body.add_child(week);

    for (const sig of (s.signals || []).slice(0, 3)) this._text(this._body, `● ${sig.title}`, `cc-muted cc-${sig.tone}`);
    if (s.cycle) this._text(this._body, `Cycle suggéré : ${s.cycle.title}${s.cycle.summary ? ` — ${s.cycle.summary}` : ''}`, 'cc-muted');

    const when = s.generatedAt ? GLib.DateTime.new_from_iso8601(s.generatedAt, null)?.to_local()?.format('%H:%M') : null;
    this._text(this._body, `${s.source === 'server' ? 'Calcul serveur' : 'Depuis l’app'}${when ? ` · ${when}` : ''}${error ? ` · ${error}` : ''}`, 'cc-muted');
  }

  destroy() {
    if (this._timer) GLib.source_remove(this._timer);
    this._timer = null;
    this._session?.abort();
    this._session = null;
    this._body = null;
    super.destroy();
  }
});

export default class CoachCenterExtension extends Extension {
  enable() {
    this._indicator = new Indicator(this);
    Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
  }

  disable() {
    this._indicator?.destroy();
    this._indicator = null;
  }
}
