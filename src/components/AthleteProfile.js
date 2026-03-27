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

export default function AthleteProfile({ wellness = [], athlete = null, events = [], activities = [] }) {
    const [profile, setProfile] = useState({
        riderName: '',
        primarySport: 'Road Cycling',
        weeklyHours: '8-12 hours',
        coachStyle: 'Brutal honesty - no mercy',
        notes: '',
        targetEventName: '',
        targetDate: '',
        targetFtp: '',
        targetWeight: '',
    });
    const [saveMsg, setSaveMsg] = useState('');

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

    return (
        <div>
            <div className="page-header">
                <div className="page-title">Athlete Profile</div>
                <div className="page-subtitle">FTP, target event tracking, and brutally honest readiness feedback</div>
            </div>

            <div className="calendar-layout" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Rider Setup</span>
                        <span className="card-badge">Persistent profile</span>
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
                        <select className="form-input calendar-form-input" value={profile.coachStyle || 'Brutal honesty - no mercy'} onChange={e => update('coachStyle', e.target.value)}>
                            <option>Brutal honesty - no mercy</option>
                            <option>Direct and analytical - data first</option>
                            <option>Demanding but constructive</option>
                        </select>
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
                    </div>
                </div>
            </div>
        </div>
    );
}
