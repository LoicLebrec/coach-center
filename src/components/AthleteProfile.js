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

export default function AthleteProfile({ wellness = [], athlete = null, events = [], activities = [], loading = false }) {
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
    const ctl = latest?.icu_ctl ?? null;
    const atl = latest?.icu_atl ?? null;
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

    const riderLevel = (() => {
        const w = Number(wkg);
        if (!w) return null;
        if (w >= 5.0) return { label: 'Elite / Pro', color: 'var(--accent-cyan)', tier: 5 };
        if (w >= 4.5) return { label: 'Cat A / Semi-pro', color: 'var(--accent-blue)', tier: 4 };
        if (w >= 4.0) return { label: 'Competitive Cat A', color: 'var(--accent-green)', tier: 3 };
        if (w >= 3.5) return { label: 'Strong Cat B', color: 'var(--accent-yellow)', tier: 2 };
        if (w >= 3.0) return { label: 'Cat C / Improving', color: 'var(--accent-orange)', tier: 1 };
        return { label: 'Recreational', color: 'var(--text-2)', tier: 0 };
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
            items.push({ type: 'warning', title: 'High Fatigue Load', body: `TSB is ${tsbVal.toFixed(0)}. You are deep in fatigue. Prioritize recovery before any intensity work.` });
        } else if (tsbVal > 15) {
            items.push({ type: 'good', title: 'Fresh and Ready', body: `TSB is +${tsbVal.toFixed(0)}. You have good form. This is the time to race or hit quality sessions.` });
        }

        if (ctlVal > 0 && ctlVal < 50) {
            items.push({ type: 'focus', title: 'Build Your Aerobic Base', body: 'CTL is below 50 — volume is your primary limiter. More Z2 hours will unlock everything else.' });
        } else if (ctlVal >= 80) {
            items.push({ type: 'good', title: 'Strong Fitness Base', body: `CTL at ${ctlVal.toFixed(0)} — solid fitness foundation. Focus on quality and race-specific efforts.` });
        }

        if (report.delta != null && report.delta > 20) {
            items.push({ type: 'focus', title: 'FTP Gap to Target', body: `${report.delta.toFixed(0)}W gap to target. ${reqW != null ? `Requires ${reqW.toFixed(1)}W/week — ` : ''}structured threshold sessions are key.` });
        } else if (report.delta != null && report.delta <= 0) {
            items.push({ type: 'good', title: 'Target FTP Reached', body: 'You are at or above your FTP target. Now prove it consistently in training and racing.' });
        }

        if (daysLeft != null && daysLeft > 0 && daysLeft <= 14) {
            items.push({ type: 'warning', title: 'Race Taper Zone', body: `${daysLeft} days to target event. Reduce volume, keep intensity sharp. Don't add fitness now — show what you have.` });
        }

        if (restingHr != null && restingHr > 55) {
            items.push({ type: 'info', title: 'Monitor Recovery', body: `Resting HR at ${restingHr} bpm. Track trend daily — rising RHR is often the first signal of overtraining.` });
        }

        if (items.length === 0) {
            items.push({ type: 'info', title: 'Connect Intervals.icu', body: 'Link your training data to get personalised insights, FTP readiness scores, and recovery tracking.' });
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

            {/* ─── KEY METRICS ROW ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                    { label: 'FTP', value: currentFtp ? `${currentFtp}W` : '—', sub: wkg ? `${wkg} W/kg` : null, color: 'var(--accent-blue)' },
                    { label: 'FITNESS (CTL)', value: ctl != null ? ctl.toFixed(0) : '—', sub: 'chronic load', color: 'var(--ctl-color)' },
                    { label: 'FATIGUE (ATL)', value: atl != null ? atl.toFixed(0) : '—', sub: 'acute load', color: 'var(--atl-color)' },
                    { label: 'FORM (TSB)', value: tsb != null ? (tsb > 0 ? '+' : '') + tsb.toFixed(0) : '—', sub: tsb != null ? (tsb > 5 ? 'Fresh' : tsb < -20 ? 'Tired' : 'Neutral') : null, color: tsb != null && tsb > 5 ? 'var(--accent-green)' : tsb != null && tsb < -20 ? 'var(--accent-red)' : 'var(--tsb-color)' },
                    { label: 'RESTING HR', value: restingHr != null ? `${restingHr} bpm` : '—', sub: 'recovery proxy', color: 'var(--accent-orange)' },
                    { label: 'READINESS', value: report.readiness != null ? `${report.readiness}%` : '—', sub: report.status, color: report.status === 'good' ? 'var(--accent-green)' : report.status === 'bad' ? 'var(--accent-red)' : 'var(--accent-yellow)' },
                ].map(m => (
                    <div key={m.label} style={{ padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 8 }}>{m.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
                        {m.sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{m.sub}</div>}
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* ─── RIDER PROFILE ─── */}
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Rider Profile</span>
                        {riderLevel && <span className="card-badge" style={{ color: riderLevel.color }}>{riderLevel.label}</span>}
                    </div>

                    {riderArchetype ? (
                        <div style={{ marginBottom: 16, padding: '16px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>{riderArchetype.icon}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-0)', marginBottom: 6 }}>{riderArchetype.label}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{riderArchetype.desc}</div>
                        </div>
                    ) : (
                        <div style={{ padding: 16, background: 'var(--bg-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-3)' }}>
                            Connect Intervals.icu and set your FTP to see your rider profile.
                        </div>
                    )}

                    {wkg && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>W/KG BENCHMARK</div>
                            <div style={{ position: 'relative', height: 8, background: 'var(--bg-3)', borderRadius: 4, marginBottom: 6, overflow: 'hidden' }}>
                                {[
                                    { label: 'Rec', pct: 0, color: 'var(--text-3)' },
                                    { label: 'Cat C', pct: 33, color: 'var(--accent-orange)' },
                                    { label: 'Cat B', pct: 50, color: 'var(--accent-yellow)' },
                                    { label: 'Cat A', pct: 67, color: 'var(--accent-green)' },
                                    { label: 'Elite', pct: 84, color: 'var(--accent-blue)' },
                                ].map(seg => (
                                    <div key={seg.label} style={{ position: 'absolute', left: `${seg.pct}%`, top: 0, bottom: 0, right: 0, background: seg.color, opacity: 0.3 }} />
                                ))}
                                <div style={{
                                    position: 'absolute', top: -1, bottom: -1,
                                    left: `${Math.min(99, (Number(wkg) - 2.5) / 3 * 100)}%`,
                                    width: 3, background: riderLevel?.color || 'var(--accent-cyan)',
                                    borderRadius: 2, boxShadow: `0 0 6px ${riderLevel?.color || 'var(--accent-cyan)'}`,
                                }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                                <span>2.5</span><span>3.0</span><span>3.5</span><span>4.0</span><span>4.5</span><span>5.5+</span>
                            </div>
                        </div>
                    )}

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
                                <div style={{ fontSize: 12, fontWeight: 700, color: insightColor[ins.type], marginBottom: 4 }}>{ins.title}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{ins.body}</div>
                            </div>
                        ))}
                    </div>

                    {report.verdict && (
                        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 8, borderLeft: `3px solid ${report.status === 'good' ? 'var(--accent-green)' : report.status === 'bad' ? 'var(--accent-red)' : 'var(--accent-yellow)'}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>TARGET ASSESSMENT</div>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{report.verdict}</div>
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
                                            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                                            color: isNextRace ? 'var(--accent-cyan)' : 'var(--text-3)',
                                        }}>
                                            {daysUntilRace === 0 ? 'TODAY' : `${daysUntilRace}d`}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>{race.name || race.title || 'Race'}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{raceDate.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                                        </div>
                                        {isNextRace && <span style={{ fontSize: 11, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>NEXT</span>}
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
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                                            {weekend.saturday_str}
                                        </div>
                                        {weekend.raceCount > 0 ? (
                                            <div style={{ fontSize: 11, color: 'var(--accent-cyan)' }}>
                                                {weekend.races.map(r => r.name || r.title || 'Race').join(', ')}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>No races</div>
                                        )}
                                    </div>
                                    <div style={{
                                        padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
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
                    {saveMsg && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-green)' }}>{saveMsg}</div>}
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
                                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>TARGET EVENT</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{profile.targetEventName}</div>
                                {profile.targetDate && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{profile.targetDate}</div>}
                            </div>
                        )}
                        {profile.targetFtp && (
                            <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>TARGET FTP</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{profile.targetFtp}W</div>
                                {report.delta != null && <div style={{ fontSize: 11, color: report.delta > 0 ? 'var(--accent-orange)' : 'var(--accent-green)', marginTop: 4 }}>{report.delta > 0 ? `+${report.delta.toFixed(0)}W gap` : 'Target met'}</div>}
                            </div>
                        )}
                        {report.reqPerWeek != null && report.reqPerWeek > 0 && (
                            <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>REQUIRED GAIN</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: report.status === 'good' ? 'var(--accent-green)' : report.status === 'bad' ? 'var(--accent-red)' : 'var(--accent-yellow)', fontFamily: 'var(--font-mono)' }}>
                                    {report.reqPerWeek.toFixed(1)} W/wk
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{report.verdict?.split('.')[0]}</div>
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
