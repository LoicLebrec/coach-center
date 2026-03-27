import React, { useMemo } from 'react';

/**
 * ActivityHeatmap: Displays past activities as a calendar heatmap.
 * Similar to GitHub contribution graph, shows activity intensity via color.
 * 
 * - Light: Low TSS (< 50)
 * - Medium: Medium TSS (50-150)
 * - Dark: High TSS (150+)
 * - Gray: No activity
 */

const ActivityHeatmap = ({ activities = [], weeks = 12 }) => {
    // Calculate heatmap data
    const { dates, maxTss, cellMap } = useMemo(() => {
        if (!activities || activities.length === 0) {
            return { dates: [], maxTss: 0, cellMap: {} };
        }

        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - weeks * 7);
        startDate.setHours(0, 0, 0, 0);

        // Group activities by date
        const dateMap = {};
        let max = 0;

        activities.forEach((activity) => {
            const aDate = new Date(activity.start_date_local);
            aDate.setHours(0, 0, 0, 0);

            // Only include activities within the range
            if (aDate >= startDate && aDate <= now) {
                const key = aDate.toISOString().split('T')[0];
                const tss = activity.icu_training_load || activity.training_load || activity.tss || 0;

                if (!dateMap[key]) {
                    dateMap[key] = { tss: 0, activities: [], count: 0 };
                }
                dateMap[key].tss += tss;
                dateMap[key].activities.push(activity);
                dateMap[key].count += 1;
                max = Math.max(max, dateMap[key].tss);
            }
        });

        // Generate all dates in range for consistent grid
        const allDates = [];
        const current = new Date(startDate);
        while (current <= now) {
            const key = current.toISOString().split('T')[0];
            allDates.push(key);
            current.setDate(current.getDate() + 1);
        }

        return { dates: allDates, maxTss: max, cellMap: dateMap };
    }, [activities, weeks]);

    // Determine color based on TSS
    const getColor = (tss) => {
        if (!tss || tss === 0) return '#f0f0f0'; // Light gray: no activity
        const ratio = Math.min(tss / (maxTss * 0.7), 1); // Scale to 70% of max for better color spread

        if (ratio < 0.2) return '#c6e48b'; // Very light green
        if (ratio < 0.4) return '#7bc96f'; // Light green
        if (ratio < 0.6) return '#239a3b'; // Medium green
        if (ratio < 0.8) return '#196127'; // Dark green
        return '#0d3817'; // Very dark green
    };

    // Group dates into weeks (Sunday start)
    const weeks_grouped = useMemo(() => {
        const result = [];
        let currentWeek = null;

        dates.forEach((dateStr) => {
            const date = new Date(`${dateStr}T00:00:00`);
            const dayOfWeek = date.getDay(); // 0 = Sunday

            if (dayOfWeek === 0 || currentWeek === null) {
                currentWeek = [];
                result.push(currentWeek);
            }
            currentWeek.push(dateStr);
        });

        return result;
    }, [dates]);

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div style={{ padding: '20px', backgroundColor: '#fafbfc', borderRadius: '8px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
                Past {weeks} Weeks Activity
            </h3>

            <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                {/* Day labels */}
                <div style={{ display: 'flex', marginBottom: '8px' }}>
                    <div style={{ width: '20px', marginRight: '4px' }} />
                    {dayLabels.map((label) => (
                        <div
                            key={label}
                            style={{
                                width: '14px',
                                height: '14px',
                                fontSize: '11px',
                                fontWeight: '500',
                                color: '#666',
                                marginRight: '2px',
                                textAlign: 'center',
                            }}
                        >
                            {label.charAt(0)}
                        </div>
                    ))}
                </div>

                {/* Heatmap grid */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    {weeks_grouped.map((week, weekIdx) => (
                        <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {week.map((dateStr, dayIdx) => {
                                const cellData = cellMap[dateStr];
                                const tss = cellData?.tss || 0;
                                const color = getColor(tss);
                                const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();

                                return (
                                    <HeatmapCell
                                        key={dateStr}
                                        date={dateStr}
                                        tss={tss}
                                        color={color}
                                        activities={cellData?.activities || []}
                                        dayOfWeek={dayOfWeek}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div style={{ marginTop: '16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#666', fontWeight: '500' }}>Less</span>
                {[0, 0.2, 0.4, 0.6, 0.8].map((ratio, i) => (
                    <div
                        key={i}
                        style={{
                            width: '12px',
                            height: '12px',
                            backgroundColor: getColor(ratio * maxTss),
                            borderRadius: '2px',
                            border: '1px solid #ddd',
                        }}
                    />
                ))}
                <span style={{ color: '#666', fontWeight: '500' }}>More</span>
                <span style={{ marginLeft: '8px', color: '#999' }}>TSS</span>
            </div>

            {/* Summary stats */}
            {cellMap && Object.keys(cellMap).length > 0 && (
                <div
                    style={{
                        marginTop: '16px',
                        padding: '8px 12px',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#666',
                    }}
                >
                    <strong>{Object.keys(cellMap).length}</strong> active days · <strong>{Math.round(Object.values(cellMap).reduce((sum, d) => sum + d.tss, 0))}</strong> total
                    TSS
                </div>
            )}
        </div>
    );
};

/**
 * Single heatmap cell component
 */
const HeatmapCell = ({ date, tss, color, activities, dayOfWeek }) => {
    const [tooltip, setTooltip] = React.useState(null);

    const handleHover = (e) => {
        if (tss > 0) {
            const rect = e.currentTarget.getBoundingClientRect();
            const dateObj = new Date(`${date}T00:00:00`);
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];

            setTooltip({
                x: rect.left,
                y: rect.top,
                date: `${dayName}, ${dateObj.toLocaleDateString()}`,
                tss: Math.round(tss * 10) / 10,
                count: activities.length,
            });
        }
    };

    return (
        <>
            <div
                onMouseEnter={handleHover}
                onMouseLeave={() => setTooltip(null)}
                style={{
                    width: '14px',
                    height: '14px',
                    backgroundColor: color,
                    borderRadius: '2px',
                    border: '1px solid #ddd',
                    cursor: tss > 0 ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    opacity: tss > 0 ? 1 : 0.5,
                }}
                title={tss > 0 ? `${tss.toFixed(0)} TSS` : 'No activity'}
            />
            {tooltip && (
                <div
                    style={{
                        position: 'fixed',
                        top: tooltip.y - 50,
                        left: tooltip.x,
                        backgroundColor: '#333',
                        color: '#fff',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        zIndex: 1000,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}
                >
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{tooltip.date}</div>
                    <div>{Math.round(tooltip.tss)} TSS</div>
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>
                        {tooltip.count} activity{tooltip.count !== 1 ? 'ies' : ''}
                    </div>
                </div>
            )}
        </>
    );
};

export default ActivityHeatmap;
