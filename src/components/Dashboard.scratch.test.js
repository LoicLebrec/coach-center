import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import Dashboard from './Dashboard';
import Today from './Today';

global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const wellness = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - 29 + i);
  return { id: d.toISOString().slice(0, 10), icu_ctl: 60 + i * 0.2, icu_atl: 70, hrv: 60, restingHR: 48 };
});
const activities = [{ id: 1, name: 'Ride', type: 'Ride', start_date_local: wellness[28].id + 'T08:00:00', moving_time: 3600, icu_training_load: 80, icu_best_1200_watts: 300, max_heartrate: 180 }];

for (const pc of [null, { list: [{ secs: [5, 60, 1200], watts: [900, 450, 300] }] }, [{ secs: [5], watts: [900] }], {}]) {
  test(`dashboard renders with powerCurve=${JSON.stringify(pc)}`, () => {
    const el = document.createElement('div');
    act(() => { createRoot(el).render(<Dashboard wellness={wellness} activities={activities} athlete={{ icu_ftp: 295 }} powerCurve={pc} />); });
    expect(el.textContent.length).toBeGreaterThan(50);
  });
}
test('today renders', () => {
  const el = document.createElement('div');
  act(() => { createRoot(el).render(<Today wellness={wellness} activities={activities} athlete={{ icu_ftp: 295 }} events={[]} plannedEvents={[]} />); });
  expect(el.textContent).toContain('Séance du jour');
  console.log(el.textContent.slice(0, 900));
});
