import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

interface LogEntry {
  line: string;
  source: "stdout" | "stderr";
}

export default function PoseTrackerPage() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streamKey, setStreamKey] = useState(0);
  const [streamError, setStreamError] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => logsEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    const es = new EventSource("/api/pose-tracker/logs");
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const { line, source } = JSON.parse(e.data) as LogEntry;
        setLogs((prev) => [...prev.slice(-500), { line, source }]);
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => es.close();
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
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
    setTimeout(() => {
      setStreamKey((k) => k + 1);
    }, 3000);
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
        <Link to="/dashboard" className="pose-back" style={S.backBtn} title="Back to dashboard">
          ← Back
        </Link>
        <Link to="/dashboard" style={S.logoLink}>
          <span style={S.logo}>GB</span>
        </Link>
        <div style={S.headerCenter}>
          <h1 style={S.title}>Pose Tracker</h1>
          <div style={S.subtitle}>Live webcam + voice coaching</div>
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
        <div style={S.videoSection}>
          <div style={S.videoCard}>
            <div style={S.cardLabel}>Live Feed</div>
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
        </div>

        <div style={S.logsSection}>
          <div style={S.logsCard}>
            <div style={S.cardLabel}>Terminal Logs</div>
            <div style={S.logsContent}>
              {logs.length === 0 && (
                <div style={S.logsEmpty}>Waiting for logs...</div>
              )}
              {logs.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    ...S.logLine,
                    color: entry.source === "stderr" ? "#ff6b6b" : "#e0e0e0",
                  }}
                >
                  {entry.line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
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
  a.pose-back:hover { color: #e8c468; background: rgba(255,255,255,0.05); }
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
    gridTemplateColumns: "1fr 400px",
    gap: "0.5rem",
    padding: "0.5rem",
    overflow: "hidden",
    minHeight: 0,
  },
  videoSection: { overflow: "hidden", minHeight: 0 },
  videoCard: {
    height: "100%",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "0.6rem",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
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
  logsSection: { overflow: "hidden", minHeight: 0 },
  logsCard: {
    height: "100%",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "0.6rem",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
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
};
