import { reviewSession, activitiesOn } from './sessionReview';

const vo2 = { type: 'vo2', blocks: [
  { label: 'Warmup', durationMin: 15, zone: 'Z2' },
  { label: 'VO2 #1', durationMin: 4, zone: 'Z5' }, { label: 'Recover', durationMin: 4, zone: 'Z1' },
  { label: 'VO2 #2', durationMin: 4, zone: 'Z5' }, { label: 'Recover', durationMin: 4, zone: 'Z1' },
  { label: 'VO2 #3', durationMin: 4, zone: 'Z5' }, { label: 'Recover', durationMin: 4, zone: 'Z1' },
  { label: 'VO2 #4', durationMin: 4, zone: 'Z5' },
  { label: 'Endurance', durationMin: 12, zone: 'Z2' }, { label: 'Cooldown', durationMin: 10, zone: 'Z1' },
] };
const endurance = { type: 'endurance', blocks: [{ label: 'Endurance', durationMin: 90, zone: 'Z2' }] };
const ride = (min, extra) => ({ start_date_local: '2026-10-09T08:00:00', type: 'Ride', moving_time: min * 60, ...extra });
const zones = (z2, z5) => [{ id: 'Z2', secs: z2 * 60 }, { id: 'Z5', secs: z5 * 60 }];

test('VO2 session done as planned is green', () => {
  const r = reviewSession(vo2, [ride(65, { icu_training_load: 70, icu_intensity: 82, icu_zone_times: zones(45, 15) })]);
  expect(r.tone).toBe('green');
  expect(r.title).toBe('Séance respectée');
});

test('VO2 session ridden easy is flagged', () => {
  const r = reviewSession(vo2, [ride(65, { icu_training_load: 60, icu_zone_times: zones(60, 2) })]);
  expect(r.tone).toBe('orange');
  expect(r.notes[0]).toMatch(/Intensité pas faite/);
});

test('easy day ridden hard is flagged', () => {
  const r = reviewSession(endurance, [ride(90, { icu_training_load: 110, icu_intensity: 85, icu_zone_times: zones(50, 25) })]);
  expect(r.tone).not.toBe('green');
  expect(r.notes.join(' ')).toMatch(/Trop intense/);
});

test('missed past session, nothing yet today, ride on rest day', () => {
  expect(reviewSession(vo2, [], { past: true }).verdict).toBe('missed');
  expect(reviewSession(vo2, [])).toBeNull();
  expect(reviewSession({ type: 'rest' }, [ride(60, {})]).verdict).toBe('extra');
});

test('strength activities are split from rides', () => {
  const d = activitiesOn([ride(60, {}), { start_date_local: '2026-10-09T18:00:00', type: 'WeightTraining' }], '2026-10-09');
  expect(d.rides).toHaveLength(1);
  expect(d.strength).toHaveLength(1);
});
