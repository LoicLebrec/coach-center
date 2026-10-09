import { getSeasonState, weekPlan, strengthLevel } from './periodization';
import { strengthSession } from '../data/strengthLibrary';
import { adaptStrength } from './dailyPlan';

const monday = new Date('2026-12-07T12:00:00'); // base phase

test('base week: legs Tuesday, core Thursday, nothing else', () => {
  const state = { ...getSeasonState({ mode: 'manual', phase: 'base', phaseStart: '2026-12-07' }, monday) };
  const days = weekPlan(state, monday);
  expect(days.map(d => d.strength)).toEqual([null, 'legs', null, 'core', null, null, null]);
});

test('recovery week keeps one core session; race tomorrow removes it', () => {
  const state = { phase: 'build', isRecoveryWeek: true, weekInCycle: 4, cycleLen: 4, weekInPhase: 4 };
  expect(weekPlan(state, monday).map(d => d.strength).filter(Boolean)).toEqual(['core']);
  const load = { ...state, isRecoveryWeek: false, weekInCycle: 1, weekInPhase: 1 };
  const wed = new Set(['2026-12-09']);
  expect(weekPlan(load, monday, { raceDays: wed })[1].strength).toBeNull();
});

test('override: add, remove, choose kind — ride untouched', () => {
  const state = { phase: 'base', isRecoveryWeek: false, weekInCycle: 1, cycleLen: 4, weekInPhase: 1 };
  const days = weekPlan(state, monday, { overrides: { '2026-12-08': { strength: false }, '2026-12-11': { strength: 'plyo' } } });
  expect(days[1].strength).toBeNull();
  expect(days[1].overridden).toBeUndefined();
  expect(days[4].strength).toBe('plyo');
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
