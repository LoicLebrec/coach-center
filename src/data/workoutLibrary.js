/**
 * Built-in workout library.
 *
 * Each workout: { id, title, type, kind, trainingType, phases, objective, notes, blocks }
 * Progressive workouts also carry: family, familyLabel, level, levelCount, ref
 *   → a family is one session idea (e.g. Rønnestad 30/15) with levels 1..N,
 *     used by services/periodization.js to progress week after week in a mesocycle.
 *
 *   trainingType — recovery | endurance | durability | tempo | force | sweetspot |
 *                  threshold | vo2 | anaerobic | sprint | race_sim | openers | race
 *   phases       — season phases where the session fits
 *   blocks       — [{ label, durationMin, zone }]; efforts < 1 min use fractional minutes
 *                  (0.1 = 6 s, 0.17 = 10 s, 0.25 = 15 s, 0.5 = 30 s).
 */

const ALL = ['transition', 'base', 'build', 'peak', 'competition', 'taper'];

const wu = (min = 15) => ({ label: 'Warmup', durationMin: min, zone: 'Z2' });
const cd = (min = 10) => ({ label: 'Cooldown', durationMin: min, zone: 'Z1' });
const z2 = (min, label = 'Endurance') => ({ label, durationMin: min, zone: 'Z2' });
const easy = (min, label = 'Recover') => ({ label, durationMin: min, zone: 'Z1' });

// n × (work @ zone / rest @ restZone), no trailing rest
function reps(n, workMin, zone, restMin, label, restZone = 'Z1') {
    const out = [];
    for (let i = 1; i <= n; i++) {
        out.push({ label: `${label} #${i}`, durationMin: workMin, zone });
        if (i < n) out.push({ label: 'Recover', durationMin: restMin, zone: restZone });
    }
    return out;
}

// sets × reps, with a longer rest between sets
function sets(nSets, nReps, workMin, zone, restMin, setRestMin, label, restZone = 'Z1') {
    const out = [];
    for (let s = 1; s <= nSets; s++) {
        out.push(...reps(nReps, workMin, zone, restMin, `${label} S${s}`, restZone));
        if (s < nSets) out.push({ label: 'Set recovery', durationMin: setRestMin, zone: 'Z1' });
    }
    return out;
}

// n × [a block then b block] with rest between the pairs (fast-start VO2, attack + break)
function combo(n, a, b, restMin, label) {
    const out = [];
    for (let i = 1; i <= n; i++) {
        out.push({ label: `${label} #${i} ${a.label}`, durationMin: a.min, zone: a.zone });
        out.push({ label: `${label} #${i} ${b.label}`, durationMin: b.min, zone: b.zone });
        if (i < n) out.push(easy(restMin));
    }
    return out;
}

// over-under: n blocks of `cycles` × (under Z4 / over Z5)
function overUnder(nBlocks, cycles, underMin, overMin, blockRest) {
    const out = [];
    for (let b = 1; b <= nBlocks; b++) {
        for (let c = 0; c < cycles; c++) {
            out.push({ label: `O/U ${b} under`, durationMin: underMin, zone: 'Z4' });
            out.push({ label: `O/U ${b} over`, durationMin: overMin, zone: 'Z5' });
        }
        if (b < nBlocks) out.push(easy(blockRest));
    }
    return out;
}

const ride = (w) => ({ type: 'Ride', kind: 'training', ...w });

/** Expand a family definition into one workout per level. */
function family(meta, levels) {
    return levels.map((lvl, i) => ride({
        ...meta,
        id: `${meta.family}-L${i + 1}`,
        level: i + 1,
        levelCount: levels.length,
        title: lvl.title,
        blocks: lvl.blocks,
        notes: lvl.notes || meta.notes,
    }));
}

/* ═══════════════════════ Single sessions ═══════════════════════ */

const SINGLES = [
    ride({
        id: 'rec-45', title: 'Recovery Spin 45′', trainingType: 'recovery', phases: ALL,
        objective: 'Absorb load, flush fatigue', notes: 'Very easy, high cadence, no efforts.',
        blocks: [easy(40, 'Easy Spin'), cd(5)],
    }),
    ride({
        id: 'rec-mobility', title: 'Recovery Spin + Mobility', trainingType: 'recovery', phases: ALL,
        objective: 'Absorb load and improve freshness', notes: 'Low-intensity neural reset and mobility block.',
        blocks: [easy(35, 'Easy Spin'), easy(20, 'Mobility')],
    }),
    ride({
        id: 'end-60', title: 'Endurance 1h', trainingType: 'endurance', phases: ALL,
        objective: 'Aerobic maintenance', notes: 'Steady Z2, conversational.',
        blocks: [wu(10), z2(42), cd(8)],
    }),
    ride({
        id: 'end-90', title: 'Z2 Endurance Ride', trainingType: 'endurance', phases: ALL,
        objective: 'Aerobic base and fat oxidation', notes: 'Long steady aerobic work with minimal drift.',
        blocks: [wu(12), z2(70), { label: 'Cadence Skills', durationMin: 8, zone: 'Z3' }, cd(10)],
    }),
    ride({
        id: 'end-cadence', title: 'Endurance + Cadence Drills', trainingType: 'endurance', phases: ['transition', 'base'],
        objective: 'Pedaling efficiency at high rpm', notes: 'Spin-ups to 110–120 rpm, stay smooth.',
        blocks: [wu(15), z2(20), ...reps(6, 1, 'Z3', 2, 'High cadence', 'Z2'), z2(20), cd(10)],
    }),
    ride({
        id: 'end-sprints', title: 'Endurance + Sprint Touches', trainingType: 'endurance', phases: ['base', 'build', 'peak', 'competition'],
        objective: 'Aerobic base while keeping neuromuscular sharpness', notes: '6 × 8 s sprints spread through a Z2 ride.',
        blocks: [wu(15), z2(15), ...reps(6, 0.13, 'Z7', 6, 'Sprint', 'Z2'), z2(15), cd(10)],
    }),
    ride({
        id: 'end-tempo-finish', title: 'Endurance + Tempo Finish', trainingType: 'endurance', phases: ['base', 'build'],
        objective: 'Aerobic volume with a controlled finish', notes: 'Last 20′ in tempo, like riding home at the front of the group.',
        blocks: [wu(15), z2(80), { label: 'Tempo finish', durationMin: 20, zone: 'Z3' }, cd(10)],
    }),
    ride({
        id: 'openers-45', title: 'Race Openers', trainingType: 'openers', phases: ['peak', 'competition', 'taper'],
        objective: 'Pre-race activation', notes: 'Day before a race. Open the engine, don’t dig a hole.',
        blocks: [wu(15), { label: 'Build', durationMin: 5, zone: 'Z3' }, ...reps(3, 1, 'Z5', 3, 'Opener'), ...reps(3, 0.17, 'Z7', 2, 'Sprint', 'Z2'), cd(8)],
    }),
    ride({
        id: 'openers-short', title: 'Short Openers 40′', trainingType: 'openers', phases: ['peak', 'competition', 'taper'],
        objective: 'Pre-race activation, minimal cost', notes: '3 × 30 s at race pace, 2 standing sprints.',
        blocks: [wu(15), ...reps(3, 0.5, 'Z6', 3, 'Opener'), easy(3), ...reps(2, 0.13, 'Z7', 3, 'Sprint', 'Z2'), cd(8)],
    }),
    {
        id: 'race-a', title: 'A-Race Objective', type: 'Race', kind: 'race', trainingType: 'race', phases: ['competition', 'peak'],
        objective: 'Season peak race', notes: 'Primary event objective. Protect taper and freshness.',
        blocks: [
            { label: 'Pre-race Prep', durationMin: 20, zone: 'Z2' },
            { label: 'Openers', durationMin: 10, zone: 'Z4' },
            { label: 'Race', durationMin: 90, zone: 'Z4' },
        ],
    },
    {
        id: 'run-long', title: 'Long Run Aerobic', type: 'Run', kind: 'training', trainingType: 'endurance', phases: ['transition', 'base'],
        objective: 'Running aerobic durability', notes: 'Steady easy pace with cadence consistency.',
        blocks: [
            { label: 'Warmup Jog', durationMin: 10, zone: 'Z1' },
            { label: 'Aerobic Run', durationMin: 70, zone: 'Z2' },
            { label: 'Strides', durationMin: 6, zone: 'Z5' },
            { label: 'Easy Jog', durationMin: 8, zone: 'Z1' },
        ],
    },
];

/* ═══════════════════════ Progressive families ═══════════════════════ */

const FAMILIES = [
    // ── Long endurance: volume progression ──
    ...family({
        family: 'long-z2', familyLabel: 'Sortie longue Z2', trainingType: 'endurance', phases: ['base', 'build', 'competition'],
        objective: 'Mitochondrial density, fat oxidation, durability',
        notes: 'Fuel 60–90 g carbs/h — also trains the gut for racing.',
    }, [
        { title: 'Long Z2 2h', blocks: [wu(15), z2(95), cd(10)] },
        { title: 'Long Z2 2h30', blocks: [wu(15), z2(125), cd(10)] },
        { title: 'Long Z2 3h', blocks: [wu(15), z2(155), cd(10)] },
        { title: 'Long Z2 3h30', blocks: [wu(15), z2(185), cd(10)] },
        { title: 'Long Z2 4h', blocks: [wu(15), z2(215), cd(10)] },
    ]),

    // ── Durability: quality AFTER long Z2 (Maunder et al. 2021) ──
    ...family({
        family: 'durability', familyLabel: 'Durabilité (efforts en fatigue)', trainingType: 'durability', phases: ['build', 'peak', 'competition'],
        objective: 'Hold power late in a race, when others fade',
        notes: 'Intervals come after long Z2 on purpose: races are decided when you are already tired. Fuel well from the start.',
        ref: 'Maunder et al., Sports Med 2021 — “durability”',
    }, [
        { title: 'Durability 2h: 90′ Z2 + 3×8′ SS', blocks: [wu(15), z2(75), ...reps(3, 8, 'Z3', 4, 'Late SS'), cd(10)] },
        { title: 'Durability 2h30: 2h Z2 + 3×10′ threshold', blocks: [wu(15), z2(95), ...reps(3, 10, 'Z4', 5, 'Late threshold'), cd(10)] },
        { title: 'Durability 3h: 2h15 Z2 + 5×4′ VO2', blocks: [wu(15), z2(120), ...reps(5, 4, 'Z5', 4, 'Late VO2'), cd(10)] },
        { title: 'Durability 3h30: 2h30 Z2 + 2×15′ thr + sprints', blocks: [wu(15), z2(135), ...reps(2, 15, 'Z4', 5, 'Late threshold'), easy(5), ...reps(4, 0.17, 'Z7', 3, 'Final sprint', 'Z2'), cd(10)] },
    ]),

    // ── Force: low cadence (winter) ──
    ...family({
        family: 'force', familyLabel: 'Force basse cadence', trainingType: 'force', phases: ['base'],
        objective: 'Muscular strength on the bike',
        notes: '50–60 rpm, seated, upper body quiet. Evidence is mixed vs gym work — stop if knees complain.',
    }, [
        { title: 'Force 4×5′ @55rpm', blocks: [wu(15), ...reps(4, 5, 'Z3', 4, 'Force 55rpm', 'Z2'), z2(15), cd(8)] },
        { title: 'Force 5×6′ @55rpm', blocks: [wu(15), ...reps(5, 6, 'Z3', 4, 'Force 55rpm', 'Z2'), z2(10), cd(8)] },
        { title: 'Force 4×8′ @55rpm', blocks: [wu(15), ...reps(4, 8, 'Z3', 4, 'Force 55rpm', 'Z2'), z2(10), cd(8)] },
        { title: 'Force 5×8′ @55rpm', blocks: [wu(15), ...reps(5, 8, 'Z3', 4, 'Force 55rpm', 'Z2'), cd(10)] },
        { title: 'Force 4×10′ @55rpm', blocks: [wu(15), ...reps(4, 10, 'Z3', 5, 'Force 55rpm', 'Z2'), cd(10)] },
    ]),

    // ── Tempo ──
    ...family({
        family: 'tempo', familyLabel: 'Tempo', trainingType: 'tempo', phases: ['base', 'build'],
        objective: 'Muscular endurance, lactate clearance', notes: '80–88% FTP, steady, nose breathing possible at the start.',
    }, [
        { title: 'Tempo 3×10′', blocks: [wu(15), ...reps(3, 10, 'Z3', 5, 'Tempo', 'Z2'), cd(10)] },
        { title: 'Tempo 3×15′', blocks: [wu(15), ...reps(3, 15, 'Z3', 5, 'Tempo', 'Z2'), cd(10)] },
        { title: 'Tempo 2×25′', blocks: [wu(15), ...reps(2, 25, 'Z3', 8, 'Tempo', 'Z2'), cd(10)] },
        { title: 'Tempo 2×30′', blocks: [wu(15), ...reps(2, 30, 'Z3', 10, 'Tempo', 'Z2'), cd(10)] },
        { title: 'Tempo 1×60′', blocks: [wu(15), { label: 'Tempo', durationMin: 60, zone: 'Z3' }, cd(10)] },
    ]),

    // ── Tempo with bursts (winter race-specificity) ──
    ...family({
        family: 'tempo-bursts', familyLabel: 'Tempo + relances', trainingType: 'tempo', phases: ['base', 'build'],
        objective: 'Keep punch alive during base', notes: 'Tempo with a 10 s seated burst every 3′. Back to tempo immediately after.',
    }, [
        { title: 'Tempo Bursts 2×12′', blocks: [wu(15), ...sets(2, 4, 2.83, 'Z3', 0.17, 6, 'Tempo', 'Z7'), cd(10)] },
        { title: 'Tempo Bursts 2×18′', blocks: [wu(15), ...sets(2, 6, 2.83, 'Z3', 0.17, 6, 'Tempo', 'Z7'), cd(10)] },
        { title: 'Tempo Bursts 3×15′', blocks: [wu(15), ...sets(3, 5, 2.83, 'Z3', 0.17, 5, 'Tempo', 'Z7'), cd(10)] },
    ]),

    // ── Sweet spot ──
    ...family({
        family: 'sweetspot', familyLabel: 'Sweet spot', trainingType: 'sweetspot', phases: ['base', 'build'],
        objective: 'High aerobic load with manageable cost', notes: '88–93% FTP.',
    }, [
        { title: 'Sweet Spot 3×10', blocks: [wu(15), ...reps(3, 10, 'Z3', 5, 'SS'), cd(10)] },
        { title: 'Sweet Spot 3×12', blocks: [wu(12), ...reps(3, 12, 'Z3', 5, 'SS'), cd(8)] },
        { title: 'Sweet Spot 2×20', blocks: [wu(15), ...reps(2, 20, 'Z3', 8, 'SS'), cd(10)] },
        { title: 'Sweet Spot 3×15', blocks: [wu(15), ...reps(3, 15, 'Z3', 6, 'SS'), cd(10)] },
        { title: 'Sweet Spot 3×20', blocks: [wu(15), ...reps(3, 20, 'Z3', 6, 'SS'), cd(10)] },
        { title: 'Sweet Spot 2×30', blocks: [wu(15), ...reps(2, 30, 'Z3', 8, 'SS'), cd(10)] },
    ]),

    // ── Classic threshold ──
    ...family({
        family: 'threshold', familyLabel: 'Seuil classique', trainingType: 'threshold', phases: ['build', 'peak'],
        objective: 'Raise FTP and time-to-exhaustion at FTP', notes: '95–100% FTP, even pacing.',
    }, [
        { title: 'Threshold 4×8', blocks: [wu(15), ...reps(4, 8, 'Z4', 4, 'Threshold'), cd(10)] },
        { title: 'Threshold 3×12', blocks: [wu(15), ...reps(3, 12, 'Z4', 5, 'Threshold'), cd(10)] },
        { title: 'Threshold 2×20', blocks: [wu(15), ...reps(2, 20, 'Z4', 10, 'Threshold'), cd(10)] },
        { title: 'Threshold 3×15', blocks: [wu(15), ...reps(3, 15, 'Z4', 6, 'Threshold'), cd(10)] },
        { title: 'Threshold 2×25', blocks: [wu(15), ...reps(2, 25, 'Z4', 8, 'Threshold'), cd(10)] },
        { title: 'Threshold 3×20', blocks: [wu(15), ...reps(3, 20, 'Z4', 8, 'Threshold'), cd(10)] },
    ]),

    // ── Norwegian-style controlled threshold ──
    ...family({
        family: 'norwegian', familyLabel: 'Seuil “norvégien” contrôlé', trainingType: 'threshold', phases: ['base', 'build', 'competition'],
        objective: 'Lots of time just under threshold at low cost',
        notes: '90–95% FTP only — never over. Short 1–2′ rests. Should feel “controlled hard”. If you have a lactate meter: ~2–3.5 mmol.',
        ref: 'Méthode norvégienne (Bakken / Ingebrigtsen) — pratique d’entraîneurs, adaptée au vélo',
    }, [
        { title: 'Norwegian 5×6′ / 1′', blocks: [wu(20), ...reps(5, 6, 'Z4', 1, 'Sub-threshold'), cd(10)] },
        { title: 'Norwegian 5×8′ / 1′', blocks: [wu(20), ...reps(5, 8, 'Z4', 1, 'Sub-threshold'), cd(10)] },
        { title: 'Norwegian 4×10′ / 2′', blocks: [wu(20), ...reps(4, 10, 'Z4', 2, 'Sub-threshold'), cd(10)] },
        { title: 'Norwegian 5×10′ / 2′', blocks: [wu(20), ...reps(5, 10, 'Z4', 2, 'Sub-threshold'), cd(10)] },
    ]),

    // ── Over-unders ──
    ...family({
        family: 'over-under', familyLabel: 'Over-unders', trainingType: 'threshold', phases: ['build', 'peak', 'competition'],
        objective: 'Clear lactate while still riding hard — like surges in a break',
        notes: 'Under 95% FTP / over 110–115% FTP.',
    }, [
        { title: 'Over-Unders 3×6′ (2/1)', blocks: [wu(15), ...overUnder(3, 2, 2, 1, 5), cd(10)] },
        { title: 'Over-Unders 3×9′ (2/1)', blocks: [wu(15), ...overUnder(3, 3, 2, 1, 5), cd(10)] },
        { title: 'Over-Unders 3×12′ (2/1)', blocks: [wu(15), ...overUnder(3, 4, 2, 1, 6), cd(10)] },
        { title: 'Over-Unders 4×12′ (2/1)', blocks: [wu(15), ...overUnder(4, 4, 2, 1, 6), cd(10)] },
    ]),

    // ── VO2 long intervals ──
    ...family({
        family: 'vo2-long', familyLabel: 'VO2 intervalles longs', trainingType: 'vo2', phases: ['build', 'peak'],
        objective: 'Raise aerobic ceiling', notes: '106–120% FTP, equal recovery. Last rep should be as good as the first.',
    }, [
        { title: 'VO2 4×4′', blocks: [wu(15), ...reps(4, 4, 'Z5', 4, 'VO2'), cd(10)] },
        { title: 'VO2 5×4′', blocks: [wu(15), ...reps(5, 4, 'Z5', 4, 'VO2'), cd(10)] },
        { title: 'VO2 5×5′', blocks: [wu(15), ...reps(5, 5, 'Z5', 5, 'VO2'), cd(10)] },
        { title: 'VO2 6×5′', blocks: [wu(15), ...reps(6, 5, 'Z5', 4, 'VO2'), cd(10)] },
    ]),

    // ── Rønnestad 30/15 ──
    ...family({
        family: 'ronnestad', familyLabel: 'Rønnestad 30/15', trainingType: 'vo2', phases: ['build', 'peak', 'competition'],
        objective: 'Maximum time near VO2max', notes: '30 s hard (~120% FTP) / 15 s easy. Sets of ~10′, 3′ between sets.',
        ref: 'Rønnestad et al., Scand J Med Sci Sports 2015 — short vs long intervals',
    }, [
        { title: 'Rønnestad 30/15 2×10', blocks: [wu(20), ...sets(2, 10, 0.5, 'Z5', 0.25, 3, '30/15'), cd(10)] },
        { title: 'Rønnestad 30/15 3×10', blocks: [wu(20), ...sets(3, 10, 0.5, 'Z5', 0.25, 3, '30/15'), cd(10)] },
        { title: 'Rønnestad 30/15 3×13', blocks: [wu(20), ...sets(3, 13, 0.5, 'Z5', 0.25, 3, '30/15'), cd(10)] },
    ]),

    // ── 40/20 ──
    ...family({
        family: 'vo2-4020', familyLabel: 'VO2 40/20', trainingType: 'vo2', phases: ['peak', 'competition'],
        objective: 'Race-like VO2 with incomplete recovery', notes: '40 s hard / 20 s easy.',
    }, [
        { title: 'VO2 40/20 2×8', blocks: [wu(15), ...sets(2, 8, 0.67, 'Z5', 0.33, 5, '40/20'), cd(10)] },
        { title: 'VO2 40/20 3×8', blocks: [wu(15), ...sets(3, 8, 0.67, 'Z5', 0.33, 5, '40/20'), cd(10)] },
        { title: 'VO2 40/20 3×10', blocks: [wu(15), ...sets(3, 10, 0.67, 'Z5', 0.33, 5, '40/20'), cd(10)] },
    ]),

    // ── Fast-start VO2 (varied intensity inside the rep) ──
    ...family({
        family: 'vo2-faststart', familyLabel: 'VO2 départ rapide', trainingType: 'vo2', phases: ['build', 'peak', 'competition'],
        objective: 'Reach VO2 faster in each rep → more time near max',
        notes: 'Start each rep hard (~130% FTP) then settle at 105–110%. Feels like closing a gap then holding the wheel.',
        ref: 'Bossi et al., IJSPP 2020 — power variation within work intervals',
    }, [
        { title: 'Fast-Start VO2 4×4′', blocks: [wu(15), ...combo(4, { label: 'fast start', min: 1, zone: 'Z6' }, { label: 'hold', min: 3, zone: 'Z5' }, 4, 'VO2'), cd(10)] },
        { title: 'Fast-Start VO2 5×4′', blocks: [wu(15), ...combo(5, { label: 'fast start', min: 1, zone: 'Z6' }, { label: 'hold', min: 3, zone: 'Z5' }, 4, 'VO2'), cd(10)] },
        { title: 'Fast-Start VO2 5×5′', blocks: [wu(15), ...combo(5, { label: 'fast start', min: 1, zone: 'Z6' }, { label: 'hold', min: 4, zone: 'Z5' }, 5, 'VO2'), cd(10)] },
    ]),

    // ── Anaerobic capacity ──
    ...family({
        family: 'anaerobic', familyLabel: 'Capacité anaérobie', trainingType: 'anaerobic', phases: ['peak', 'competition'],
        objective: 'Glycolytic power and buffering for 30 s–2′ efforts', notes: '130–150% FTP, long easy recoveries.',
    }, [
        { title: 'Anaerobic 6×45s', blocks: [wu(20), ...reps(6, 0.75, 'Z6', 4, 'Anaerobic'), cd(10)] },
        { title: 'Anaerobic 6×1′', blocks: [wu(20), ...reps(6, 1, 'Z6', 4, 'Anaerobic'), cd(10)] },
        { title: 'Anaerobic 8×1′', blocks: [wu(20), ...reps(8, 1, 'Z6', 4, 'Anaerobic'), cd(10)] },
        { title: 'Anaerobic 5×1′30', blocks: [wu(20), ...reps(5, 1.5, 'Z6', 5, 'Anaerobic'), cd(10)] },
    ]),

    // ── Microbursts 15/15 ──
    ...family({
        family: 'microbursts', familyLabel: 'Microbursts 15/15', trainingType: 'anaerobic', phases: ['build', 'peak', 'competition'],
        objective: 'Repeated short surges — crits and small-group racing', notes: '15 s ~150% FTP / 15 s ~50%. Seated, high cadence.',
    }, [
        { title: 'Microbursts 2×8′', blocks: [wu(15), ...sets(2, 16, 0.25, 'Z6', 0.25, 5, '15/15'), cd(10)] },
        { title: 'Microbursts 3×8′', blocks: [wu(15), ...sets(3, 16, 0.25, 'Z6', 0.25, 5, '15/15'), cd(10)] },
        { title: 'Microbursts 3×10′', blocks: [wu(15), ...sets(3, 20, 0.25, 'Z6', 0.25, 5, '15/15'), cd(10)] },
    ]),

    // ── Sprint Pmax ──
    ...family({
        family: 'sprint-pmax', familyLabel: 'Sprint Pmax', trainingType: 'sprint', phases: ['base', 'build', 'peak', 'competition'],
        objective: 'Peak power, PCr system', notes: 'Max from rolling start, 100–120 rpm. Full recovery — quality over fatigue.',
        ref: 'Haugen et al., SJMSS 2019 — sprint development',
    }, [
        { title: 'Sprint Pmax 6×8s', blocks: [wu(20), ...reps(6, 0.13, 'Z7', 4, 'Sprint', 'Z2'), z2(10), cd(10)] },
        { title: 'Sprint Pmax 8×8s', blocks: [wu(20), ...reps(8, 0.13, 'Z7', 4, 'Sprint', 'Z2'), cd(10)] },
        { title: 'Sprint Pmax 10×10s', blocks: [wu(20), ...reps(10, 0.17, 'Z7', 4, 'Sprint', 'Z2'), cd(10)] },
        { title: 'Sprint Pmax 12×10s', blocks: [wu(20), ...reps(12, 0.17, 'Z7', 4, 'Sprint', 'Z2'), cd(10)] },
    ]),

    // ── Standing starts (torque) ──
    ...family({
        family: 'standing-starts', familyLabel: 'Départs arrêtés (couple)', trainingType: 'sprint', phases: ['base', 'build'],
        objective: 'Force production at low speed — relaunches out of corners',
        notes: 'From ~15 km/h in a big gear (53×15), 10–12 s all-out standing. Full recovery.',
    }, [
        { title: 'Standing Starts 6×10s', blocks: [wu(20), ...reps(6, 0.17, 'Z7', 4, 'Standing start', 'Z2'), z2(10), cd(10)] },
        { title: 'Standing Starts 8×12s', blocks: [wu(20), ...reps(8, 0.2, 'Z7', 4, 'Standing start', 'Z2'), cd(10)] },
        { title: 'Standing Starts 10×12s', blocks: [wu(20), ...reps(10, 0.2, 'Z7', 4, 'Standing start', 'Z2'), cd(10)] },
    ]),

    // ── Repeated sprint ability ──
    ...family({
        family: 'rsa', familyLabel: 'Sprints répétés (RSA)', trainingType: 'sprint', phases: ['peak', 'competition'],
        objective: 'Sprint again and again with incomplete recovery', notes: '10 s max / 20 s easy, 3′ between sets.',
    }, [
        { title: 'RSA 2×(5×10s/20s)', blocks: [wu(20), ...sets(2, 5, 0.17, 'Z7', 0.33, 3, 'RSA'), z2(15), cd(10)] },
        { title: 'RSA 3×(5×10s/20s)', blocks: [wu(20), ...sets(3, 5, 0.17, 'Z7', 0.33, 3, 'RSA'), z2(10), cd(10)] },
        { title: 'RSA 3×(6×10s/20s)', blocks: [wu(20), ...sets(3, 6, 0.17, 'Z7', 0.33, 3, 'RSA'), z2(10), cd(10)] },
        { title: 'RSA 4×(6×10s/20s)', blocks: [wu(20), ...sets(4, 6, 0.17, 'Z7', 0.33, 3, 'RSA'), cd(10)] },
    ]),

    // ── Race simulation: surge every ~2′ ──
    ...family({
        family: 'race-sim', familyLabel: 'Simulation course (relances)', trainingType: 'race_sim', phases: ['peak', 'competition'],
        objective: 'Survive a surge every 2′, then ride threshold', notes: '15 s max / 1′45 Z2, then threshold — like a hard circuit race.',
    }, [
        { title: 'Race Sim 8×15s + 1×10′', blocks: [wu(20), ...reps(8, 0.25, 'Z7', 1.75, 'Surge', 'Z2'), easy(6), { label: 'Threshold', durationMin: 10, zone: 'Z4' }, cd(10)] },
        { title: 'Race Sim 10×15s + 2×10′', blocks: [wu(20), ...reps(10, 0.25, 'Z7', 1.75, 'Surge', 'Z2'), easy(6), ...reps(2, 10, 'Z4', 5, 'Threshold'), cd(10)] },
        { title: 'Race Sim 12×15s + 2×12′', blocks: [wu(20), ...reps(12, 0.25, 'Z7', 1.75, 'Surge', 'Z2'), easy(6), ...reps(2, 12, 'Z4', 5, 'Threshold'), cd(10)] },
    ]),

    // ── Attack + breakaway ──
    ...family({
        family: 'breakaway', familyLabel: 'Attaque + échappée', trainingType: 'race_sim', phases: ['build', 'peak', 'competition'],
        objective: 'Go clear, then hold threshold', notes: '1′ attack (~130% FTP) straight into threshold, no pause.',
    }, [
        { title: 'Breakaway 3×(1′ + 6′)', blocks: [wu(20), ...combo(3, { label: 'attack', min: 1, zone: 'Z6' }, { label: 'hold', min: 6, zone: 'Z4' }, 5, 'Break'), cd(10)] },
        { title: 'Breakaway 3×(1′ + 8′)', blocks: [wu(20), ...combo(3, { label: 'attack', min: 1, zone: 'Z6' }, { label: 'hold', min: 8, zone: 'Z4' }, 5, 'Break'), cd(10)] },
        { title: 'Breakaway 4×(1′ + 8′)', blocks: [wu(20), ...combo(4, { label: 'attack', min: 1, zone: 'Z6' }, { label: 'hold', min: 8, zone: 'Z4' }, 5, 'Break'), cd(10)] },
    ]),
];

export const LIBRARY_WORKOUTS = [...SINGLES, ...FAMILIES];

export function workoutMinutes(w) {
    return Math.round((w?.blocks || w?.workoutBlocks || []).reduce((s, b) => s + (Number(b.durationMin) || 0), 0));
}
