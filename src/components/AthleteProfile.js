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

    return (
        <div>
            <div className="page-header">
                <div className="page-title">Athlete Profile</div>
                <div className="page-subtitle">{profile.riderName || 'Racer'} — Power targets, racing calendar, and race-specific readiness</div>
            </div>

            {/* ─── UPCOMING RACES (Race-Focused) ─── */}
            {upcomingRaces.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="card-header">
                        <span className="card-title">🏁 Upcoming Races ({upcomingRaces.length})</span>
                        <span className="card-badge">Next {daysToNextRace != null ? `${daysToNextRace}d` : '—'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {upcomingRaces.map((race, idx) => {
                            const raceDate = new Date(String(race.start_date_local || race.start_date || race.date || race.event_date).slice(0, 10));
                            const daysUntilRace = Math.ceil((raceDate.getTime() - new Date().getTime()) / 86400000);
                            const isNextRace = idx === 0;
                            return (
                                <div
                                    key={idx}
                                    style={{
                                        padding: 12,
                                        borderRadius: 6,
                                        border: `1px solid ${isNextRace ? 'var(--accent-cyan)' : 'var(--border)'}`,
                                        background: isNextRace ? 'rgba(34,211,238,0.08)' : 'var(--bg-2)',
                                    }}
                                >
                                    <div style={{ fontSize: 12, fontWeight: 600, color: isNextRace ? 'var(--accent-cyan)' : 'var(--text-2)' }}>
                                        {isNextRace ? '⭐ NEXT' : `+${daysUntilRace}d`}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: 'var(--text-1)' }}>
                                        {race.name || race.title || 'Race'}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                                        {raceDate.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}



            {/* ─── NEXT 4 WEEKENDS ─── */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                    <span className="card-title">📅 Next 4 Weekends</span>
                    <span className="card-badge">{next4Weekends.reduce((sum, w) => sum + w.raceCount, 0)} races</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    {next4Weekends.map((weekend) => (
                        <button
                            key={weekend.weekNum}
                            type="button"
                            onClick={() => toggleRacingWeek(weekend.weekKey)}
                            style={{
                                padding: 12,
                                borderRadius: 6,
                                border: `1px solid ${(profile.racingWeeks || {})[weekend.weekKey] ? 'var(--accent-green)' : (weekend.raceCount > 0 ? 'var(--accent-cyan)' : 'var(--border)')}`,
                                background: (profile.racingWeeks || {})[weekend.weekKey]
                                    ? 'rgba(34,197,94,0.12)'
                                    : (weekend.raceCount > 0 ? 'rgba(34,211,238,0.08)' : 'var(--bg-2)'),
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>
                                WEEK {weekend.weekNum} — {weekend.saturday_str}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: (profile.racingWeeks || {})[weekend.weekKey] ? 'var(--accent-green)' : 'var(--text-3)' }}>
                                {(profile.racingWeeks || {})[weekend.weekKey] ? 'RACING: ON' : 'RACING: OFF'}
                            </div>
                            {weekend.raceCount > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {weekend.races.map((race, idx) => (
                                        <div key={idx} style={{ fontSize: 11, color: 'var(--accent-cyan)', fontWeight: 500 }}>
                                            🏁 {race.name || race.title || 'Race'}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                                    No races
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="calendar-layout" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Rider Setup</span>
                        <span className="card-badge">Profile</span>
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
                        <div className="calendar-helper" style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                            {profile.isRacing === 'yes' ? 'Race mode enabled' : 'Build mode enabled'}
                        </div>
                    </div>

                    <div className="card-title" style={{ marginTop: 8, marginBottom: 8 }}>Target</div>

                    <div className="calendar-form-row">
                        <input className="form-input calendar-form-input" placeholder="Target event name" value={profile.targetEventName || ''} onChange={e => update('targetEventName', e.target.value)} />
                        <input className="form-input calendar-form-input" type="date" value={profile.targetDate || ''} onChange={e => update('targetDate', e.target.value)} />
                    </div>

                    <div className="calendar-form-row">
                        <input className="form-input calendar-form-input" type="number" placeholder="Target FTP (W)" value={profile.targetFtp || ''} onChange={e => update('targetFtp', e.target.value)} />
                        <input className="form-input calendar-form-input" type="number" placeholder="Target weight (kg)" value={profile.targetWeight || ''} onChange={e => update('targetWeight', e.target.value)} />
                    </div>

                    <div className="card-title" style={{ marginTop: 8, marginBottom: 8 }}>Long-Term Performance Goal</div>

                    <div className="calendar-form-row">
                        <select className="form-input calendar-form-input" value={profile.longTermGoalType || 'ftp'} onChange={e => update('longTermGoalType', e.target.value)}>
                            <option value="ftp">FTP (cycling watts)</option>
                            <option value="running_pace">Running pace</option>
                        </select>
                        {profile.longTermGoalType === 'running_pace' ? (
                            <input
                                className="form-input calendar-form-input"
                                type="text"
                                placeholder="Target pace (e.g. 3:45/km)"
                                value={profile.longTermGoalValue || ''}
                                onChange={e => update('longTermGoalValue', e.target.value)}
                            />
                        ) : (
                            <input
                                className="form-input calendar-form-input"
                                type="number"
                                placeholder="Target FTP (W)"
                                value={profile.longTermGoalValue || ''}
                                onChange={e => update('longTermGoalValue', e.target.value)}
                            />
                        )}
                    </div>

                    <div className="calendar-form-row">
                        <input
                            className="form-input calendar-form-input"
                            type="date"
                            value={profile.longTermGoalDate || ''}
                            onChange={e => update('longTermGoalDate', e.target.value)}
                        />
                        <div className="calendar-helper" style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                            {profile.longTermGoalDate
                                ? `Goal horizon: ${longTermDaysLeft != null ? `${longTermDaysLeft} days` : 'invalid date'}`
                                : 'Set a long-term goal date'}
                        </div>
                    </div>

                    <textarea
                        className="form-input calendar-form-input"
                        rows={4}
                        placeholder="Weaknesses, constraints, injury notes, lifestyle constraints"
                        value={profile.notes || ''}
                        onChange={e => update('notes', e.target.value)}
                    />

                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn btn-primary" onClick={saveProfile}>Save Profile</button>
                        {saveMsg && <div className="calendar-helper">{saveMsg}</div>}
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Brutal Readiness</span>
                        <span className="card-badge">{report.readiness != null ? `${report.readiness}%` : 'N/A'}</span>
                    </div>

                    {!hasWellnessData && (
                        <div className="info-banner" style={{ marginBottom: 12, backgroundColor: loading ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)', borderColor: loading ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)' }}>
                            <strong>{loading ? '⏳ Fetching training metrics...' : '⚠ Training data not yet loaded'}</strong>
                            <div style={{ marginTop: 6, fontSize: 12 }}>
                                {loading
                                    ? 'Syncing with Intervals.icu. CTL/ATL (fitness/fatigue), TSB (form), and RHR will appear here shortly.'
                                    : 'CTL/ATL/TSB metrics require Intervals.icu connection. Check Settings → Intervals.icu or navigate to Dashboard to trigger sync.'}
                            </div>
                        </div>
                    )}

                    <div className={`info-banner ${report.status === 'bad' ? 'error-banner' : ''}`} style={{ marginBottom: 12 }}>
                        <strong>{report.headline}</strong>
                        <div style={{ marginTop: 6 }}>{report.verdict}</div>
                    </div>

                    <div className="calendar-upcoming-list" style={{ marginTop: 0 }}>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Current FTP</div>
                            <div className="calendar-upcoming-title">{currentFtp || '—'} W</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">TSB / Form</div>
                            <div className="calendar-upcoming-title">{tsb != null ? tsb.toFixed(1) : '—'}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">CTL / ATL</div>
                            <div className="calendar-upcoming-title">{ctl != null ? ctl.toFixed(1) : '—'} / {atl != null ? atl.toFixed(1) : '—'}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Resting HR</div>
                            <div className="calendar-upcoming-title">{restingHr != null ? `${restingHr} bpm` : '—'}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Target FTP Gap</div>
                            <div className="calendar-upcoming-title">{report.delta != null ? `${report.delta > 0 ? '+' : ''}${report.delta.toFixed(1)} W` : '—'}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Required FTP / week</div>
                            <div className="calendar-upcoming-title">{report.reqPerWeek != null ? `${report.reqPerWeek.toFixed(2)} W/week` : '—'}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Days to target</div>
                            <div className="calendar-upcoming-title">{report.daysLeft != null ? report.daysLeft : '—'}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Races last 4 weeks</div>
                            <div className="calendar-upcoming-title">{critStats.racesLast4w}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Weekend race frequency</div>
                            <div className="calendar-upcoming-title">{critStats.weekendRaces}/4 ({critStats.weekendHitRate}%)</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Upcoming race count</div>
                            <div className="calendar-upcoming-title">{critStats.upcomingCount}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Racing mode</div>
                            <div className="calendar-upcoming-title">{profile.isRacing === 'yes' ? 'Racing' : 'Not racing'}</div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Long-term goal</div>
                            <div className="calendar-upcoming-title">
                                {profile.longTermGoalValue
                                    ? `${profile.longTermGoalType === 'running_pace' ? 'Pace' : 'FTP'}: ${profile.longTermGoalValue}${profile.longTermGoalType === 'running_pace' ? '' : ' W'}`
                                    : '—'}
                            </div>
                        </div>
                        <div className="calendar-upcoming-item">
                            <div className="calendar-upcoming-date">Goal timeline</div>
                            <div className="calendar-upcoming-title">{longTermDaysLeft != null ? `${longTermDaysLeft} days` : '—'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
