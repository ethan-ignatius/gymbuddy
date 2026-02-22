import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeRange = "7d" | "30d" | "90d" | "all";

interface LiftData {
    exercise: string;
    current1RM: number;
    prev1RM: number;
    history: number[]; // last N data points
    unit: string;
}

interface BodyMetric {
    label: string;
    value: string;
    change: string;
    positive: boolean;
}

interface WorkoutStat {
    label: string;
    value: string;
    sub: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const LIFT_DATA: LiftData[] = [
    { exercise: "Bench Press", current1RM: 245, prev1RM: 230, history: [210, 215, 220, 225, 230, 235, 240, 245], unit: "lbs" },
    { exercise: "Back Squat", current1RM: 340, prev1RM: 315, history: [280, 290, 300, 305, 310, 315, 325, 340], unit: "lbs" },
    { exercise: "Deadlift", current1RM: 405, prev1RM: 385, history: [350, 360, 365, 370, 380, 385, 395, 405], unit: "lbs" },
    { exercise: "Overhead Press", current1RM: 155, prev1RM: 145, history: [125, 130, 135, 138, 140, 145, 150, 155], unit: "lbs" },
    { exercise: "Barbell Row", current1RM: 205, prev1RM: 195, history: [165, 170, 180, 185, 190, 195, 200, 205], unit: "lbs" },
    { exercise: "Weighted Pull-up", current1RM: 90, prev1RM: 80, history: [50, 55, 60, 65, 70, 75, 80, 90], unit: "lbs" },
];

const BODY_METRICS: BodyMetric[] = [
    { label: "Body Weight", value: "185 lbs", change: "-3 lbs", positive: true },
    { label: "Body Fat", value: "14.2%", change: "-1.1%", positive: true },
    { label: "Lean Mass", value: "158.7 lbs", change: "+2.1 lbs", positive: true },
    { label: "BMI", value: "24.8", change: "-0.4", positive: true },
];

const MUSCLE_BALANCE: { group: string; score: number; color: string }[] = [
    { group: "Chest", score: 85, color: "#e8c468" },
    { group: "Back", score: 92, color: "#6b8f6e" },
    { group: "Shoulders", score: 78, color: "#c4b68a" },
    { group: "Arms", score: 70, color: "#e8c468" },
    { group: "Quads", score: 88, color: "#6b8f6e" },
    { group: "Hamstrings", score: 65, color: "#c4b68a" },
    { group: "Glutes", score: 72, color: "#e8c468" },
    { group: "Calves", score: 55, color: "#6b8f6e" },
];

const WEEKLY_VOLUME_ALL = [
    { week: "W1", volume: 32400 },
    { week: "W2", volume: 35100 },
    { week: "W3", volume: 28900 },
    { week: "W4", volume: 38200 },
    { week: "W5", volume: 41500 },
    { week: "W6", volume: 36800 },
    { week: "W7", volume: 39100 },
    { week: "W8", volume: 42300 },
];

function getWeeklyVolumeForRange(range: TimeRange): typeof WEEKLY_VOLUME_ALL {
    const take = range === "7d" ? 1 : range === "30d" ? 4 : range === "90d" ? 6 : 8;
    return WEEKLY_VOLUME_ALL.slice(-take).map((d, i) => ({ ...d, week: range === "7d" ? "This week" : `W${WEEKLY_VOLUME_ALL.length - take + i + 1}` }));
}

function getWorkoutStatsForRange(range: TimeRange): WorkoutStat[] {
    const sub: Record<TimeRange, string> = { "7d": "this week", "30d": "this month", "90d": "this quarter", all: "all time" };
    const vals: Record<TimeRange, [string, string, string, string]> = {
        "7d": ["4", "58 min", "42K", "1 week"],
        "30d": ["18", "61 min", "156K", "3 weeks"],
        "90d": ["47", "62 min", "284K", "4 weeks"],
        all: ["124", "63 min", "742K", "6 weeks"],
    };
    const [sessions, duration, volume, streak] = vals[range];
    return [
        { label: "Total Sessions", value: sessions, sub: sub[range] },
        { label: "Avg Duration", value: duration, sub: "per session" },
        { label: "Total Volume", value: volume, sub: "lbs lifted" },
        { label: "Streak", value: streak, sub: "current" },
    ];
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────

function Sparkline({ data, color = "#e8c468", width = 120, height = 32 }: {
    data: number[]; color?: string; width?: number; height?: number;
}) {
    if (!data.length) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const lastIdx = data.length - 1;
    const divisor = lastIdx > 0 ? lastIdx : 1;
    const pts = data.map((v, i) => {
        const x = (i / divisor) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    }).join(" ");
    const lastY = height - ((data[lastIdx] - min) / range) * (height - 4) - 2;
    const lastX = lastIdx > 0 ? width : width / 2;
    return (
        <svg width={width} height={height} style={{ display: "block" }}>
            <polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
        </svg>
    );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function VolumeBarChart({ data }: { data: typeof WEEKLY_VOLUME_ALL }) {
    const maxVol = Math.max(...data.map(d => d.volume));
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.4rem", height: "120px", padding: "0 0.25rem" }}>
            {data.map((d, i) => {
                const pct = (d.volume / maxVol) * 100;
                return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
                        <div style={{
                            fontSize: "0.5rem",
                            color: "#888",
                            opacity: i === data.length - 1 ? 1 : 0.6,
                        }}>
                            {(d.volume / 1000).toFixed(1)}K
                        </div>
                        <div style={{
                            width: "100%",
                            height: `${pct}%`,
                            background: i === data.length - 1
                                ? "linear-gradient(to top, rgba(232,196,104,0.6), rgba(232,196,104,0.3))"
                                : "rgba(255,255,255,0.06)",
                            borderRadius: "3px 3px 0 0",
                            border: i === data.length - 1 ? "1px solid rgba(232,196,104,0.3)" : "1px solid rgba(255,255,255,0.04)",
                            transition: "height 0.5s ease",
                            minHeight: "4px",
                        }} />
                        <div style={{
                            fontSize: "0.5rem",
                            color: i === data.length - 1 ? "#e8c468" : "#555",
                        }}>
                            {d.week}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Analytics Page ───────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const [range, setRange] = useState<TimeRange>("90d");
    const navigate = useNavigate();

    return (
        <div style={S.root}>
            <div style={S.bg} />

            {/* Header */}
            <header style={S.header}>
                <button onClick={() => navigate("/dashboard")} style={S.backBtn}>
                    ← Dashboard
                </button>
                <div style={S.headerCenter}>
                    <div style={S.headerTitle}>Analytics</div>
                    <div style={S.headerSub}>Marcus R. · Strength Program</div>
                </div>
                <div style={S.rangePills}>
                    {(["7d", "30d", "90d", "all"] as TimeRange[]).map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            style={{ ...S.pill, ...(range === r ? S.pillActive : {}) }}
                        >
                            {r === "all" ? "All" : r}
                        </button>
                    ))}
                </div>
            </header>

            {/* Content */}
            <div style={S.content}>
                {/* Top stats row */}
                <div style={S.statsRow}>
                    {getWorkoutStatsForRange(range).map((st, i) => (
                        <div key={i} className="dashboard-card" style={S.statCard}>
                            <div style={S.statValue}>{st.value}</div>
                            <div style={S.statLabel}>{st.label}</div>
                            <div style={S.statSub}>{st.sub}</div>
                        </div>
                    ))}
                </div>

                {/* Main grid */}
                <div style={S.grid}>
                    {/* Lift Progression */}
                    <div className="dashboard-card" style={{ ...S.card, gridColumn: "1 / 3", gridRow: "1 / 2" }}>
                        <div style={S.cardHeader}>
                            <span style={S.cardTitle}>Lift Progression</span>
                            <span style={S.cardBadge}>Est. 1RM</span>
                        </div>
                        <div style={S.liftList}>
                            {LIFT_DATA.map((lift, i) => {
                                const delta = lift.current1RM - lift.prev1RM;
                                const pct = ((delta / lift.prev1RM) * 100).toFixed(1);
                                return (
                                    <div key={i} className="ex-row" style={S.liftRow}>
                                        <div style={{ flex: 1 }}>
                                            <div style={S.liftName}>{lift.exercise}</div>
                                            <div style={S.liftMeta}>
                                                <span style={{ color: "#f0ede6" }}>{lift.current1RM} {lift.unit}</span>
                                                <span style={{ color: delta > 0 ? "#30d158" : "#ff453a" }}>
                                                    {" "}+{delta} ({pct}%)
                                                </span>
                                            </div>
                                        </div>
                                        <Sparkline data={lift.history} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Weekly Volume */}
                    <div className="dashboard-card" style={{ ...S.card, gridColumn: "3 / 4", gridRow: "1 / 2" }}>
                        <div style={S.cardHeader}>
                            <span style={S.cardTitle}>Weekly Volume</span>
                            <span style={S.cardBadge}>lbs</span>
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 0 }}>
                            <VolumeBarChart data={getWeeklyVolumeForRange(range)} />
                        </div>
                    </div>

                    {/* Muscle Balance */}
                    <div className="dashboard-card" style={{ ...S.card, gridColumn: "1 / 2", gridRow: "2 / 3" }}>
                        <div style={S.cardHeader}>
                            <span style={S.cardTitle}>Muscle Balance</span>
                            <span style={S.cardBadge}>score</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: 1, overflow: "auto" }}>
                            {MUSCLE_BALANCE.map((m, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <div style={{ width: "70px", fontSize: "0.65rem", color: "#888", flexShrink: 0 }}>{m.group}</div>
                                    <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "3px", overflow: "hidden" }}>
                                        <div style={{
                                            width: `${m.score}%`,
                                            height: "100%",
                                            background: `linear-gradient(90deg, ${m.color}66, ${m.color})`,
                                            borderRadius: "3px",
                                            transition: "width 0.6s ease",
                                        }} />
                                    </div>
                                    <div style={{ fontSize: "0.6rem", color: m.color, fontWeight: 600, width: "28px", textAlign: "right" }}>
                                        {m.score}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Body Metrics */}
                    <div className="dashboard-card" style={{ ...S.card, gridColumn: "2 / 3", gridRow: "2 / 3" }}>
                        <div style={S.cardHeader}>
                            <span style={S.cardTitle}>Body Metrics</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
                            {BODY_METRICS.map((m, i) => (
                                <div key={i} style={{ ...S.metricRow, borderBottom: i === BODY_METRICS.length - 1 ? "none" : S.metricRow.borderBottom }}>
                                    <div style={{ fontSize: "0.7rem", color: "#888" }}>{m.label}</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f0ede6" }}>{m.value}</span>
                                        <span style={{
                                            fontSize: "0.6rem",
                                            fontWeight: 500,
                                            color: m.positive ? "#30d158" : "#ff453a",
                                            background: m.positive ? "rgba(48,209,88,0.08)" : "rgba(255,69,58,0.08)",
                                            padding: "0.1rem 0.3rem",
                                            borderRadius: "4px",
                                        }}>
                                            {m.change}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Training Insights */}
                    <div className="dashboard-card" style={{ ...S.card, gridColumn: "3 / 4", gridRow: "2 / 3" }}>
                        <div style={S.cardHeader}>
                            <span style={S.cardTitle}>Insights</span>
                            <span style={{ fontSize: "0.5rem", color: "#6b8f6e" }}>AI</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1, overflow: "auto" }}>
                            {[
                                { positive: true, text: "Squat 1RM up 8% this month — strongest progression across all lifts." },
                                { positive: false, text: "Hamstring volume is 40% below quads. Consider adding RDLs or leg curls." },
                                { positive: true, text: "4-week consistency streak! Avg 3.9 sessions/week." },
                                { positive: false, text: "Bench press has plateaued for 2 weeks. Try adding pause reps or changing rep scheme." },
                            ].map((insight, i) => (
                                <div key={i} style={S.insightRow}>
                                    <span
                                        style={{
                                            width: "6px",
                                            height: "6px",
                                            borderRadius: "50%",
                                            flexShrink: 0,
                                            background: insight.positive ? "#30d158" : "#ff453a",
                                            marginTop: "0.35em",
                                        }}
                                        aria-hidden
                                    />
                                    <span style={{ fontSize: "0.65rem", color: "#bbb", lineHeight: 1.4 }}>{insight.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <style>{globalCss}</style>
        </div>
    );
}

// ─── Global CSS ───────────────────────────────────────────────────────────────

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  .dashboard-card {
    transition: border-color 0.55s ease;
  }
  .dashboard-card:hover {
    border-color: rgba(232,196,104,0.35) !important;
  }
  .ex-row {
    transition: border-color 0.5s ease, background 0.5s ease;
    cursor: default;
  }
  .ex-row:hover {
    border-color: rgba(232,196,104,0.2) !important;
    background: rgba(232,196,104,0.04) !important;
  }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
    root: {
        height: "100vh",
        background: "#0a0a0a",
        color: "#f0ede6",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
    },
    bg: {
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse 60% 40% at 30% 20%, rgba(107,143,110,0.04) 0%, transparent 60%), radial-gradient(ellipse 50% 30% at 80% 80%, rgba(232,196,104,0.03) 0%, transparent 60%)",
        pointerEvents: "none",
        zIndex: 0,
    },

    // ── Header ──
    header: {
        display: "flex",
        alignItems: "center",
        padding: "0.5rem 1rem",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
        zIndex: 10,
        gap: "0.75rem",
        background: "rgba(10,10,10,0.9)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
    },
    backBtn: {
        background: "none",
        border: "1px solid rgba(232,196,104,0.15)",
        borderRadius: "6px",
        color: "#e8c468",
        fontSize: "0.7rem",
        padding: "0.3rem 0.6rem",
        cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 500,
        transition: "border-color 0.3s ease",
    },
    headerCenter: { flex: 1 },
    headerTitle: {
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: "1.3rem",
        letterSpacing: "0.08em",
        color: "#e8c468",
    },
    headerSub: { fontSize: "0.65rem", color: "#6b6760" },
    rangePills: {
        display: "flex",
        gap: "0.25rem",
    },
    pill: {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "6px",
        color: "#888",
        fontSize: "0.6rem",
        padding: "0.25rem 0.55rem",
        cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 500,
        transition: "all 0.2s ease",
    },
    pillActive: {
        background: "rgba(232,196,104,0.12)",
        borderColor: "rgba(232,196,104,0.3)",
        color: "#e8c468",
    },

    // ── Content ──
    content: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "0.5rem",
        gap: "0.5rem",
        overflow: "hidden",
        minHeight: 0,
    },

    // ── Stats ──
    statsRow: {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.5rem",
        flexShrink: 0,
    },
    statCard: {
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(232,196,104,0.12)",
        borderRadius: "12px",
        padding: "0.6rem 0.75rem",
        animation: "fadeUp 0.35s ease both",
        textAlign: "center",
    },
    statValue: {
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: "1.6rem",
        letterSpacing: "0.04em",
        color: "#e8c468",
        lineHeight: 1,
    },
    statLabel: {
        fontSize: "0.6rem",
        fontWeight: 600,
        color: "#f0ede6",
        marginTop: "0.15rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
    },
    statSub: {
        fontSize: "0.5rem",
        color: "#555",
        marginTop: "0.1rem",
    },

    // ── Grid / Cards ──
    grid: {
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1.3fr 1fr",
        gap: "0.5rem",
        overflow: "hidden",
        minHeight: 0,
    },
    card: {
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(232,196,104,0.12)",
        borderRadius: "12px",
        padding: "0.6rem 0.7rem",
        animation: "fadeUp 0.35s ease both",
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        overflow: "hidden",
        minHeight: 0,
        position: "relative",
    },
    cardHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
    },
    cardTitle: {
        fontSize: "0.6rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#888",
    },
    cardBadge: {
        fontSize: "0.45rem",
        color: "#e8c468",
        background: "rgba(232,196,104,0.08)",
        border: "1px solid rgba(232,196,104,0.15)",
        borderRadius: "6px",
        padding: "0.08rem 0.3rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontWeight: 600,
    },

    // ── Lift rows ──
    liftList: {
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        flex: 1,
        overflow: "auto",
        minHeight: 0,
    },
    liftRow: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "8px",
        padding: "0.5rem 0.65rem",
    },
    liftName: { fontWeight: 600, fontSize: "0.78rem" },
    liftMeta: { fontSize: "0.62rem", color: "#888", marginTop: "0.1rem" },

    // ── Body Metrics ──
    metricRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.35rem 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
    },

    // ── Insights ──
    insightRow: {
        display: "flex",
        gap: "0.4rem",
        alignItems: "flex-start",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "8px",
        padding: "0.45rem 0.55rem",
    },
};
