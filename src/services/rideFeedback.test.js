import { levelShifts, feedbackReadiness, expectedRpe } from './rideFeedback';
import { estimateFtp, ftpSuggestion, ftpTestDue } from './ftp';

test('level shifts from the last two sessions of a family', () => {
  expect(levelShifts({
    '2026-09-01': { family: 'thr-2x20', type: 'threshold', outcome: 'done', rpe: 5 },
    '2026-09-08': { family: 'thr-2x20', type: 'threshold', outcome: 'done', rpe: 6 },
    '2026-09-03': { family: 'vo2-5x4', type: 'vo2', outcome: 'failed', rpe: 10 },
    '2026-09-10': { family: 'vo2-5x4', type: 'vo2', outcome: 'partial', rpe: 9 },
    '2026-09-04': { family: 'ss', type: 'sweetspot', outcome: 'done', rpe: 6 },
  })).toEqual({ 'thr-2x20': 2, 'vo2-5x4': -2 });
});

test('readiness adjustments from yesterday', () => {
  expect(feedbackReadiness({ type: 'endurance', rpe: 7 })[0].delta).toBe(-8);
  expect(feedbackReadiness({ type: 'threshold', outcome: 'failed', legs: 'heavy' }).map(x => x.delta)).toEqual([-10, -5]);
  expect(feedbackReadiness({ type: 'threshold', outcome: 'done', rpe: 8 })).toEqual([]);
  expect(expectedRpe('vo2')).toEqual([8, 9]);
});

test('FTP estimate from recent rides only, suggestion threshold, test reminder', () => {
  const today = new Date('2026-10-09T12:00:00');
  const acts = [
    { start_date_local: '2026-09-20T08:00:00', icu_pm_ftp_watts: 310 },
    { start_date_local: '2026-05-01T08:00:00', icu_pm_ftp_watts: 340 }, // too old
  ];
  expect(estimateFtp({ activities: acts, today })).toMatchObject({ watts: 310, date: '2026-09-20' });
  expect(estimateFtp({ activities: [{ start_date_local: '2026-10-01T08:00:00', icu_best_1200_watts: 320 }], today }).watts).toBe(304);
  expect(ftpSuggestion(295, { watts: 310 })).toMatchObject({ delta: 15, pct: 5 });
  expect(ftpSuggestion(295, { watts: 300 })).toBeNull();
  expect(ftpSuggestion(295, { watts: 310 }, 310)).toBeNull();
  expect(ftpTestDue('2026-08-01', 'build', today)).toBe(true);
  expect(ftpTestDue('2026-09-20', 'build', today)).toBe(false);
  expect(ftpTestDue('2026-08-01', 'competition', today)).toBe(false);
});

test('unplanned rides are typed from their intensity', () => {
  // eslint-disable-next-line global-require
  const { typeFromRides } = require('./rideFeedback');
  expect(typeFromRides([{ icu_intensity: 88 }])).toBe('threshold');
  expect(typeFromRides([{ icu_intensity: 0.66 }])).toBe('endurance');
  expect(typeFromRides([])).toBe('endurance');
});
