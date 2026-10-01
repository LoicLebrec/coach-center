import { weekRanges, weeklyBests, dailySeries, buildBlocks, computeProfile } from './responderProfile';
import { templateForDay, progressionFor, getSeasonState } from './periodization';

function day(key, n) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 40 weeks from Monday 2026-01-05: ride Tue-Sun 1 h, Monday off; 20-min power climbs 1 W/week.
const START = '2026-01-05';
const acts = [];
for (let i = 0; i < 280; i++) {
  if (i % 7 === 0) continue;
  acts.push({
    type: 'Ride', start_date_local: `${day(START, i)}T09:00:00`, moving_time: 3600, icu_training_load: 50, icu_intensity: 70,
    icu_zone_times: [{ id: 'Z2', secs: 3000 }, { id: 'Z5', secs: 600 }],
  });
}
const curves = Array.from({ length: 40 }, (_, w) => ({
  start_date_local: `${day(START, 7 * w)}T00:00:00`, secs: [5, 60, 300, 1200], watts: [900, 450, 330, 270 + w],
}));

test('week ranges run Monday to Sunday', () => {
  expect(weekRanges('2026-09-30', '2026-10-12')).toEqual(['r.2026-09-28.2026-10-04', 'r.2026-10-05.2026-10-11', 'r.2026-10-12.2026-10-18']);
});

test('blocks: features and outcome from rides + weekly bests', () => {
  const blocks = buildBlocks(dailySeries(acts), weeklyBests(curves));
  // First ride is a Tuesday → first full 6-week pre-window ends before week 7's Monday.
  expect(blocks.length).toBe(40 - 7 - 4 - 3 + 1);
  const b = blocks[0];
  expect(b.start).toBe(day(START, 49));
  expect(b.hours_wk).toBeCloseTo(6);
  expect(b.tss_wk).toBeCloseTo(300);
  expect(b.z5_h_wk).toBeCloseTo(1);
  expect(b.rest_days).toBe(4);
  // best 20 min: weeks 11-13 after the block (→ 283 W) vs weeks 1-6 before it (→ 276 W)
  expect(b.y_20m).toBeCloseTo(Math.log(283 / 276));
});

test('profile needs the minimum number of blocks', () => {
  const blocks = buildBlocks(dailySeries(acts), weeklyBests(curves));
  expect(computeProfile(blocks.slice(0, 5)).ready).toBe(false);
  const p = computeProfile(blocks);
  expect(p.ready).toBe(true);
  expect(Object.keys(p.traits)).toEqual(['volume', 'intensity', 'rest']);
});

describe('plan follows responder traits', () => {
  const state = getSeasonState({ mode: 'manual', phase: 'build', phaseStart: '2026-09-07' }, new Date('2026-09-14T12:00:00'));
  const mon = new Date('2026-09-14T12:00:00');
  const fri = new Date('2026-09-18T12:00:00');
  const sat = new Date('2026-09-19T12:00:00');

  test('volume scales endurance time', () => {
    const base = templateForDay(state, sat).minutes;
    expect(templateForDay(state, sat, { responder: { volume: 1 } }).minutes).toBe(Math.round(base * 1.15 / 5) * 5);
    expect(templateForDay(state, sat, { responder: { volume: -1 } }).minutes).toBe(Math.round(base * 0.85 / 5) * 5);
  });

  test('rest trait moves the easy days', () => {
    expect(templateForDay(state, fri).type).toBe('recovery');
    expect(templateForDay(state, fri, { responder: { rest: 1 } }).type).toBe('rest');
    expect(templateForDay(state, mon, { responder: { rest: -1 } })).toEqual({ type: 'recovery', minutes: 45 });
  });

  test('intensity shifts the workout level', () => {
    const lvl = progressionFor(state).level;
    expect(progressionFor(state, { intensity: 1 }).level).toBe(lvl + 1);
    expect(progressionFor(state, { intensity: -1 }).level).toBe(Math.max(1, lvl - 1));
  });
});
