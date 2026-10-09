import { analyzeTraining, decideSession, estimateTss, parsePowerCurve, powerProfile, isHardActivity } from './coachEngine';

const TODAY = '2026-09-24'; // Thursday

function key(offset) {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wellness({ ctl = 60, atl = 60, ctlWeekAgo = 57, hrv = () => 60 } = {}) {
  return Array.from({ length: 61 }, (_, i) => {
    const off = i - 60;
    return { id: key(off), icu_ctl: off <= -7 ? ctlWeekAgo : ctl, icu_atl: atl, hrv: hrv(off), restingHR: 48 };
  });
}

const ride = (off, extra) => ({ start_date_local: `${key(off)}T08:00:00`, type: 'Ride', moving_time: 5400, ...extra });
const season = { phase: 'build', isRecoveryWeek: false };

test('estimateTss: 1 h at Z4 midpoint ≈ 96', () => {
  expect(estimateTss([{ durationMin: 60, zone: 'Z4' }])).toBe(96);
});

test('isHardActivity from IF percentage and zone times', () => {
  expect(isHardActivity({ icu_intensity: 88 })).toBe(true);
  expect(isHardActivity({ icu_intensity: 70 })).toBe(false);
  expect(isHardActivity({ icu_zone_times: [{ id: 'Z2', secs: 3000 }, { id: 'Z5', secs: 900 }] })).toBe(true);
});

test('hard session yesterday pushes today\'s VO2 to endurance', () => {
  const a = analyzeTraining({ wellness: wellness(), activities: [ride(-1, { icu_intensity: 92, icu_training_load: 110 })], seasonState: season, today: TODAY });
  expect(a.lastHard.daysAgo).toBe(1);
  const d = decideSession({ type: 'vo2', minutes: 75 }, a);
  expect(d.type).toBe('endurance');
  expect(d.changes[0].ref).toMatch(/Seiler/);
});

test('HRV 7-day mean below baseline band removes intensity', () => {
  const a = analyzeTraining({ wellness: wellness({ hrv: off => (off > -7 ? 40 : 60 + (off % 3)) }), activities: [], seasonState: season, today: TODAY });
  expect(a.hrv.status).toBe('low');
  expect(decideSession({ type: 'threshold', minutes: 90 }, a).type).toBe('endurance');
});

test('weekly TSS target follows CTL + phase ramp', () => {
  const a = analyzeTraining({ wellness: wellness({ ctl: 60 }), activities: [], seasonState: season, today: TODAY });
  expect(a.week.weekTarget).toBe(7 * (60 + 6 * 5));
});

test('grey-zone heavy month turns tempo into endurance', () => {
  const acts = Array.from({ length: 10 }, (_, i) => ride(-2 - i * 2, {
    icu_zone_times: [{ id: 'Z2', secs: 2400 }, { id: 'Z3', secs: 2400 }, { id: 'Z4', secs: 300 }],
  }));
  const a = analyzeTraining({ wellness: wellness(), activities: acts, seasonState: season, today: TODAY });
  expect(a.distribution.verdict).toBe('grey');
  expect(decideSession({ type: 'tempo', minutes: 90 }, a).type).toBe('endurance');
});

test('power profile finds the weakest duration', () => {
  const curve = { list: [{ secs: [5, 60, 300, 1200], watts: [1300, 640, 310, 290] }] };
  expect(parsePowerCurve(curve)).toHaveLength(4);
  const p = powerProfile(curve, 280, 70);
  expect(p.limiter).toBe('vo2max');
});

describe('suggestCycle', () => {
  const { suggestCycle } = require('./coachEngine');
  const { getSeasonState } = require('./periodization');

  test('no running cycle → starts next Monday, 3:1, CTL projection rises', () => {
    const cfg = { mode: 'auto', cycle: '3:1' };
    const st = getSeasonState(cfg, new Date(`${TODAY}T12:00:00`));
    const a = analyzeTraining({ wellness: wellness({ ctl: 60, atl: 58 }), activities: [], seasonState: st, today: TODAY });
    const c = suggestCycle({ analysis: a, seasonState: st, season: cfg, today: TODAY });
    expect(c.start).toBe('2026-09-28');
    expect(c.cycle).toBe('3:1');
    expect(c.weeks).toHaveLength(4);
    expect(c.weeks[3].kind).toBe('recovery');
    expect(c.weeks[3].tss).toBeLessThan(c.weeks[0].tss);
  });

  test('high fatigue → 2:1; A-race 6 weeks out → build with limiter focus', () => {
    const cfg = { mode: 'auto', cycle: '3:1', targetDate: '2026-11-16', targetName: 'Chrono' };
    const st = getSeasonState(cfg, new Date(`${TODAY}T12:00:00`));
    const curve = { list: [{ secs: [5, 60, 300], watts: [1300, 640, 310] }] };
    const a = analyzeTraining({ wellness: wellness({ ctl: 60, atl: 95 }), activities: [], powerCurve: curve, athlete: { icu_ftp: 290, icu_weight: 70 }, seasonState: st, today: TODAY });
    const c = suggestCycle({ analysis: a, seasonState: st, season: cfg, today: TODAY });
    expect(c.cycle).toBe('2:1');
    expect(c.phase).toBe('build');
    expect(c.focus).toBe('vo2max');
    expect(c.config.mode).toBe('manual');
  });
});

describe('computeDay + buildSnapshot', () => {
  const { computeDay, buildSnapshot } = require('./dailyPlan');
  test('produces a widget snapshot for today', () => {
    const day = computeDay({ wellness: wellness(), activities: [ride(-1, { icu_intensity: 92, icu_training_load: 110 })], season: { mode: 'manual', phase: 'build' }, today: TODAY });
    const snap = buildSnapshot(day, { ftp: 280, source: 'server' });
    expect(snap.date).toBe(TODAY);
    expect(snap.week).toHaveLength(7);
    expect(snap.source).toBe('server');
    expect(snap.session).toBeTruthy();
  });
});

test('flat HRV history is not flagged as low', () => {
  const a = analyzeTraining({ wellness: wellness({ hrv: () => 60 }), activities: [], seasonState: season, today: TODAY });
  expect(a.hrv.status).toBe('normal');
});

describe('buildOutlook + day overrides', () => {
  const { buildOutlook, computeDay } = require('./dailyPlan');
  const season = { mode: 'manual', phase: 'build', phaseStart: '2026-09-07' };

  test('four weeks from this Monday, each day with a session or rest', () => {
    const weeks = buildOutlook({ season, today: TODAY });
    expect(weeks).toHaveLength(4);
    expect(weeks[0].start).toBe('2026-09-21');
    expect(weeks[1].start).toBe('2026-09-28');
    weeks.forEach(w => expect(w.days).toHaveLength(7));
    const tue = weeks[1].days[1];
    expect(tue.source).toBe('plan');
    expect(tue.blocks.length).toBeGreaterThan(0);
    expect(tue.tss).toBeGreaterThan(0);
  });

  test('override replaces the template; a race still wins', () => {
    const overrides = { [key(2)]: { type: 'rest' }, [key(3)]: { type: 'vo2', minutes: 75 } }; // Sat, Sun
    const plannedEvents = [{ start_date_local: `${key(3)}T09:00:00`, name: 'Course', kind: 'race' }];
    const [w0] = buildOutlook({ season: { ...season, dayOverrides: overrides }, plannedEvents, today: TODAY });
    expect(w0.days[5]).toMatchObject({ type: 'rest', source: 'override' });
    expect(w0.days[6]).toMatchObject({ type: 'race', source: 'race' });
  });

  test("today's session follows an override", () => {
    const day = computeDay({
      wellness: wellness(), activities: [], today: TODAY,
      season: { ...season, dayOverrides: { [TODAY]: { type: 'endurance', minutes: 120 } } },
    });
    expect(day.base.source).toBe('override');
    expect(day.base.trainingType).toBe('endurance');
    expect(day.week[3]).toMatchObject({ type: 'endurance', minutes: 120 });
  });
});

test('a ride done today does not re-adapt today\'s session', () => {
  const w = wellness();
  w[w.length - 1] = { ...w[w.length - 1], icu_atl: 95 }; // today's row already counts today's ride
  const done = ride(0, { icu_intensity: 95, icu_training_load: 120 });
  const before = analyzeTraining({ wellness: w, activities: [], seasonState: season, today: TODAY });
  const after = analyzeTraining({ wellness: w, activities: [done], seasonState: season, today: TODAY });
  expect(after.lastHard).toBeNull();
  expect(after.load.atl).toBe(60);
  expect(after.week.perDay).toBe(before.week.perDay);
  expect(after.week.todayTss).toBe(120);
  expect(after.week.hardToday).toBe(true);
  expect(decideSession({ type: 'vo2', minutes: 75 }, after)).toEqual(decideSession({ type: 'vo2', minutes: 75 }, before));
});

test('weeklyTotals buckets Monday→Sunday weeks', () => {
  // eslint-disable-next-line global-require
  const { weeklyTotals } = require('../components/WeeklyLoad');
  const acts = [
    { start_date_local: '2026-10-05T08:00:00', icu_training_load: 50, moving_time: 3600, distance: 30000 }, // Monday
    { start_date_local: '2026-10-04T08:00:00', icu_training_load: 80, moving_time: 7200, distance: 60000 }, // Sunday before
  ];
  const w = weeklyTotals(acts, 2, new Date('2026-10-09T12:00:00'));
  expect(w.map(x => x.start)).toEqual(['2026-09-28', '2026-10-05']);
  expect(w.map(x => x.tss)).toEqual([80, 50]);
  expect(w[1].current).toBe(true);
});
