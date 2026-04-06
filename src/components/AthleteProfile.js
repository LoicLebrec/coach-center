import React, { useEffect, useMemo, useState } from 'react';
import persistence from '../services/persistence';

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function asNumber(...values) {
    for (const v of values) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function getAthleteFtp(athlete) {
    return asNumber(
        athlete?.icu_ftp,
        athlete?.ftp,
        athlete?.ftp_watts,
        athlete?.critical_power,
        athlete?.zones?.ftp
    );
}

function getAthleteWeight(athlete) {
    return asNumber(athlete?.icu_weight, athlete?.weight, athlete?.athlete_weight);
}

function getWellnessRestingHr(w) {
    return asNumber(w?.restingHR, w?.resting_hr, w?.rhr, w?.hrRest);
}

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = d.getTime() - startToday.getTime();
    return Math.ceil(diff / 86400000);
}

function buildBrutalReport({ currentFtp, tsb, targetFtp, targetDate, coachStyle }) {
    const readiness = currentFtp || tsb != null
        ? clamp(Math.round(50 + (tsb || 0) * 2), 0, 100)
        : null;

    if (!targetFtp || !targetDate) {
        const line = readiness == null
            ? 'No target readiness score yet. Set a target event and FTP goal.'
            : readiness >= 75
                ? 'You are fresh enough to execute quality work. Keep consistency high.'
                : readiness >= 55
                    ? 'You are not race-ready yet. Build more quality and protect recovery.'
                    : 'You are carrying too much fatigue for peak output. Recover first.';

        return {
            readiness,
            headline: 'Baseline Readiness',
            verdict: line,
            status: readiness == null ? 'neutral' : readiness >= 70 ? 'good' : readiness >= 50 ? 'warning' : 'bad',
            delta: null,
            reqPerWeek: null,
            daysLeft: null,
        };
    }

    const daysLeft = daysUntil(targetDate);
    const delta = Number(targetFtp) - (Number(currentFtp) || 0);
    const weeksLeft = daysLeft != null ? Math.max(1, daysLeft / 7) : null;
    const reqPerWeek = weeksLeft ? delta / weeksLeft : null;

    let verdict = '';
    let status = 'neutral';

    if (daysLeft != null && daysLeft < 0) {
        verdict = 'Your target date is in the past. Update it or stop pretending this is a current goal.';
        status = 'bad';
    } else if (delta <= 0) {
        verdict = 'Target FTP is already met on paper. Now prove it in training and race execution.';
        status = 'good';
    } else if (reqPerWeek > 4) {
        verdict = `Unrealistic target. You need about ${reqPerWeek.toFixed(1)} W/week. That is fantasy-level progression.`;
        status = 'bad';
    } else if (reqPerWeek > 2.5) {
        verdict = `Very aggressive target. ${reqPerWeek.toFixed(1)} W/week required. You need perfect compliance and recovery.`;
        status = 'warning';
    } else if (reqPerWeek > 1.2) {
        verdict = `Challenging but possible. ${reqPerWeek.toFixed(1)} W/week required. Missed sessions will punish this timeline.`;
        status = 'warning';
    } else {
        verdict = `Target is realistic. ${reqPerWeek.toFixed(1)} W/week required. Consistency beats hero days.`;
        status = 'good';
    }

    if (/brutal honesty/i.test(String(coachStyle || ''))) {
        if (status === 'bad') verdict += ' Brutal truth: your plan is currently not credible.';
        if (status === 'warning') verdict += ' Brutal truth: you are one sloppy week away from missing this target.';
    }

    return {
        readiness,
        headline: 'Target Readiness',
        verdict,
        status,
        delta,
        reqPerWeek,
        daysLeft,
    };
}

export default function AthleteProfile({ wellness = [], athlete = null, events = [], activities = [], loading = false, powerCurve = null }) {
    const [profile, setProfile] = useState({
        riderName: '',
        primarySport: 'Road Cycling',
        isRacing: 'yes',
        racingWeeks: {},
        weeklyHours: '8-12 hours',
        coachStyle: 'Brutal honesty - no mercy',
        notes: '',
        targetEventName: '',
        targetDate: '',
        targetFtp: '',
        targetWeight: '',
        longTermGoalType: 'ftp',
        longTermGoalValue: '',
        longTermGoalDate: '',
    });
    const [saveMsg, setSaveMsg] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [showCatBreakdown, setShowCatBreakdown] = useState(false);

    // Add a helper message state for missing data
    const hasWellnessData = wellness && wellness.length > 0;
    const hasAthleteData = athlete && (athlete.icu_ftp || athlete.ftp || athlete.critical_power);

    useEffect(() => {
        (async () => {
            const saved = await persistence.getAthleteProfile();
            if (saved && typeof saved === 'object') {
                setProfile(prev => ({ ...prev, ...saved }));
            }
        })();
    }, []);

    useEffect(() => {
        if (!athlete && !(events?.length)) return;

        setProfile(prev => {
            const next = { ...prev };

            const athleteName = [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ').trim();
            if (!next.riderName && athleteName) next.riderName = athleteName;

            const athleteWeight = getAthleteWeight(athlete);
            if (!next.targetWeight && athleteWeight) {
                next.targetWeight = String(Math.round(Number(athleteWeight) * 10) / 10);
            }

            const athleteFtp = getAthleteFtp(athlete);
            if (!next.primarySport && athleteFtp) {
                next.primarySport = 'Road Cycling';
            }

            const upcomingEvent = (events || [])
                .filter(e => {
                    const raw = e?.start_date_local || e?.start_date || e?.date || e?.event_date;
                    if (!raw) return false;
                    const d = new Date(String(raw).slice(0, 10));
                    return !Number.isNaN(d.getTime()) && d >= new Date(new Date().toDateString());
                })
                .sort((a, b) => {
                    const da = new Date(String(a.start_date_local || a.start_date || a.date || a.event_date).slice(0, 10)).getTime();
                    const db = new Date(String(b.start_date_local || b.start_date || b.date || b.event_date).slice(0, 10)).getTime();
                    return da - db;
                })[0];

            if (upcomingEvent) {
                if (!next.targetEventName) {
                    next.targetEventName = upcomingEvent.name || upcomingEvent.title || 'Target Event';
                }
                if (!next.targetDate) {
                    const rawDate = upcomingEvent.start_date_local || upcomingEvent.start_date || upcomingEvent.date || upcomingEvent.event_date;
                    next.targetDate = String(rawDate).slice(0, 10);
                }
            }

            return next;
        });
    }, [athlete, events]);

    const critStats = useMemo(() => {
        const now = new Date();
        const fourWeeksAgo = new Date(now);
        fourWeeksAgo.setDate(now.getDate() - 28);

        const raceLike = (events || []).filter(e => {
            const txt = `${e?.name || e?.title || ''} ${e?.type || ''} ${e?.event_type || ''}`.toLowerCase();
            return /race|crit|criterium|gp|road race|event/.test(txt);
        });

        const upcomingRaces = raceLike.filter(e => {
            const raw = e?.start_date_local || e?.start_date || e?.date || e?.event_date;
            if (!raw) return false;
            const d = new Date(String(raw).slice(0, 10));
            return !Number.isNaN(d.getTime()) && d >= new Date(new Date().toDateString());
        });

        const recentRaces = raceLike.filter(e => {
            const raw = e?.start_date_local || e?.start_date || e?.date || e?.event_date;
            if (!raw) return false;
            const d = new Date(String(raw).slice(0, 10));
            return !Number.isNaN(d.getTime()) && d >= fourWeeksAgo && d <= now;
        });

        const weekendRaces = recentRaces.filter(e => {
            const raw = e?.start_date_local || e?.start_date || e?.date || e?.event_date;
            const d = new Date(String(raw).slice(0, 10));
            const day = d.getDay();
            return day === 0 || day === 6;
        });

        const raceLikeActivities = (activities || []).filter(a => {
            const txt = `${a?.name || ''} ${a?.type || ''}`.toLowerCase();
            return /race|crit|criterium|road race|event/.test(txt) || /race/i.test(String(a?.type || ''));
        });

        const recentRaceActivities = raceLikeActivities.filter(a => {
            const raw = a?.start_date_local || a?.start_date || a?.date;
            if (!raw) return false;
            const d = new Date(String(raw).slice(0, 10));
            return !Number.isNaN(d.getTime()) && d >= fourWeeksAgo && d <= now;
        });

        const weekendHitRate = Math.round((weekendRaces.length / 4) * 100);
        return {
            upcomingCount: upcomingRaces.length,
            racesLast4w: Math.max(recentRaces.length, recentRaceActivities.length),
            weekendRaces: weekendRaces.length,
            weekendHitRate,
        };
    }, [events, activities]);

    const latest = wellness?.[wellness.length - 1] || null;
    const ctl = latest?.icu_ctl ?? latest?.ctl ?? latest?.fitness ?? null;
    const atl = latest?.icu_atl ?? latest?.atl ?? latest?.fatigue ?? null;
    const tsb = ctl != null && atl != null ? ctl - atl : null;
    const currentFtp = getAthleteFtp(athlete);
    const restingHr = getWellnessRestingHr(latest);
    const longTermDaysLeft = daysUntil(profile.longTermGoalDate || null);

    const report = useMemo(() => {
        return buildBrutalReport({
            currentFtp,
            tsb,
            targetFtp: Number(profile.targetFtp) || null,
            targetDate: profile.targetDate || null,
            coachStyle: profile.coachStyle,
        });
    }, [currentFtp, tsb, profile.targetFtp, profile.targetDate, profile.coachStyle]);

    const update = (field, value) => {
        setProfile(prev => ({ ...prev, [field]: value }));
        setSaveMsg('');
    };

    const saveProfile = async () => {
        await persistence.saveAthleteProfile(profile);
        setSaveMsg('Profile saved.');
    };

    const toggleRacingWeek = async (weekKey) => {
        const nextWeeks = {
            ...(profile.racingWeeks || {}),
            [weekKey]: !(profile.racingWeeks || {})[weekKey],
        };
        const nextProfile = { ...profile, racingWeeks: nextWeeks };
        setProfile(nextProfile);
        await persistence.saveAthleteProfile(nextProfile);
        setSaveMsg('Week preference saved.');
        setTimeout(() => setSaveMsg(''), 1800);
    };

    // Get upcoming races for racing focus
    const upcomingRaces = useMemo(() => {
        const now = new Date();
        const raceLike = (events || []).filter(e => {
            const txt = `${e?.name || e?.title || ''} ${e?.type || ''} ${e?.event_type || ''}`.toLowerCase();
            return /race|crit|criterium|gp|road race|event/.test(txt);
        });

        return raceLike
            .filter(e => {
                const raw = e?.start_date_local || e?.start_date || e?.date || e?.event_date;
                if (!raw) return false;
                const d = new Date(String(raw).slice(0, 10));
                return !Number.isNaN(d.getTime()) && d >= new Date(new Date().toDateString());
            })
            .sort((a, b) => {
                const da = new Date(String(a.start_date_local || a.start_date || a.date || a.event_date).slice(0, 10)).getTime();
                const db = new Date(String(b.start_date_local || b.start_date || b.date || b.event_date).slice(0, 10)).getTime();
                return da - db;
            })
            .slice(0, 6);
    }, [events]);

    const nextRace = upcomingRaces[0] || null;
    const nextRaceDate = nextRace
        ? new Date(String(nextRace.start_date_local || nextRace.start_date || nextRace.date || nextRace.event_date).slice(0, 10))
        : null;
    const daysToNextRace = nextRaceDate
        ? Math.ceil((nextRaceDate.getTime() - new Date().getTime()) / 86400000)
        : null;

    // Calculate next 4 weekends and which races fall on them
    const next4Weekends = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Find the next Saturday (day 6)
        const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
        const firstSaturday = new Date(today);
        firstSaturday.setDate(today.getDate() + daysUntilSaturday);

        const weekends = [];
        for (let i = 0; i < 4; i++) {
            const saturday = new Date(firstSaturday);
            saturday.setDate(firstSaturday.getDate() + i * 7);
            const sunday = new Date(saturday);
            sunday.setDate(saturday.getDate() + 1);

            const satStr = saturday.toISOString().split('T')[0];
            const sunStr = sunday.toISOString().split('T')[0];

            // Find races on this weekend
            const racesThisWeekend = upcomingRaces.filter(race => {
                const raw = race?.start_date_local || race?.start_date || race?.date || race?.event_date;
                const raceDate = String(raw).slice(0, 10);
                return raceDate === satStr || raceDate === sunStr;
            });

            weekends.push({
                weekNum: i + 1,
                saturday,
                weekKey: satStr,
                saturday_str: saturday.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
                races: racesThisWeekend,
                raceCount: racesThisWeekend.length,
            });
        }
        return weekends;
    }, [upcomingRaces]);

    // ── Rider type analysis ─────────────────────────────────────
    const wkg = currentFtp && getAthleteWeight(athlete)
        ? (currentFtp / getAthleteWeight(athlete)).toFixed(2)
        : null;

    // Coggan (2010) power profiling table — international standard, used by TrainingPeaks, Intervals.icu, etc.
    const CAT_LEVELS = [
        { tier: 6, label: 'World Tour / Pro', range: '≥ 5.5', min: 5.5, max: Infinity, color: 'var(--accent-cyan)', desc: 'Professional peloton standard. UCI WorldTour / ProTeam level.' },
        { tier: 5, label: 'Elite Amateur', range: '5.0–5.5', min: 5.0, max: 5.5, color: 'var(--accent-blue)', desc: 'National-level competition. Top domestic amateur / U23 elite.' },
        { tier: 4, label: 'Cat 1 / Expert', range: '4.5–5.0', min: 4.5, max: 5.0, color: 'var(--accent-blue)', desc: 'Highest open amateur category. Strong regional racer.' },
        { tier: 3, label: 'Cat 2 / Advanced', range: '4.0–4.5', min: 4.0, max: 4.5, color: 'var(--accent-green)', desc: 'Competitive club racer. Finishing in the front group consistently.' },
        { tier: 2, label: 'Cat 3 / Competitive', range: '3.5–4.0', min: 3.5, max: 4.0, color: 'var(--accent-yellow)', desc: 'Active racer with consistent structured training.' },
        { tier: 1, label: 'Cat 4 / Recreational', range: '3.0–3.5', min: 3.0, max: 3.5, color: 'var(--accent-orange)', desc: 'Beginner racer or fit recreational cyclist.' },
        { tier: 0, label: 'Cat 5 / Untrained', range: '< 3.0', min: 0, max: 3.0, color: 'var(--text-2)', desc: 'New to structured training. Significant aerobic base to build.' },
    ];

    const riderLevel = (() => {
        const w = Number(wkg);
        if (!w) return null;
        const cat = CAT_LEVELS.find(c => w >= c.min && w < c.max) || CAT_LEVELS[CAT_LEVELS.length - 1];
        return { ...cat, source: `${cat.range} W/kg · Coggan power profiling table (2010) · Source: TrainingPeaks / Intervals.icu standard` };
    })();

    const riderArchetype = (() => {
        const hours = profile.weeklyHours || '';
        const isHighVolume = /16\+|12-16/.test(hours);
        const isModVolume = /8-12/.test(hours);
        const w = Number(wkg);
        if (!w) return null;
        if (w >= 4.5 && isHighVolume) return { label: 'GC / Climber', icon: '⛰', desc: 'High volume, strong W/kg. Built for hills and general classification.' };
        if (w >= 4.0 && !isHighVolume) return { label: 'Time Trialist', icon: '⏱', desc: 'High power output relative to volume. Strong solo effort capacity.' };
        if (w >= 3.8 && isModVolume) return { label: 'Breakaway Specialist', icon: '💨', desc: 'Sustained power with race IQ. Made for the right move at the right time.' };
        if (isHighVolume) return { label: 'Endurance / Diesel', icon: '🔋', desc: 'Built on volume. Gets stronger as races get longer.' };
        return { label: 'All-Rounder', icon: '⚡', desc: 'Balanced profile. Develop a speciality or keep diversifying.' };
    })();

    // ── Performance insights ────────────────────────────────────
    const insights = (() => {
        const items = [];
        const tsbVal = tsb ?? 0;
        const ctlVal = ctl ?? 0;
        const daysLeft = report.daysLeft;
        const reqW = report.reqPerWeek;

        if (tsbVal < -25) {
            items.push({ type: 'warning', title: 'High Fatigue Load', body: `TSB is ${tsbVal.toFixed(0)}. You are deep in fatigue — prioritize recovery before any intensity work.`, source: `TSB = CTL − ATL = ${ctlVal.toFixed(0)} − ${atl?.toFixed(0) ?? '?'} = ${tsbVal.toFixed(0)} · Coggan & Allen: TSB < −25 = overreaching zone` });
        } else if (tsbVal > 15) {
            items.push({ type: 'good', title: 'Fresh and Ready', body: `TSB is +${tsbVal.toFixed(0)}. You are in good form — optimal window to race or hit quality sessions.`, source: `TSB = ${tsbVal.toFixed(0)} · Coggan & Allen: optimal race window = +5 to +25` });
        }

        if (ctlVal > 0 && ctlVal < 50) {
            items.push({ type: 'focus', title: 'Build Your Aerobic Base', body: `CTL is ${ctlVal.toFixed(0)} — volume is your primary limiter right now. More Z2 hours will unlock everything else.`, source: `CTL = ${ctlVal.toFixed(0)} · Threshold: < 50 TSS = underdeveloped aerobic base (Coggan model)` });
        } else if (ctlVal >= 80) {
            items.push({ type: 'good', title: 'Strong Fitness Base', body: `CTL at ${ctlVal.toFixed(0)} — solid aerobic foundation. Shift focus to quality and race-specific efforts.`, source: `CTL = ${ctlVal.toFixed(0)} · Amateur racer target: 80–120 TSS (Coggan & Allen reference range)` });
        }

        if (report.delta != null && report.delta > 20) {
            items.push({ type: 'focus', title: 'FTP Gap to Target', body: `${report.delta.toFixed(0)}W gap to your FTP target.${reqW != null ? ` Requires ${reqW.toFixed(1)}W/week —` : ''} structured threshold sessions are key.`, source: `Current FTP: ${currentFtp}W · Target: ${Number(profile?.targetFtp || 0)}W · Gap: ${report.delta.toFixed(0)}W · Required progression: ${reqW?.toFixed(1) ?? '?'}W/week` });
        } else if (report.delta != null && report.delta <= 0) {
            items.push({ type: 'good', title: 'Target FTP Reached', body: 'You are at or above your FTP target on paper. Prove it consistently in training and racing.', source: `Current FTP ${currentFtp}W ≥ target ${Number(profile?.targetFtp || 0)}W` });
        }

        if (daysLeft != null && daysLeft > 0 && daysLeft <= 14) {
            items.push({ type: 'warning', title: 'Race Taper Zone', body: `${daysLeft} days to target event. Reduce volume, keep intensity sharp. Don't try to add fitness now.`, source: `${daysLeft}d to event · Taper protocol: reduce volume 30–50%, maintain one sharp intensity session (Mujika & Padilla, 2003)` });
        }

        if (restingHr != null && restingHr > 55) {
            items.push({ type: 'info', title: 'Monitor Recovery', body: `Resting HR at ${restingHr} bpm. Track the daily trend — a rise of +5–7 bpm above your baseline is an early overtraining signal.`, source: `RHR: ${restingHr} bpm · Source: Intervals.icu wellness log · Threshold: +5–7 bpm elevation = incomplete recovery (Meeusen et al., ECSS 2013)` });
        }

        if (items.length === 0) {
            items.push({ type: 'info', title: 'Connect Intervals.icu', body: 'Link your training data to get personalised insights, FTP readiness scores, and recovery tracking.', source: null });
        }

        return items;
    })();

    const insightColor = { good: 'var(--accent-green)', warning: 'var(--accent-red)', focus: 'var(--accent-cyan)', info: 'var(--text-3)' };
    const insightBg = { good: 'rgba(34,197,94,0.08)', warning: 'rgba(239,68,68,0.08)', focus: 'rgba(6,182,212,0.08)', info: 'var(--bg-2)' };
    const insightBorder = { good: 'rgba(34,197,94,0.25)', warning: 'rgba(239,68,68,0.25)', focus: 'rgba(6,182,212,0.25)', info: 'var(--border)' };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="page-title">{profile.riderName || 'Athlete Profile'}</div>
                    <div className="page-subtitle">
                        {profile.primarySport || 'Road Cycling'}
                        {currentFtp && ` · FTP ${currentFtp}W`}
                        {wkg && ` · ${wkg} W/kg`}
                        {riderLevel && <span style={{ marginLeft: 12, color: riderLevel.color, fontWeight: 600 }}>{riderLevel.label}</span>}
                    </div>
                </div>
                <button className="btn" onClick={() => setShowSettings(s => !s)}>
                    {showSettings ? 'Hide Settings' : 'Settings'}
                </button>
            </div>

            {/* ─── DATA STATUS ─── */}
            {(() => {
                const hasCtl = ctl != null;
                const hasAtlData = atl != null;
                const hasAll = hasCtl && hasAtlData && currentFtp;
                const hasNone = !hasCtl && !hasAtlData && !currentFtp && !restingHr;
                if (hasAll) return null;
                return (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', marginBottom: 14,
                        background: hasNone ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.06)',
                        border: `1px solid ${hasNone ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)'}`,
                        borderRadius: 8,
                    }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: hasNone ? 'var(--accent-red)' : 'var(--accent-yellow)' }} />
                        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                            {hasNone
                                ? <><strong style={{ color: 'var(--text-1)' }}>No training data connected.</strong> Go to Settings → Connect Intervals.icu to load CTL, ATL, TSB and wellness metrics.</>
                                : <><strong style={{ color: 'var(--text-1)' }}>Partial data.</strong> {!currentFtp ? 'FTP missing — set it in Settings. ' : ''}{!hasCtl ? 'Wellness not synced — CTL/ATL unavailable. ' : ''}Check your Intervals.icu connection.</>
                            }
                        </div>
                    </div>
                );
            })()}

            {/* ─── KEY METRICS ROW ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                    { label: 'FTP', value: currentFtp ? `${currentFtp}W` : '—', sub: wkg ? `${wkg} W/kg` : null, color: 'var(--accent-blue)' },
                    { label: 'FITNESS (CTL)', value: ctl != null ? ctl.toFixed(0) : '—', sub: 'chronic load · 42d avg', color: 'var(--ctl-color)' },
                    { label: 'FATIGUE (ATL)', value: atl != null ? atl.toFixed(0) : '—', sub: 'acute load · 7d avg', color: 'var(--atl-color)' },
                    { label: 'FORM (TSB)', value: tsb != null ? (tsb > 0 ? '+' : '') + tsb.toFixed(0) : '—', sub: tsb != null ? (tsb > 5 ? 'Fresh' : tsb < -20 ? 'Tired' : 'Neutral') : null, color: tsb != null && tsb > 5 ? 'var(--accent-green)' : tsb != null && tsb < -20 ? 'var(--accent-red)' : 'var(--tsb-color)' },
                    { label: 'RESTING HR', value: restingHr != null ? `${restingHr} bpm` : '—', sub: 'recovery proxy', color: 'var(--accent-orange)' },
                    { label: 'READINESS', value: report.readiness != null ? `${report.readiness}%` : '—', sub: report.status, color: report.status === 'good' ? 'var(--accent-green)' : report.status === 'bad' ? 'var(--accent-red)' : 'var(--accent-yellow)' },
                ].map(m => (
                    <div key={m.label} style={{ padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 8 }}>{m.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
                        {m.sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{m.sub}</div>}
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* ─── RIDER PROFILE ─── */}
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Rider Profile</span>
                        {riderLevel && (
                            <button
                                onClick={() => setShowCatBreakdown(s => !s)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                            >
                                <span className="card-badge" style={{ color: riderLevel.color, textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                                    {riderLevel.label} ↕
                                </span>
                            </button>
                        )}
                    </div>

                    {riderArchetype ? (
                        <div style={{ marginBottom: 16, padding: '16px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>{riderArchetype.icon}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-0)', marginBottom: 6 }}>{riderArchetype.label}</div>
                            <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>{riderArchetype.desc}</div>
                        </div>
                    ) : (
                        <div style={{ padding: 16, background: 'var(--bg-2)', borderRadius: 8, fontSize: 14, color: 'var(--text-3)' }}>
                            Connect Intervals.icu and set your FTP to see your rider profile.
                        </div>
                    )}

                    {showCatBreakdown && wkg && (
                        <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', background: 'var(--bg-3)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                                W/KG CLASSIFICATION · Coggan (2010)
                            </div>
                            {CAT_LEVELS.map(cat => {
                                const isCurrent = cat.tier === riderLevel?.tier;
                                return (
                                    <div key={cat.tier} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px',
                                        background: isCurrent ? `${cat.color}12` : 'transparent',
                                        borderLeft: isCurrent ? `3px solid ${cat.color}` : '3px solid transparent',
                                        borderBottom: '1px solid var(--border)',
                                    }}>
                                        <div style={{ minWidth: 70, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: cat.color }}>
                                            {cat.range}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--text-0)' : 'var(--text-2)' }}>
                                                {cat.label}
                                                {isCurrent && <span style={{ marginLeft: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: cat.color }}>← you ({wkg} W/kg)</span>}
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{cat.desc}</div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                                Source: Coggan A. (2010) Power profiling table · Used by TrainingPeaks, Intervals.icu · Based on 20-min FTP test normalized to body weight
                            </div>
                        </div>
                    )}

                    {wkg && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em' }}>W/KG BENCHMARK</div>
                                <div style={{ fontSize: 11, color: riderLevel?.color, fontWeight: 600 }}>{wkg} W/kg</div>
                            </div>
                            <div style={{ position: 'relative', height: 10, background: 'var(--bg-3)', borderRadius: 5, marginBottom: 6, overflow: 'hidden' }}>
                                {[
                                    { pct: 0, color: 'var(--text-3)' },
                                    { pct: 20, color: 'var(--accent-orange)' },
                                    { pct: 40, color: 'var(--accent-yellow)' },
                                    { pct: 60, color: 'var(--accent-green)' },
                                    { pct: 80, color: 'var(--accent-blue)' },
                                ].map((seg, i) => (
                                    <div key={i} style={{ position: 'absolute', left: `${seg.pct}%`, top: 0, bottom: 0, right: 0, background: seg.color, opacity: 0.28 }} />
                                ))}
                                <div style={{
                                    position: 'absolute', top: -1, bottom: -1,
                                    left: `${Math.min(99, (Number(wkg) - 2.5) / 3 * 100)}%`,
                                    width: 3, background: riderLevel?.color || 'var(--accent-cyan)',
                                    borderRadius: 2, boxShadow: `0 0 8px ${riderLevel?.color || 'var(--accent-cyan)'}`,
                                }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', marginBottom: 8 }}>
                                <span>Cat5</span><span>Cat4</span><span>Cat3</span><span>Cat2</span><span>Cat1</span><span>Elite</span>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                                Click category badge to see all levels
                            </div>
                        </div>
                    )}

                    {(currentFtp || (Array.isArray(powerCurve) && powerCurve.length > 0)) && (() => {
                        const DURATIONS = [
                            { key: '10s',  sec: 10,    label: '10 sec',   type: 'Neuromuscular', typeColor: 'var(--accent-purple)' },
                            { key: '30s',  sec: 30,    label: '30 sec',   type: 'Short Sprint',  typeColor: 'var(--accent-red)' },
                            { key: '1min', sec: 60,    label: '1 min',    type: 'Anaerobic',     typeColor: 'var(--accent-orange)' },
                            { key: '5min', sec: 300,   label: '5 min',    type: 'VO2 Max',       typeColor: 'var(--accent-yellow)' },
                            { key: '20min',sec: 1200,  label: '20 min',   type: 'Threshold',     typeColor: 'var(--accent-green)' },
                            { key: '1h',   sec: 3600,  label: '1 hour',   type: 'FTP',           typeColor: 'var(--accent-blue)' },
                            { key: '4h',   sec: 14400, label: '4 hours',  type: 'Aerobic Base',  typeColor: 'var(--text-2)' },
                        ];
                        const getRealWatts = (sec) => {
                            if (!Array.isArray(powerCurve) || powerCurve.length === 0) return null;
                            const sorted = [...powerCurve].sort((a, b) =>
                                Math.abs((a.secs || a.time || 0) - sec) - Math.abs((b.secs || b.time || 0) - sec)
                            );
                            const best = sorted[0];
                            if (!best) return null;
                            const bestSec = best.secs || best.time || 0;
                            if (Math.abs(bestSec - sec) > sec * 0.25) return null;
                            return best.watts || best.power || null;
                        };
                        const FALLBACK_PCT = { 10: 1.78, 30: 1.55, 60: 1.32, 300: 1.16, 1200: 1.05, 3600: 1.00, 14400: 0.76 };
                        const getEstimatedWatts = (sec) => currentFtp ? Math.round((FALLBACK_PCT[sec] ?? 1.0) * currentFtp) : null;
                        const rows = DURATIONS.map(d => {
                            const real = getRealWatts(d.sec);
                            const watts = real ?? getEstimatedWatts(d.sec);
                            return { ...d, watts, isReal: real != null };
                        }).filter(d => d.watts != null);
                        if (rows.length === 0) return null;
                        const maxW = rows[0].watts;
                        const hasReal = rows.some(r => r.isReal);
                        return (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>
                                    POWER PROFILE {hasReal ? '· INTERVALS.ICU' : '· ESTIMATE'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {rows.map(d => {
                                        const pct = currentFtp ? Math.round(d.watts / currentFtp * 100) : null;
                                        const barPct = Math.round(d.watts / maxW * 100);
                                        return (
                                            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ minWidth: 44, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>{d.label}</div>
                                                <div style={{ flex: 1, height: 18, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: d.typeColor, opacity: d.isReal ? 0.9 : 0.5, borderRadius: 3, transition: 'width 0.4s ease' }} />
                                                    <div style={{ position: 'absolute', right: 4, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-0)', fontWeight: 600 }}>
                                                        {d.watts}W
                                                    </div>
                                                </div>
                                                {pct != null && <div style={{ minWidth: 36, fontFamily: 'var(--font-mono)', fontSize: 11, color: d.typeColor, fontWeight: 600, textAlign: 'right' }}>{pct}%</div>}
                                                <div style={{ minWidth: 80, fontSize: 11, color: 'var(--text-3)' }}>{d.type}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
                                    {hasReal ? 'Intervals.icu · best power for each duration' : `Estimated · Coggan empirical ratios · connect Intervals.icu for real data`}
                                </div>
                            </div>
                        );
                    })()}

                    <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[
                            { label: profile.primarySport || 'Road Cycling', icon: '🚴' },
                            { label: profile.weeklyHours || '—', icon: '⏱' },
                            { label: profile.isRacing === 'yes' ? 'Race mode' : 'Build mode', icon: '📍' },
                        ].map(tag => (
                            <span key={tag.label} style={{ padding: '4px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 11, color: 'var(--text-2)' }}>
                                {tag.icon} {tag.label}
                            </span>
                        ))}
                    </div>
                </div>

                {/* ─── PERFORMANCE INSIGHTS ─── */}
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">What To Focus On</span>
                        <span className="card-badge">{insights.length} insight{insights.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {insights.map((ins, i) => (
                            <div key={i} style={{
                                padding: '12px 14px', borderRadius: 8,
                                background: insightBg[ins.type] || 'var(--bg-2)',
                                border: `1px solid ${insightBorder[ins.type] || 'var(--border)'}`,
                                borderLeft: `3px solid ${insightColor[ins.type] || 'var(--text-3)'}`,
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: insightColor[ins.type], marginBottom: 4 }}>{ins.title}</div>
                                <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>{ins.body}</div>
                                {ins.source && (
                                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
                                        {ins.source}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {report.verdict && (
                        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 8, borderLeft: `3px solid ${report.status === 'good' ? 'var(--accent-green)' : report.status === 'bad' ? 'var(--accent-red)' : 'var(--accent-yellow)'}` }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>TARGET ASSESSMENT</div>
                            <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>{report.verdict}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── UPCOMING RACES + WEEKENDS ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: upcomingRaces.length > 0 ? '1.4fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
                {upcomingRaces.length > 0 && (
                    <div className="card" style={{ marginBottom: 0 }}>
                        <div className="card-header">
                            <span className="card-title">Upcoming Races</span>
                            <span className="card-badge">{daysToNextRace != null ? `Next in ${daysToNextRace}d` : `${upcomingRaces.length} races`}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {upcomingRaces.map((race, idx) => {
                                const raceDate = new Date(String(race.start_date_local || race.start_date || race.date || race.event_date).slice(0, 10));
                                const daysUntilRace = Math.ceil((raceDate.getTime() - new Date().getTime()) / 86400000);
                                const isNextRace = idx === 0;
                                return (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 8,
                                        border: `1px solid ${isNextRace ? 'var(--accent-cyan)' : 'var(--border)'}`,
                                        background: isNextRace ? 'rgba(6,182,212,0.06)' : 'var(--bg-2)',
                                    }}>
                                        <div style={{
                                            minWidth: 48, textAlign: 'center', padding: '4px 8px',
                                            borderRadius: 6, background: isNextRace ? 'rgba(6,182,212,0.15)' : 'var(--bg-3)',
                                            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                                            color: isNextRace ? 'var(--accent-cyan)' : 'var(--text-3)',
                                        }}>
                                            {daysUntilRace === 0 ? 'TODAY' : `${daysUntilRace}d`}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)' }}>{race.name || race.title || 'Race'}</div>
                                            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{raceDate.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                                        </div>
                                        {isNextRace && <span style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>NEXT</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Next 4 Weekends</span>
                        <span className="card-badge">{next4Weekends.reduce((s, w) => s + w.raceCount, 0)} races</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {next4Weekends.map((weekend) => {
                            const isRacing = (profile.racingWeeks || {})[weekend.weekKey];
                            return (
                                <button
                                    key={weekend.weekNum}
                                    type="button"
                                    onClick={() => toggleRacingWeek(weekend.weekKey)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                        border: `1px solid ${isRacing ? 'var(--accent-green)' : weekend.raceCount > 0 ? 'rgba(6,182,212,0.3)' : 'var(--border)'}`,
                                        background: isRacing ? 'rgba(34,197,94,0.08)' : weekend.raceCount > 0 ? 'rgba(6,182,212,0.05)' : 'var(--bg-2)',
                                        textAlign: 'left', outline: 'none',
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                                            {weekend.saturday_str}
                                        </div>
                                        {weekend.raceCount > 0 ? (
                                            <div style={{ fontSize: 13, color: 'var(--accent-cyan)' }}>
                                                {weekend.races.map(r => r.name || r.title || 'Race').join(', ')}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>No races</div>
                                        )}
                                    </div>
                                    <div style={{
                                        padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                                        fontFamily: 'var(--font-mono)',
                                        color: isRacing ? 'var(--accent-green)' : 'var(--text-3)',
                                        background: isRacing ? 'rgba(34,197,94,0.15)' : 'var(--bg-3)',
                                    }}>
                                        {isRacing ? 'RACE' : 'TRAIN'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {saveMsg && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent-green)' }}>{saveMsg}</div>}
                </div>
            </div>

            {/* ─── TARGET GOAL ─── */}
            {(profile.targetEventName || profile.targetFtp) && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="card-header">
                        <span className="card-title">Target Goal</span>
                        <span className="card-badge">{report.daysLeft != null ? `${report.daysLeft}d remaining` : 'No date set'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                        {profile.targetEventName && (
                            <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 8 }}>
                                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>TARGET EVENT</div>
                                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)' }}>{profile.targetEventName}</div>
                                {profile.targetDate && <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{profile.targetDate}</div>}
                            </div>
                        )}
                        {profile.targetFtp && (
                            <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 8 }}>
                                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>TARGET FTP</div>
                                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{profile.targetFtp}W</div>
                                {report.delta != null && <div style={{ fontSize: 13, color: report.delta > 0 ? 'var(--accent-orange)' : 'var(--accent-green)', marginTop: 4 }}>{report.delta > 0 ? `+${report.delta.toFixed(0)}W gap` : 'Target met'}</div>}
                            </div>
                        )}
                        {report.reqPerWeek != null && report.reqPerWeek > 0 && (
                            <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 8 }}>
                                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>REQUIRED GAIN</div>
                                <div style={{ fontSize: 26, fontWeight: 700, color: report.status === 'good' ? 'var(--accent-green)' : report.status === 'bad' ? 'var(--accent-red)' : 'var(--accent-yellow)', fontFamily: 'var(--font-mono)' }}>
                                    {report.reqPerWeek.toFixed(1)} W/wk
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{report.verdict?.split('.')[0]}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── SETTINGS (COLLAPSIBLE) ─── */}
            {showSettings && (
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Profile Settings</span>
                        <button className="btn" onClick={() => setShowSettings(false)} style={{ fontSize: 12 }}>Close</button>
                    </div>

                    <div className="calendar-form-row">
                        <input className="form-input calendar-form-input" placeholder="Rider name" value={profile.riderName || ''} onChange={e => update('riderName', e.target.value)} />
                        <select className="form-input calendar-form-input" value={profile.primarySport || 'Road Cycling'} onChange={e => update('primarySport', e.target.value)}>
                            <option>Road Cycling</option>
                            <option>Triathlon</option>
                            <option>Running</option>
                            <option>Gravel</option>
                            <option>Track</option>
                            <option>Other endurance</option>
                        </select>
                    </div>

                    <div className="calendar-form-row">
                        <select className="form-input calendar-form-input" value={profile.weeklyHours || '8-12 hours'} onChange={e => update('weeklyHours', e.target.value)}>
                            <option>&lt; 5 hours</option>
                            <option>5-8 hours</option>
                            <option>8-12 hours</option>
                            <option>12-16 hours</option>
                            <option>16+ hours</option>
                        </select>
                        <select className="form-input calendar-form-input" value={profile.isRacing || 'yes'} onChange={e => update('isRacing', e.target.value)}>
                            <option value="yes">Currently racing: Yes</option>
                            <option value="no">Currently racing: No</option>
                        </select>
                    </div>

                    <div style={{ marginTop: 10, marginBottom: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Jours disponibles pour l'entraînement</div>
                        <div style={{ display: 'flex', gap: 5 }}>
                            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, i) => {
                                const avail = profile.availableDays == null || profile.availableDays.includes(i);
                                return (
                                    <button key={i} type="button" onClick={() => {
                                        const current = profile.availableDays ?? [0, 1, 2, 3, 4, 5, 6];
                                        const next = avail
                                            ? current.filter(d => d !== i)
                                            : [...current, i].sort((a, b) => a - b);
                                        update('availableDays', next);
                                    }} style={{
                                        padding: '5px 9px', borderRadius: 6, fontSize: 12,
                                        border: `1px solid ${avail ? 'var(--accent-cyan)' : 'var(--border)'}`,
                                        background: avail ? 'rgba(34,211,238,0.12)' : 'var(--bg-3)',
                                        color: avail ? 'var(--accent-cyan)' : 'var(--text-4)',
                                        cursor: 'pointer', fontFamily: 'var(--font-mono)',
                                    }}>
                                        {day}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="calendar-form-row">
                        <select className="form-input calendar-form-input" value={profile.coachStyle || 'Brutal honesty - no mercy'} onChange={e => update('coachStyle', e.target.value)}>
                            <option>Brutal honesty - no mercy</option>
                            <option>Direct and analytical - data first</option>
                            <option>Demanding but constructive</option>
                        </select>
                    </div>

                    <div style={{ marginTop: 8, marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Target Event</div>
                    <div className="calendar-form-row">
                        <input className="form-input calendar-form-input" placeholder="Target event name" value={profile.targetEventName || ''} onChange={e => update('targetEventName', e.target.value)} />
                        <input className="form-input calendar-form-input" type="date" value={profile.targetDate || ''} onChange={e => update('targetDate', e.target.value)} />
                    </div>
                    <div className="calendar-form-row">
                        <input className="form-input calendar-form-input" type="number" placeholder="Target FTP (W)" value={profile.targetFtp || ''} onChange={e => update('targetFtp', e.target.value)} />
                        <input className="form-input calendar-form-input" type="number" placeholder="Target weight (kg)" value={profile.targetWeight || ''} onChange={e => update('targetWeight', e.target.value)} />
                    </div>

                    <textarea
                        className="form-input calendar-form-input"
                        rows={3}
                        placeholder="Notes: weaknesses, injuries, constraints..."
                        value={profile.notes || ''}
                        onChange={e => update('notes', e.target.value)}
                        style={{ marginTop: 8 }}
                    />

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="btn btn-primary" onClick={saveProfile}>Save Profile</button>
                        {saveMsg && <div className="calendar-helper" style={{ color: 'var(--accent-green)' }}>{saveMsg}</div>}
                    </div>
                </div>
            )}
        </div>
    );
}
