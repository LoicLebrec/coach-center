/**
 * Rule-based workout block builder.
 * Shared between SmartWorkoutWizard and the AI plan generator.
 *
 * Each type returns { title, objective, sport, blocks }
 * where blocks = [{ label, durationMin, zone }]
 */

export const TRAINING_TYPES = ['recovery', 'endurance', 'sweetspot', 'threshold', 'vo2', 'openers'];

export function buildRuleBasedWorkout(type, minutes, feel = 'good', ftp = null, nextRaceDays = null) {
    const isRaceWeek = nextRaceDays != null && nextRaceDays <= 7;

    if (type === 'recovery' || (feel === 'tired' && isRaceWeek)) {
        return {
            title: 'Recovery Flush',
            objective: 'Active recovery. Flush fatigue, protect form for upcoming race.',
            sport: 'Ride',
            blocks: [
                { label: 'Easy Spin', durationMin: minutes - 5, zone: 'Z1' },
                { label: 'Cool-down', durationMin: 5, zone: 'Z1' },
            ],
        };
    }

    const warmup = Math.max(10, Math.min(20, Math.round(minutes * 0.18)));
    const cooldown = Math.max(8, Math.min(15, Math.round(minutes * 0.12)));
    const main = minutes - warmup - cooldown;

    if (type === 'openers') {
        return {
            title: 'Race Openers',
            objective: 'Pre-race activation. Open the engine without digging a hole.',
            sport: 'Ride',
            blocks: [
                { label: 'Easy Warmup', durationMin: Math.max(15, warmup), zone: 'Z2' },
                { label: 'Build', durationMin: 5, zone: 'Z3' },
                { label: 'Opener #1', durationMin: 1, zone: 'Z5' },
                { label: 'Easy', durationMin: 3, zone: 'Z1' },
                { label: 'Opener #2', durationMin: 1, zone: 'Z5' },
                { label: 'Easy', durationMin: 3, zone: 'Z1' },
                { label: 'Cool-down', durationMin: Math.max(8, cooldown), zone: 'Z1' },
            ],
        };
    }

    if (type === 'endurance') {
        const skillMin = minutes >= 90 ? 8 : 0;
        return {
            title: `Z2 Endurance ${minutes}min`,
            objective: 'Aerobic base building, fat oxidation. The engine behind everything else.',
            sport: 'Ride',
            blocks: [
                { label: 'Warmup', durationMin: warmup, zone: 'Z2' },
                { label: 'Aerobic Base', durationMin: main - skillMin, zone: 'Z2' },
                ...(skillMin > 0 ? [{ label: 'Cadence Skills', durationMin: skillMin, zone: 'Z3' }] : []),
                { label: 'Cool-down', durationMin: cooldown, zone: 'Z1' },
            ],
        };
    }

    if (type === 'sweetspot') {
        const repDuration = feel === 'tired' ? 10 : 12;
        const restDuration = Math.round(repDuration * 0.38);
        const reps = Math.max(2, Math.min(4, Math.floor(main / (repDuration + restDuration))));
        return {
            title: `Sweet Spot ${reps}×${repDuration}min`,
            objective: 'High aerobic stress with manageable cost. Best training ROI.',
            sport: 'Ride',
            blocks: [
                { label: 'Warmup', durationMin: warmup, zone: 'Z2' },
                ...Array.from({ length: reps }, (_, i) => [
                    { label: `Sweet Spot #${i + 1}`, durationMin: repDuration, zone: 'Z3' },
                    ...(i < reps - 1 ? [{ label: 'Recovery', durationMin: restDuration, zone: 'Z1' }] : []),
                ]).flat(),
                { label: 'Cool-down', durationMin: cooldown, zone: 'Z1' },
            ],
        };
    }

    if (type === 'threshold') {
        const repDuration = feel === 'tired' ? 15 : 20;
        const restDuration = Math.round(repDuration * 0.3);
        const reps = Math.max(1, Math.min(3, Math.floor(main / (repDuration + restDuration))));
        const zone = feel === 'tired' ? 'Z3' : 'Z4';
        const raceMod = isRaceWeek ? ' (Race Week)' : '';
        return {
            title: `Threshold ${reps}×${repDuration}min${raceMod}`,
            objective: 'Raise FTP ceiling, build durability at threshold power.',
            sport: 'Ride',
            blocks: [
                { label: 'Warmup', durationMin: warmup, zone: 'Z2' },
                ...Array.from({ length: reps }, (_, i) => [
                    { label: `Threshold #${i + 1}`, durationMin: repDuration, zone },
                    ...(i < reps - 1 ? [{ label: 'Recovery', durationMin: restDuration, zone: 'Z1' }] : []),
                ]).flat(),
                { label: 'Cool-down', durationMin: cooldown, zone: 'Z1' },
            ],
        };
    }

    if (type === 'vo2') {
        const repDuration = feel === 'tired' ? 4 : 5;
        const restDuration = repDuration;
        const reps = Math.max(3, Math.min(6, Math.floor((main - 3) / (repDuration + restDuration))));
        const zone = feel === 'tired' ? 'Z4' : 'Z5';
        return {
            title: `VO2 Max ${reps}×${repDuration}min`,
            objective: `Raise your aerobic ceiling. ${reps} quality intervals at VO2 intensity.`,
            sport: 'Ride',
            blocks: [
                { label: 'Warmup', durationMin: warmup + 3, zone: 'Z2' },
                { label: 'Openers', durationMin: 3, zone: 'Z4' },
                ...Array.from({ length: reps }, (_, i) => [
                    { label: `VO2 Rep #${i + 1}`, durationMin: repDuration, zone },
                    ...(i < reps - 1 ? [{ label: 'Recovery', durationMin: restDuration, zone: 'Z1' }] : []),
                ]).flat(),
                { label: 'Cool-down', durationMin: cooldown, zone: 'Z1' },
            ],
        };
    }

    // Fallback: generic session
    return {
        title: 'Training Session',
        objective: 'General training session.',
        sport: 'Ride',
        blocks: [
            { label: 'Warmup', durationMin: warmup, zone: 'Z2' },
            { label: 'Main Set', durationMin: main, zone: 'Z3' },
            { label: 'Cool-down', durationMin: cooldown, zone: 'Z1' },
        ],
    };
}

/**
 * Infer training type from an AI-generated title/notes string.
 * Used as a fallback when the AI doesn't return an explicit trainingType.
 */
export function inferTrainingType(title = '', notes = '') {
    const text = `${title} ${notes}`.toLowerCase();
    if (/vo2|vo₂|v02|\bvo\b.*max|maximal aerobic/.test(text)) return 'vo2';
    if (/threshold|ftp|lactate|tempo|z4/.test(text)) return 'threshold';
    if (/sweet.?spot|sst|z3/.test(text)) return 'sweetspot';
    if (/endurance|z2|base|aerobic|long ride/.test(text)) return 'endurance';
    if (/recovery|flush|easy spin|z1|active rec/.test(text)) return 'recovery';
    if (/opener|activation|pre.?race/.test(text)) return 'openers';
    if (/rest|off day|day off/.test(text)) return 'rest';
    return 'endurance'; // safe default
}
