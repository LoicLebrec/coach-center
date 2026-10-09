import { normalizeStreams, decoupling, wPrimeBalance, energy, aboveFtp, hrZones, bestPower, detectClimbs, rideMetrics } from './rideMetrics';

const fill = (n, v) => Array.from({ length: n }, (_, i) => (typeof v === 'function' ? v(i) : v));

test('normalizes both API shapes and resamples sparse Strava points to 1 Hz', () => {
  expect(normalizeStreams([{ type: 'watts', data: [1, 2] }]).watts).toEqual([1, 2]);
  const s = normalizeStreams({ watts: { data: [100, 200] }, time: { data: [0, 3] } });
  expect(s.watts).toEqual([100, 100, 100, 200]);
});

test('steady ride has no decoupling; rising HR at same power does', () => {
  const p = fill(3000, 200);
  expect(decoupling(p, fill(3000, 140)).pct).toBeCloseTo(0, 5);
  const drift = decoupling(p, fill(3000, i => (i < 1500 ? 140 : 154)));
  expect(drift.pct).toBeGreaterThan(8);
  expect(decoupling(fill(600, 200), fill(600, 140))).toBeNull();
});

test('W′bal drains above CP and recovers below', () => {
  const p = [...fill(60, 400), ...fill(600, 100)];
  const w = wPrimeBalance(p, 250, 20000);
  expect(w.min).toBe(20000 - 60 * 150);
  expect(w.minAt).toBe(59);
  expect(w.series[w.series.length - 1]).toBeGreaterThan(w.min);
});

test('energy, time above FTP, best power', () => {
  const p = fill(3600, 200);
  expect(energy(p, 250).kj).toBe(720);
  expect(energy(p, 250).carbs).toBeGreaterThan(100);
  const a = aboveFtp([...fill(100, 300), ...fill(100, 100)], 250);
  expect(a.total).toBe(a.longest);
  expect(Math.abs(a.total - 100)).toBeLessThanOrEqual(2);
  expect(Math.round(bestPower([...fill(10, 100), ...fill(5, 500)], 5))).toBe(500);
});

test('HR zones from LTHR, or from the activity zone times', () => {
  const z = hrZones(fill(100, 170), { lthr: 170 });
  expect(z.find(x => x.key === 'Z5').pct).toBe(100);
  const icu = hrZones(null, { icuZoneTimes: [60, 60, 0, 0, 30, 30, 0] });
  expect(icu.map(x => x.secs)).toEqual([60, 60, 0, 0, 60]);
});

test('detects one climb with VAM', () => {
  // 1 km flat, 3 km at 6 % (180 m) in 15 min, 2 km descent.
  const alt = []; const dist = [];
  let d = 0; let a = 100;
  for (let t = 0; t < 120; t++) { d += 8.3; alt.push(a); dist.push(d); }
  for (let t = 0; t < 900; t++) { d += 3.33; a += 0.2; alt.push(a); dist.push(d); }
  for (let t = 0; t < 180; t++) { d += 11; a -= 0.9; alt.push(a); dist.push(d); }
  const c = detectClimbs(alt, dist, fill(alt.length, 280));
  expect(c).toHaveLength(1);
  expect(c[0].gain).toBeGreaterThan(160);
  expect(c[0].grade).toBeGreaterThan(5);
  expect(c[0].vam).toBeGreaterThan(600);
});

test('rideMetrics puts it together', () => {
  const m = rideMetrics([{ type: 'watts', data: fill(1800, 250) }, { type: 'heartrate', data: fill(1800, 150) }], { ftp: 250 });
  expect(Math.round(m.np)).toBe(250);
  expect(m.vi).toBeCloseTo(1, 5);
  expect(m.peaks.map(p => p.secs)).toEqual([5, 60, 300, 1200]);
});
