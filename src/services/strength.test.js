import { getSeasonState, weekPlan, strengthLevel } from './periodization';
import { strengthSession } from '../data/strengthLibrary';
import { adaptStrength } from './dailyPlan';

const monday = new Date('2026-12-07T12:00:00'); // base phase

test('base week: strength on the lowest-volume days, core before the long ride', () => {
  const state = { ...getSeasonState({ mode: 'manual', phase: 'base', phaseStart: '2026-12-07' }, monday) };
  const days = weekPlan(state, monday);
  // Fri = 45 min recovery, Tue = 75 min; Monday is the only day off and stays off.
  // Sat is the long ride, so Fri gets core and the legs go on Tuesday.
  expect(days.map(d => d.strength)).toEqual([null, 'legs', null, null, 'core', null, null]);
});

test('transition: short rides first, never two days in a row', () => {
  const state = { phase: 'transition', isRecoveryWeek: false, weekInCycle: 1, cycleLen: 4, weekInPhase: 1 };
  const picks = weekPlan(state, monday).map((d, i) => (d.strength ? i : null)).filter(i => i != null);
  expect(picks).toHaveLength(2);
  expect(Math.abs(picks[0] - picks[1])).toBeGreaterThan(1);
});

test('recovery week keeps one core session; race tomorrow removes it', () => {
  const state = { phase: 'build', isRecoveryWeek: true, weekInCycle: 4, cycleLen: 4, weekInPhase: 4 };
  expect(weekPlan(state, monday).map(d => d.strength).filter(Boolean)).toEqual(['core']);
  const load = { ...state, isRecoveryWeek: false, weekInCycle: 1, weekInPhase: 1 };
  const sat = new Set(['2026-12-12']);
  const days = weekPlan({ ...load, phase: 'competition' }, monday, { raceDays: sat });
  expect(days[4].strength).toBeNull(); // day before the race
  expect(days[5].strength).toBeNull();
});

test('override: add, remove, choose kind — ride untouched', () => {
  const state = { phase: 'base', isRecoveryWeek: false, weekInCycle: 1, cycleLen: 4, weekInPhase: 1 };
  const days = weekPlan(state, monday, { overrides: { '2026-12-07': { strength: false }, '2026-12-09': { strength: 'plyo' } } });
  expect(days[0].strength).toBeNull();
  expect(days[0].overridden).toBeUndefined();
  expect(days[2].strength).toBe('plyo');
});

test('levels and readiness', () => {
  expect(strengthLevel({ isRecoveryWeek: false, weekInPhase: 5, cycleLen: 4 })).toBe(2);
  expect(strengthSession('legs', 9).level).toBe(3);
  expect(strengthSession('legs', 1).minutes).toBeGreaterThan(15);
  expect(adaptStrength('legs', 2, 'rest')).toBeNull();
  expect(adaptStrength('plyo', 2, 'downgrade').kind).toBe('core');
  expect(adaptStrength('legs', 2, 'adjust').level).toBe(1);
});

test('every library exercise has a figure', () => {
  // eslint-disable-next-line global-require
  const { figureFor } = require('../data/exerciseFigures');
  const { STRENGTH_KINDS } = require('../data/strengthLibrary');
  const names = STRENGTH_KINDS.flatMap(k => [1, 2, 3].flatMap(l => strengthSession(k, l).exercises.map(e => e.name)));
  expect(names.filter(n => !figureFor(n))).toEqual([]);
});

test('every session fits the time it is given', () => {
  // eslint-disable-next-line global-require
  const { pickWorkout, blocksMinutes } = require('./periodization');
  const off = [];
  for (const phase of ['base', 'build', 'competition', 'peak']) {
    for (const type of ['threshold', 'vo2', 'sweetspot', 'force', 'tempo', 'race_sim', 'sprint', 'durability', 'endurance', 'recovery', 'anaerobic']) {
      for (const min of [45, 60, 75, 90, 120]) {
        for (const level of [1, 3, 6]) {
          const got = blocksMinutes(pickWorkout(type, min, phase, { level }).blocks);
          if (Math.abs(got - min) > 5) off.push(`${phase} ${type} ${min}′ L${level} → ${Math.round(got)}′`);
        }
      }
    }
  }
  expect(off).toEqual([]);
});

test('availability: day off moves the quality session, time cap shortens', () => {
  // eslint-disable-next-line global-require
  const { weekPlan: wp } = require('./periodization');
  const state = { phase: 'build', isRecoveryWeek: false, weekInCycle: 1, cycleLen: 4, weekInPhase: 1 };
  // build week: Mon rest, Tue threshold, Wed endurance, Thu vo2, Fri recovery, Sat durability, Sun sweetspot
  const days = wp(state, monday, { availability: { '2026-12-08': { off: true }, '2026-12-12': { minutes: 90 } } });
  expect(days[1]).toMatchObject({ type: 'rest', unavailable: true });
  const moved = days.find(d => d.movedFrom === '2026-12-08');
  expect(moved.type).toBe('threshold');
  expect(['rest', 'recovery', 'endurance']).not.toContain(moved.type);
  const i = days.indexOf(moved);
  expect(['threshold', 'vo2', 'race'].includes(days[i - 1]?.type) || ['threshold', 'vo2'].includes(days[i + 1]?.type)).toBe(false);
  expect(days[5]).toMatchObject({ minutes: 90, capped: 90 });
  // More time than planned stretches the day; a recovery ride is never stretched.
  const longer = wp(state, monday, { availability: { '2026-12-09': { minutes: 180 }, '2026-12-11': { minutes: 180 } } });
  expect(longer[2]).toMatchObject({ type: 'endurance', minutes: 180 });
  expect(longer[4].minutes).toBe(45);
  expect(days[1].strength).toBeNull();
});

test('real season and manual phases that expire', () => {
  // eslint-disable-next-line global-require
  const { seasonOf, getSeasonState: gs } = require('./periodization');
  expect(seasonOf(new Date('2026-10-09T12:00:00')).label).toBe('Automne');
  expect(seasonOf(new Date('2026-12-25T12:00:00')).label).toBe('Hiver');
  expect(seasonOf(new Date('2026-04-02T12:00:00')).label).toBe('Printemps');
  const oct9 = new Date('2026-10-09T12:00:00');
  // Build picked by hand in March: over once the calendar moved on.
  expect(gs({ mode: 'manual', phase: 'build', phaseStart: '2026-03-02' }, oct9).phase).toBe('transition');
  // Picked two weeks ago, inside the current calendar phase: kept.
  expect(gs({ mode: 'manual', phase: 'base', phaseStart: '2026-10-01' }, oct9).phase).toBe('base');
  // Build for a December A-race: kept while the race is ahead.
  expect(gs({ mode: 'manual', phase: 'build', phaseStart: '2026-09-21', targetDate: '2026-12-20' }, oct9).phase).toBe('build');
});

test('lost endurance volume is carried to the remaining endurance days', () => {
  // eslint-disable-next-line global-require
  const { weekPlan: wp } = require('./periodization');
  const base = { phase: 'base', isRecoveryWeek: false, weekInCycle: 1, cycleLen: 4, weekInPhase: 1 };
  // base week: Mon rest, Tue force 75, Wed endurance 90, Thu tempo 90, Fri recovery 45, Sat endurance 180, Sun endurance 120
  const plain = wp(base, monday);
  const days = wp(base, monday, { availability: { '2026-12-09': { off: true } } });
  expect(days[2]).toMatchObject({ type: 'rest', unavailable: true });
  const extra = days.reduce((s, d) => s + (d.carried?.minutes || 0), 0);
  expect(extra).toBeGreaterThan(60);
  expect(days[5].minutes).toBeLessThanOrEqual(Math.round(plain[5].minutes * 1.3));
  expect(days[5].carried.from).toEqual(['2026-12-09']);
  expect(days[4].carried).toBeUndefined(); // recovery never stretched
  // Recovery week: no catching up.
  const rec = wp({ ...base, isRecoveryWeek: true, weekInCycle: 4 }, monday, { availability: { '2026-12-12': { off: true } } });
  expect(rec.some(d => d.carried)).toBe(false);
});
