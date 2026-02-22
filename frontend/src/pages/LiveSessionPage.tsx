import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";

interface LogEntry {
  line: string;
  source: "stdout" | "stderr";
}

interface WorkoutLog {
  id: string;
  createdAt: string;
  exercise: string;
  setsCompleted: number;
  totalReps: number;
  weightLbs: number | null;
  avgScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
  scores: number[] | null;
  injuryWarnings: number;
}

const EXERCISE_LABELS: Record<string, string> = {
  bicep_curl: "Bicep Curl",
  lateral_raise: "Lateral Raise",
};

const CHART_COLORS = ["#e8c468", "#30d158", "#5ac8fa", "#af52de"];

function formatExercise(name: string): string {
  return EXERCISE_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Session Summary & Charts ───────────────────────────────────────────────

function SessionSummary({ logs }: { logs: WorkoutLog[] }) {
  const summary = useMemo(() => {
    const totalExercises = logs.length;
    const totalReps = logs.reduce((s, l) => s + l.totalReps, 0);
    const totalSets = logs.reduce((s, l) => s + l.setsCompleted, 0);
    const scores = logs.flatMap((l) => (l.scores ?? []));
    const avgForm = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    const injuryCount = logs.reduce((s, l) => s + (l.injuryWarnings ?? 0), 0);
    return { totalExercises, totalReps, totalSets, avgForm, injuryCount };
  }, [logs]);

  const repsByExercise = useMemo(() => {
    const byEx: Record<string, { name: string; reps: number; sets: number }> = {};
    logs.forEach((l) => {
      const name = formatExercise(l.exercise);
      if (!byEx[name]) byEx[name] = { name, reps: 0, sets: 0 };
      byEx[name].reps += l.totalReps;
      byEx[name].sets += l.setsCompleted;
    });
    return Object.values(byEx);
  }, [logs]);

  const formOverTime = useMemo(() => {
    return logs
      .filter((l) => l.avgScore != null)
      .map((l, i) => ({
        index: i + 1,
        exercise: formatExercise(l.exercise),
        score: l.avgScore!,
        date: formatDate(l.createdAt),
      }))
      .slice(-10);
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div style={S.dataEmpty}>
        No workout data yet. Complete exercises in the pose tracker to see summaries and charts.
      </div>
    );
  }

  return (
    <div style={S.summaryContent}>
      <div style={S.summaryCards}>
        <div style={S.summaryCard}>
          <div style={S.summaryValue}>{summary.totalExercises}</div>
          <div style={S.summaryLabel}>Exercises</div>
        </div>
        <div style={S.summaryCard}>
          <div style={S.summaryValue}>{summary.totalReps}</div>
          <div style={S.summaryLabel}>Total Reps</div>
        </div>
        <div style={S.summaryCard}>
          <div style={S.summaryValue}>{summary.avgForm != null ? `${summary.avgForm}` : "—"}</div>
          <div style={S.summaryLabel}>Avg Form</div>
        </div>
        <div style={summary.injuryCount > 0 ? { ...S.summaryCard, ...S.summaryCardWarning } : S.summaryCard}>
          <div style={summary.injuryCount > 0 ? { ...S.summaryValue, ...S.summaryValueWarning } : S.summaryValue}>
            {summary.injuryCount}
          </div>
          <div style={S.summaryLabel}>Warnings</div>
        </div>
      </div>

      {repsByExercise.length > 0 && (
        <div style={S.chartBlock}>
          <div style={S.chartTitle}>Reps by Exercise</div>
          <div style={S.chartWrap}>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={repsByExercise} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} />
                <YAxis tick={{ fill: "#888", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#e8c468" }}
                  formatter={(value: number, _: unknown, props: { payload: { sets: number } }) => [
                    `${value} reps (${props.payload.sets} sets)`,
                    "",
                  ]}
                />
                <Bar dataKey="reps" radius={[4, 4, 0, 0]}>
                  {repsByExercise.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {formOverTime.length > 0 && (
        <div style={S.chartBlock}>
          <div style={S.chartTitle}>Form Score Over Time</div>
          <div style={S.chartWrap}>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={formOverTime} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <XAxis dataKey="index" tick={{ fill: "#888", fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#888", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                  }}
                  formatter={(value: number, _: unknown, props: { payload: { exercise: string; date: string } }) => [
                    `${value} — ${props.payload.exercise}`,
                    props.payload.date,
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#e8c468"
                  strokeWidth={2}
                  dot={{ fill: "#e8c468", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={S.recentLabel}>Recent Exercises</div>
      <div style={S.recentList}>
        {logs.slice(0, 5).map((log) => (
          <div key={log.id} style={S.logItem}>
            <div style={S.logHeader}>
              <span style={S.logExercise}>{formatExercise(log.exercise)}</span>
              <span style={S.logDate}>{formatDate(log.createdAt)}</span>
            </div>
            <div style={S.logStats}>
              <span>{log.setsCompleted} sets</span>
              <span>{log.totalReps} reps</span>
              {log.weightLbs != null && <span>{log.weightLbs} lbs</span>}
              {log.avgScore != null && (
                <span style={{ color: "#e8c468" }}>form {log.avgScore}</span>
              )}
              {(log.injuryWarnings ?? 0) > 0 && (
                <span style={{ color: "#ff6b6b" }}>⚠ {log.injuryWarnings}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LiveSessionPage() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streamKey, setStreamKey] = useState(0);
  const [streamError, setStreamError] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => logsEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    const es = new EventSource("/api/pose-tracker/logs");
    es.onmessage = (e) => {
      try {
        const { line, source } = JSON.parse(e.data) as LogEntry;
        setLogs((prev) => [...prev.slice(-500), { line, source }]);
      } catch {
        // ignore
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  useEffect(() => {
    const fetchLogs = () => {
      fetch("/api/live-session/workout-logs")
        .then((r) => r.json())
        .then((data) => setWorkoutLogs(Array.isArray(data) ? data : []))
        .catch(() => setWorkoutLogs([]));
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const start = async () => {
    const res = await fetch("/api/pose-tracker/start", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setRunning(true);
      setStreamError(false);
      setStreamKey((k) => k + 1);
      setLogs((prev) => [...prev, { line: data.message ?? "Started", source: "stdout" }]);
    } else {
      setLogs((prev) => [...prev, { line: data.error ?? "Failed to start", source: "stderr" }]);
    }
  };

  const handleStreamError = () => {
    if (!running) return;
    setStreamError(true);
    setTimeout(() => setStreamKey((k) => k + 1), 3000);
  };

  const handleStreamLoad = () => setStreamError(false);

  const stop = async () => {
    const res = await fetch("/api/pose-tracker/stop", { method: "POST" });
    await res.json();
    setRunning(false);
    setLogs((prev) => [...prev, { line: "Stopped.", source: "stdout" }]);
  };

  return (
    <div style={S.root}>
      <header style={S.header}>
        <Link to="/dashboard" className="live-back" style={S.backBtn} title="Back to dashboard">
          ← Back
        </Link>
        <Link to="/dashboard" style={S.logoLink}>
          <span style={S.logo}>GB</span>
        </Link>
        <div style={S.headerCenter}>
          <h1 style={S.title}>Live Session</h1>
          <div style={S.subtitle}>Pose tracker + workout data from your session</div>
        </div>
        <div style={S.controls}>
          {running ? (
            <button onClick={stop} style={{ ...S.btn, ...S.btnStop }}>
              Stop
            </button>
          ) : (
            <button onClick={start} style={{ ...S.btn, ...S.btnStart }}>
              Start
            </button>
          )}
        </div>
      </header>

      <div style={S.body}>
        <div style={S.trackerSection}>
          <div style={S.videoCard}>
            <div style={S.cardLabel}>Pose Tracker</div>
            {running ? (
              <>
                <img
                  key={streamKey}
                  src={`/api/pose-tracker/stream?t=${streamKey}`}
                  alt="Pose tracker feed"
                  style={S.video}
                  onError={handleStreamError}
                  onLoad={handleStreamLoad}
                />
                {streamError && (
                  <div style={S.connectingOverlay}>
                    Connecting to stream… (pose tracker may still be loading models)
                  </div>
                )}
              </>
            ) : (
              <div style={S.placeholder}>
                <span style={S.placeholderIcon}>📹</span>
                <span>Click Start to launch the pose tracker</span>
                <span style={S.placeholderHint}>Uses your webcam for form feedback</span>
              </div>
            )}
          </div>
          <div style={S.logsCard}>
            <div style={S.cardLabel}>Terminal Logs</div>
            <div style={S.logsContent}>
              {logs.length === 0 && <div style={S.logsEmpty}>Waiting for logs...</div>}
              {logs.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    ...S.logLine,
                    color: entry.source === "stderr" ? "#e8c468" : "#e0e0e0",
                  }}
                >
                  {entry.line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        <div style={S.dataSection}>
          <div style={S.dataCard}>
            <div style={S.cardLabel}>Session Summary</div>
            <SessionSummary logs={workoutLogs} />
          </div>
        </div>
      </div>

      <style>{globalCss}</style>
    </div>
  );
}

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
  a.live-back:hover { color: #e8c468; background: rgba(255,255,255,0.05); }
`;

const S: Record<string, React.CSSProperties> = {
  root: {
    height: "100vh",
    background: "#0a0a0a",
    color: "#f0ede6",
    fontFamily: "'DM Sans', sans-serif",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 1rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    gap: "0.75rem",
    background: "rgba(10,10,10,0.95)",
    backdropFilter: "blur(12px)",
    flexShrink: 0,
  },
  backBtn: {
    textDecoration: "none",
    color: "#888",
    fontSize: "0.82rem",
    padding: "0.35rem 0.5rem",
    borderRadius: "6px",
    transition: "color 0.15s, background 0.15s",
  },
  logoLink: { textDecoration: "none" },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.4rem",
    letterSpacing: "0.1em",
    color: "#e8c468",
  },
  headerCenter: { flex: 1 },
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.2rem",
    letterSpacing: "0.04em",
    margin: 0,
    color: "#f0ede6",
  },
  subtitle: { fontSize: "0.65rem", color: "#6b6760" },
  controls: { flexShrink: 0 },
  btn: {
    padding: "0.4rem 1rem",
    borderRadius: "8px",
    border: "none",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  btnStart: {
    background: "#e8c468",
    color: "#0a0a0a",
  },
  btnStop: {
    background: "rgba(255,69,58,0.2)",
    color: "#ff453a",
    border: "1px solid rgba(255,69,58,0.4)",
  },
  body: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1fr 420px",
    gap: "0.5rem",
    padding: "0.5rem",
    overflow: "hidden",
    minHeight: 0,
  },
  trackerSection: {
    display: "grid",
    gridTemplateColumns: "1fr 340px",
    gap: "0.5rem",
    overflow: "hidden",
    minHeight: 0,
  },
  videoCard: {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "0.6rem",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  logsCard: {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "0.6rem",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  cardLabel: {
    fontSize: "0.55rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#e8c468",
    opacity: 0.8,
    flexShrink: 0,
    marginBottom: "0.35rem",
  },
  video: {
    flex: 1,
    width: "100%",
    objectFit: "contain",
    background: "#000",
    borderRadius: "8px",
  },
  connectingOverlay: {
    position: "absolute",
    bottom: "1rem",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.8)",
    color: "#e8c468",
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    fontSize: "0.75rem",
  },
  placeholder: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    background: "rgba(0,0,0,0.3)",
    borderRadius: "8px",
    color: "#555",
    fontSize: "0.85rem",
  },
  placeholderIcon: { fontSize: "2.5rem" },
  placeholderHint: { fontSize: "0.7rem", opacity: 0.8 },
  logsContent: {
    flex: 1,
    overflow: "auto",
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.7rem",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  logsEmpty: { color: "#555", fontStyle: "italic" },
  logLine: {
    padding: "0.1rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  },
  dataSection: { overflow: "hidden", minHeight: 0 },
  dataCard: {
    height: "100%",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "0.6rem",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  dataContent: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  dataEmpty: {
    color: "#555",
    fontSize: "0.8rem",
    padding: "1rem",
    textAlign: "center",
  },
  summaryContent: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  },
  summaryCards: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "0.5rem",
  },
  summaryCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "0.65rem 0.5rem",
    textAlign: "center",
    minHeight: 56,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.15rem",
  },
  summaryCardWarning: {
    borderColor: "rgba(255,107,107,0.35)",
    background: "rgba(255,107,107,0.06)",
  },
  summaryValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.35rem",
    letterSpacing: "0.06em",
    color: "#e8c468",
    lineHeight: 1,
  },
  summaryValueWarning: {
    color: "#ff6b6b",
  },
  summaryLabel: {
    fontSize: "0.6rem",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    fontWeight: 500,
  },
  chartBlock: {
    background: "rgba(255,255,255,0.02)",
    borderRadius: "8px",
    padding: "0.4rem",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  chartTitle: {
    fontSize: "0.6rem",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "0.25rem",
  },
  chartWrap: { width: "100%", height: 110 },
  recentLabel: {
    fontSize: "0.6rem",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  recentList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
  logItem: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "8px",
    padding: "0.5rem 0.65rem",
  },
  logHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.25rem",
  },
  logExercise: { fontWeight: 600, fontSize: "0.82rem" },
  logDate: { fontSize: "0.65rem", color: "#555" },
  logStats: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem",
    fontSize: "0.72rem",
    color: "#888",
  },
  logScores: {
    fontSize: "0.65rem",
    color: "#666",
    marginTop: "0.2rem",
  },
};
