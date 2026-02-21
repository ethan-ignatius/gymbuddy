import { useState, useRef, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "today" | "history" | "log" | "consult";

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  weight?: number;
  done?: boolean[];
  formScore?: number;
}

interface WorkoutBlock {
  name: string;
  day: string;
  focus: string;
  exercises: Exercise[];
}

interface HistoryEntry {
  date: string;
  blockName: string;
  duration: string;
  formAvg: number;
  prs: number;
  notes?: string;
}

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  time: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const TODAY_WORKOUT: WorkoutBlock = {
  name: "Upper A",
  day: "Today",
  focus: "Strength & Size",
  exercises: [
    { name: "Bench Press", sets: 4, reps: "8-10", weight: 185, formScore: 91 },
    { name: "Barbell Row", sets: 4, reps: "8-10", weight: 155, formScore: 87 },
    { name: "Overhead Press", sets: 3, reps: "8-10", weight: 115, formScore: 94 },
    { name: "Lat Pulldown", sets: 3, reps: "10-12", weight: 130 },
    { name: "Bicep Curl", sets: 3, reps: "10-12", weight: 45 },
    { name: "Tricep Pushdown", sets: 3, reps: "10-12", weight: 60 },
  ],
};

const HISTORY: HistoryEntry[] = [
  { date: "Feb 19", blockName: "Lower A", duration: "58m", formAvg: 89, prs: 1, notes: "Left knee felt tight on squats" },
  { date: "Feb 17", blockName: "Upper B", duration: "62m", formAvg: 92, prs: 0 },
  { date: "Feb 14", blockName: "Lower B", duration: "55m", formAvg: 86, prs: 2 },
  { date: "Feb 12", blockName: "Upper A", duration: "61m", formAvg: 88, prs: 1 },
  { date: "Feb 10", blockName: "Lower A", duration: "49m", formAvg: 90, prs: 0, notes: "Shoulder felt off on OHP" },
];

const CONSISTENCY = [1,1,0,1,1,0,0,1,1,0,1,1,1,0,0,1,0,1,1,1,0,1,1,0,1,1,0,0];

const UPCOMING = [
  { day: "Mon Feb 24", name: "Lower A", time: "7:00 AM" },
  { day: "Wed Feb 26", name: "Upper B", time: "7:00 AM" },
  { day: "Fri Feb 28", name: "Lower B", time: "7:00 AM" },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  { role: "ai", text: "Hey! I'm watching your form and tracking your progress. Ask me about weights, substitutions, or anything else.", time: "now" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calc1RM(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30));
}

function scoreColor(score: number): string {
  if (score >= 90) return "#30d158";
  if (score >= 75) return "#e8c468";
  return "#ff453a";
}

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={scoreColor(score)} strokeWidth={3}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px`, fill: "#f0ede6", fontSize: "12px", fontWeight: 600 }}>
        {score}
      </text>
    </svg>
  );
}

// ─── Tab: Today's Workout ─────────────────────────────────────────────────────

function TodayTab() {
  const [completedSets, setCompletedSets] = useState<Record<string, boolean[]>>({});
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restActive, setRestActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRest = (secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestTimer(secs);
    setRestActive(true);
    timerRef.current = setInterval(() => {
      setRestTimer(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          setRestActive(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const toggleSet = (exIdx: number, setIdx: number) => {
    const key = String(exIdx);
    setCompletedSets(prev => {
      const curr = prev[key] ?? Array(TODAY_WORKOUT.exercises[exIdx].sets).fill(false);
      const next = [...curr];
      next[setIdx] = !next[setIdx];
      if (next[setIdx]) startRest(90);
      return { ...prev, [key]: next };
    });
  };

  const totalSets = TODAY_WORKOUT.exercises.reduce((a, e) => a + e.sets, 0);
  const doneSets = Object.values(completedSets).flat().filter(Boolean).length;
  const pct = totalSets > 0 ? doneSets / totalSets : 0;

  return (
    <div style={styles.tabContent}>
      {/* Header card */}
      <div style={styles.workoutHeader}>
        <div>
          <div style={styles.workoutTag}>{TODAY_WORKOUT.focus}</div>
          <h2 style={styles.workoutTitle}>{TODAY_WORKOUT.name}</h2>
          <div style={styles.workoutMeta}>{TODAY_WORKOUT.exercises.length} exercises · {totalSets} sets total</div>
        </div>
        <div style={styles.progressCircleWrap}>
          <ScoreRing score={Math.round(pct * 100)} size={64} />
          <div style={styles.progressLabel}>done</div>
        </div>
      </div>

      {/* Rest timer */}
      {restActive && restTimer !== null && (
        <div style={styles.restBanner}>
          <span style={styles.restIcon}>⏱</span>
          <span style={{ fontWeight: 600 }}>Rest</span>
          <span style={styles.restTime}>{restTimer}s</span>
          <button style={styles.restSkip} onClick={() => { clearInterval(timerRef.current!); setRestActive(false); setRestTimer(null); }}>
            Skip
          </button>
        </div>
      )}

      {/* Upcoming schedule */}
      <div style={styles.sectionHead}>Next sessions</div>
      <div style={styles.scheduleRow}>
        {UPCOMING.map((u, i) => (
          <div key={i} style={styles.scheduleCard}>
            <div style={styles.scheduleDay}>{u.day.split(" ")[0]}</div>
            <div style={styles.scheduleName}>{u.name}</div>
            <div style={styles.scheduleTime}>{u.time}</div>
          </div>
        ))}
      </div>

      {/* Exercise list */}
      <div style={styles.sectionHead}>Exercises</div>
      <div style={styles.exerciseList}>
        {TODAY_WORKOUT.exercises.map((ex, exIdx) => {
          const sets = completedSets[String(exIdx)] ?? Array(ex.sets).fill(false);
          const allDone = sets.every(Boolean);
          return (
            <div key={exIdx} style={{ ...styles.exCard, ...(allDone ? styles.exCardDone : {}) }}>
              <div style={styles.exTop}>
                <div style={styles.exInfo}>
                  <div style={styles.exName}>{ex.name}</div>
                  <div style={styles.exMeta}>
                    {ex.sets}×{ex.reps}
                    {ex.weight && <span style={styles.exWeight}> · {ex.weight} lbs</span>}
                    {ex.weight && <span style={styles.ex1rm}> · 1RM ≈ {calc1RM(ex.weight, parseInt(ex.reps))} lbs</span>}
                  </div>
                </div>
                <div style={styles.exRight}>
                  {ex.formScore && <ScoreRing score={ex.formScore} size={40} />}
                </div>
              </div>
              {/* Set bubbles */}
              <div style={styles.setBubbles}>
                {Array.from({ length: ex.sets }, (_, si) => (
                  <button
                    key={si}
                    onClick={() => toggleSet(exIdx, si)}
                    style={{
                      ...styles.setBubble,
                      ...(sets[si] ? styles.setBubbleDone : {}),
                    }}
                  >
                    {si + 1}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: History ─────────────────────────────────────────────────────────────

function HistoryTab() {
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  const avgForm = Math.round(HISTORY.reduce((a, h) => a + h.formAvg, 0) / HISTORY.length);
  const totalPRs = HISTORY.reduce((a, h) => a + h.prs, 0);

  return (
    <div style={styles.tabContent}>
      {/* Stats row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{HISTORY.length}</div>
          <div style={styles.statLabel}>Workouts</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: scoreColor(avgForm) }}>{avgForm}</div>
          <div style={styles.statLabel}>Avg form</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: "#e8c468" }}>{totalPRs}</div>
          <div style={styles.statLabel}>PRs set</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>4</div>
          <div style={styles.statLabel}>Wk streak</div>
        </div>
      </div>

      {/* Consistency heatmap */}
      <div style={styles.sectionHead}>Attendance (last 4 weeks)</div>
      <div style={styles.heatmapRow}>
        {CONSISTENCY.map((v, i) => (
          <div key={i} style={{ ...styles.heatCell, background: v ? "rgba(232,196,104,0.7)" : "rgba(255,255,255,0.06)" }} />
        ))}
      </div>

      {/* Log entries */}
      <div style={styles.sectionHead}>Session log</div>
      {HISTORY.map((h, i) => (
        <div key={i} style={{ ...styles.historyCard, ...(selected === h ? styles.historyCardSelected : {}) }}
          onClick={() => setSelected(selected === h ? null : h)}>
          <div style={styles.historyLeft}>
            <div style={styles.historyDate}>{h.date}</div>
            <div style={styles.historyBlock}>{h.blockName}</div>
            <div style={styles.historyMeta}>{h.duration} · {h.prs > 0 ? `${h.prs} PR${h.prs > 1 ? "s" : ""}` : "no PRs"}</div>
          </div>
          <div style={styles.historyRight}>
            <ScoreRing score={h.formAvg} size={44} />
          </div>
          {selected === h && h.notes && (
            <div style={styles.historyNote}>
              <span style={{ color: "#e8c468", marginRight: "0.4rem" }}>📋</span>
              {h.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Log ─────────────────────────────────────────────────────────────────

function LogTab() {
  const [selectedEx, setSelectedEx] = useState("Bench Press");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [note, setNote] = useState("");
  const [logged, setLogged] = useState<{ ex: string; weight: string; reps: string; note: string }[]>([]);
  const [injury, setInjury] = useState("");

  const exercises = ["Bench Press", "Squat", "Deadlift", "OHP", "Barbell Row", "Lat Pulldown", "Bicep Curl", "Tricep Pushdown"];

  const logSet = () => {
    if (!weight || !reps) return;
    setLogged(prev => [...prev, { ex: selectedEx, weight, reps, note }]);
    setNote("");
  };

  const oneRM = weight && reps ? calc1RM(Number(weight), Number(reps)) : null;

  return (
    <div style={styles.tabContent}>
      <div style={styles.sectionHead}>Log a set</div>

      {/* Exercise picker */}
      <div style={styles.exPicker}>
        {exercises.map(ex => (
          <button key={ex} onClick={() => setSelectedEx(ex)}
            style={{ ...styles.exPickerBtn, ...(selectedEx === ex ? styles.exPickerBtnActive : {}) }}>
            {ex}
          </button>
        ))}
      </div>

      {/* Weight / reps */}
      <div style={styles.logInputRow}>
        <div style={styles.logField}>
          <label style={styles.logLabel}>Weight (lbs)</label>
          <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
            placeholder="185" style={styles.logInput} />
        </div>
        <div style={styles.logField}>
          <label style={styles.logLabel}>Reps</label>
          <input type="number" value={reps} onChange={e => setReps(e.target.value)}
            placeholder="8" style={styles.logInput} />
        </div>
      </div>

      {oneRM && (
        <div style={styles.onermBadge}>
          Estimated 1RM: <strong style={{ color: "#e8c468" }}>{oneRM} lbs</strong>
        </div>
      )}

      <textarea value={note} onChange={e => setNote(e.target.value)}
        placeholder="Notes (optional — e.g. felt strong, left shoulder tight)"
        style={styles.noteArea} />

      <button onClick={logSet} style={styles.logBtn}>Log set →</button>

      {/* Injury log */}
      <div style={styles.sectionHead}>Flag an issue</div>
      <div style={styles.injuryRow}>
        <input value={injury} onChange={e => setInjury(e.target.value)}
          placeholder="e.g. left knee pain on squats"
          style={{ ...styles.logInput, flex: 1 }} />
        <button style={styles.injuryBtn} onClick={() => { if (injury) { setLogged(prev => [...prev, { ex: "⚠️ Flag", weight: "", reps: "", note: injury }]); setInjury(""); } }}>
          Flag
        </button>
      </div>

      {/* Recent logs */}
      {logged.length > 0 && (
        <>
          <div style={styles.sectionHead}>This session</div>
          {[...logged].reverse().map((l, i) => (
            <div key={i} style={styles.logEntry}>
              <span style={styles.logEntryEx}>{l.ex}</span>
              {l.weight && <span style={styles.logEntryMeta}>{l.weight} lbs × {l.reps}</span>}
              {l.note && <span style={styles.logEntryNote}>{l.note}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Tab: Consult AI ──────────────────────────────────────────────────────────

const AI_RESPONSES: Record<string, string> = {
  default: "Good question! Based on your recent sessions, I'd say focus on controlled reps. Want me to suggest a weight adjustment?",
  weight: "Based on your last session (185 lbs × 8), try 190 lbs today. Your form score was 91 — keep that elbow tuck on the way down.",
  knee: "Knee pain on squats? Switch to leg press or goblet squats today — same stimulus, lower joint stress. Ice for 15 min post-workout.",
  line: "Long line at the squat rack? Hit Romanian deadlifts with dumbbells instead — similar posterior chain focus, and free weights are usually available.",
  form: "Your bench form score has improved from 87 → 91 over 3 sessions. Main cue: keep the shoulder blades retracted throughout the set.",
  rest: "Your avg rest time is 72s — for strength goals, aim for 90-120s. It'll help you hit your rep targets with better quality.",
};

function getAIResponse(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("weight") || lower.includes("heavy") || lower.includes("lbs")) return AI_RESPONSES.weight;
  if (lower.includes("knee") || lower.includes("shoulder") || lower.includes("hurt") || lower.includes("pain")) return AI_RESPONSES.knee;
  if (lower.includes("line") || lower.includes("crowded") || lower.includes("busy") || lower.includes("wait")) return AI_RESPONSES.line;
  if (lower.includes("form") || lower.includes("score") || lower.includes("technique")) return AI_RESPONSES.form;
  if (lower.includes("rest") || lower.includes("timer") || lower.includes("break")) return AI_RESPONSES.rest;
  return AI_RESPONSES.default;
}

function ConsultTab() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages(prev => [...prev, { role: "user", text, time }]);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMessages(prev => [...prev, { role: "ai", text: getAIResponse(text), time }]);
    }, 900 + Math.random() * 600);
  };

  const QUICK = ["What weight should I use?", "My knee hurts", "Line at the rack", "How's my form?"];

  return (
    <div style={styles.consultWrap}>
      <div style={styles.chatMessages}>
        {messages.map((m, i) => (
          <div key={i} style={{ ...styles.chatRow, ...(m.role === "user" ? styles.chatRowUser : {}) }}>
            {m.role === "ai" && <div style={styles.chatAvatar}>GB</div>}
            <div style={{ ...styles.chatBubble, ...(m.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAI) }}>
              {m.text}
              <div style={styles.chatTime}>{m.time}</div>
            </div>
          </div>
        ))}
        {thinking && (
          <div style={styles.chatRow}>
            <div style={styles.chatAvatar}>GB</div>
            <div style={{ ...styles.chatBubble, ...styles.chatBubbleAI }}>
              <span style={styles.dots}><span /><span /><span /></span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div style={styles.quickRow}>
        {QUICK.map(q => (
          <button key={q} style={styles.quickBtn} onClick={() => { setInput(q); }}>
            {q}
          </button>
        ))}
      </div>

      <div style={styles.chatInputRow}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask your coach anything..."
          style={styles.chatInput}
        />
        <button onClick={send} style={styles.chatSend} disabled={!input.trim()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      <style>{dotsCss}</style>
    </div>
  );
}

const dotsCss = `
  @keyframes dotBlink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
  .dots span { display:inline-block; width:7px; height:7px; border-radius:50%; background:#888; animation: dotBlink 1.4s infinite; margin: 0 2px; }
  .dots span:nth-child(2){animation-delay:.2s} .dots span:nth-child(3){animation-delay:.4s}
`;

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "⚡" },
  { id: "history", label: "History", icon: "📊" },
  { id: "log", label: "Log", icon: "✏️" },
  { id: "consult", label: "Coach", icon: "💬" },
];

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("today");

  return (
    <div style={styles.root}>
      {/* Subtle background */}
      <div style={styles.bg} />

      {/* Top nav */}
      <header style={styles.header}>
        <a href="/" style={styles.logoLink}>
          <span style={styles.logo}>GB</span>
        </a>
        <div style={styles.headerCenter}>
          <div style={styles.headerUser}>Marcus R.</div>
          <div style={styles.headerSub}>Upper A · Week 6</div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.streakBadge}>🔥 4</div>
        </div>
      </header>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...styles.tabBtn, ...(tab === t.id ? styles.tabBtnActive : {}) }}>
            <span style={styles.tabIcon}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {tab === "today" && <TodayTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "log" && <LogTab />}
        {tab === "consult" && <ConsultTab />}
      </div>

      <style>{globalCss}</style>
    </div>
  );
}

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
  input::placeholder { color: #3a3a3a; }
  textarea::placeholder { color: #3a3a3a; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
`;

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#f0ede6",
    fontFamily: "'DM Sans', sans-serif",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  bg: {
    position: "fixed",
    inset: 0,
    background: "radial-gradient(ellipse 60% 40% at 70% 20%, rgba(232,196,104,0.04) 0%, transparent 60%)",
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "1rem 1.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 10,
    gap: "1rem",
  },
  logoLink: { textDecoration: "none" },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.4rem",
    letterSpacing: "0.1em",
    color: "#e8c468",
  },
  headerCenter: { flex: 1 },
  headerUser: { fontWeight: 600, fontSize: "0.95rem" },
  headerSub: { fontSize: "0.72rem", color: "#6b6760" },
  headerRight: { display: "flex", alignItems: "center", gap: "0.5rem" },
  streakBadge: {
    background: "rgba(232,196,104,0.12)",
    border: "1px solid rgba(232,196,104,0.25)",
    borderRadius: "20px",
    padding: "0.25rem 0.7rem",
    fontSize: "0.78rem",
    color: "#e8c468",
    fontWeight: 600,
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 10,
    background: "#0a0a0a",
  },
  tabBtn: {
    flex: 1,
    padding: "0.75rem 0.5rem",
    background: "none",
    border: "none",
    color: "#555",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.2rem",
    fontSize: "0.72rem",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
    letterSpacing: "0.03em",
    transition: "color 0.15s",
    borderBottom: "2px solid transparent",
  },
  tabBtnActive: {
    color: "#e8c468",
    borderBottomColor: "#e8c468",
  },
  tabIcon: { fontSize: "1.1rem" },
  content: {
    flex: 1,
    overflow: "auto",
    position: "relative",
    zIndex: 5,
  },

  // ── Shared ──
  tabContent: {
    padding: "1.25rem 1.25rem 4rem",
    maxWidth: "720px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    animation: "fadeUp 0.3s ease",
  },
  sectionHead: {
    fontSize: "0.62rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#e8c468",
    opacity: 0.75,
    marginTop: "0.5rem",
  },

  // ── Today tab ──
  workoutHeader: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "16px",
    padding: "1.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  workoutTag: {
    fontSize: "0.65rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#e8c468",
    marginBottom: "0.3rem",
  },
  workoutTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "2rem",
    letterSpacing: "0.04em",
    color: "#f0ede6",
    margin: "0 0 0.2rem",
  },
  workoutMeta: { fontSize: "0.8rem", color: "#555" },
  progressCircleWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" },
  progressLabel: { fontSize: "0.6rem", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" },

  restBanner: {
    background: "rgba(232,196,104,0.08)",
    border: "1px solid rgba(232,196,104,0.25)",
    borderRadius: "10px",
    padding: "0.7rem 1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    fontSize: "0.9rem",
  },
  restIcon: { fontSize: "1rem" },
  restTime: { color: "#e8c468", fontWeight: 700, fontSize: "1.1rem", flex: 1 },
  restSkip: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#888",
    borderRadius: "6px",
    padding: "0.25rem 0.6rem",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontFamily: "'DM Sans', sans-serif",
  },

  scheduleRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" },
  scheduleCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "10px",
    padding: "0.75rem",
  },
  scheduleDay: { fontSize: "0.65rem", color: "#555", marginBottom: "0.2rem" },
  scheduleName: { fontSize: "0.85rem", fontWeight: 600, color: "#f0ede6", marginBottom: "0.15rem" },
  scheduleTime: { fontSize: "0.7rem", color: "#e8c468" },

  exerciseList: { display: "flex", flexDirection: "column", gap: "0.6rem" },
  exCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "1rem",
    transition: "border-color 0.2s",
  },
  exCardDone: {
    borderColor: "rgba(48,209,88,0.25)",
    background: "rgba(48,209,88,0.03)",
  },
  exTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" },
  exInfo: { flex: 1 },
  exName: { fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.25rem" },
  exMeta: { fontSize: "0.78rem", color: "#888" },
  exWeight: { color: "#f0ede6" },
  ex1rm: { color: "#555" },
  exRight: { marginLeft: "0.75rem" },
  setBubbles: { display: "flex", gap: "0.4rem", flexWrap: "wrap" },
  setBubble: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#888",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  setBubbleDone: {
    background: "rgba(48,209,88,0.15)",
    border: "1px solid rgba(48,209,88,0.4)",
    color: "#30d158",
  },

  // ── History tab ──
  statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem" },
  statCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "10px",
    padding: "0.75rem 0.5rem",
    textAlign: "center",
  },
  statValue: { fontSize: "1.5rem", fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" },
  statLabel: { fontSize: "0.62rem", color: "#555", marginTop: "0.15rem", textTransform: "uppercase", letterSpacing: "0.06em" },

  heatmapRow: { display: "flex", gap: "4px", flexWrap: "wrap" },
  heatCell: { width: "20px", height: "20px", borderRadius: "4px" },

  historyCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "1rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    transition: "border-color 0.15s",
  },
  historyCardSelected: {
    borderColor: "rgba(232,196,104,0.3)",
    background: "rgba(232,196,104,0.03)",
  },
  historyLeft: { flex: 1 },
  historyDate: { fontSize: "0.65rem", color: "#555", marginBottom: "0.2rem" },
  historyBlock: { fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.2rem" },
  historyMeta: { fontSize: "0.75rem", color: "#888" },
  historyRight: { marginLeft: "1rem" },
  historyNote: {
    width: "100%",
    marginTop: "0.75rem",
    paddingTop: "0.75rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    fontSize: "0.82rem",
    color: "#888",
    lineHeight: 1.4,
  },

  // ── Log tab ──
  exPicker: { display: "flex", gap: "0.4rem", flexWrap: "wrap" },
  exPickerBtn: {
    padding: "0.35rem 0.7rem",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    color: "#888",
    fontSize: "0.78rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  exPickerBtnActive: {
    background: "rgba(232,196,104,0.1)",
    border: "1px solid rgba(232,196,104,0.4)",
    color: "#e8c468",
  },
  logInputRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
  logField: { display: "flex", flexDirection: "column", gap: "0.3rem" },
  logLabel: { fontSize: "0.72rem", color: "#555", letterSpacing: "0.04em" },
  logInput: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "0.6rem 0.8rem",
    color: "#f0ede6",
    fontSize: "0.9rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
  },
  onermBadge: {
    background: "rgba(232,196,104,0.06)",
    border: "1px solid rgba(232,196,104,0.2)",
    borderRadius: "8px",
    padding: "0.5rem 0.8rem",
    fontSize: "0.82rem",
    color: "#888",
  },
  noteArea: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "0.6rem 0.8rem",
    color: "#f0ede6",
    fontSize: "0.85rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    resize: "none",
    height: "72px",
    width: "100%",
  },
  logBtn: {
    background: "#e8c468",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "8px",
    padding: "0.75rem 1.5rem",
    fontWeight: 700,
    fontSize: "0.9rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    alignSelf: "flex-start",
  },
  injuryRow: { display: "flex", gap: "0.5rem" },
  injuryBtn: {
    background: "rgba(255,69,58,0.1)",
    border: "1px solid rgba(255,69,58,0.3)",
    color: "#ff453a",
    borderRadius: "8px",
    padding: "0.6rem 1rem",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
  },
  logEntry: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "8px",
    padding: "0.65rem 0.85rem",
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    flexWrap: "wrap",
    animation: "fadeUp 0.25s ease",
  },
  logEntryEx: { fontWeight: 600, fontSize: "0.85rem" },
  logEntryMeta: { fontSize: "0.78rem", color: "#e8c468", marginLeft: "auto" },
  logEntryNote: { width: "100%", fontSize: "0.75rem", color: "#555" },

  // ── Consult tab ──
  consultWrap: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 120px)",
    position: "relative",
  },
  chatMessages: {
    flex: 1,
    overflow: "auto",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  chatRow: {
    display: "flex",
    gap: "0.6rem",
    alignItems: "flex-end",
    animation: "fadeUp 0.25s ease",
  },
  chatRowUser: { flexDirection: "row-reverse" },
  chatAvatar: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "rgba(232,196,104,0.15)",
    border: "1px solid rgba(232,196,104,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.6rem",
    fontWeight: 700,
    color: "#e8c468",
    flexShrink: 0,
    fontFamily: "'Bebas Neue', sans-serif",
    letterSpacing: "0.05em",
  },
  chatBubble: {
    maxWidth: "72%",
    padding: "0.65rem 0.85rem",
    borderRadius: "14px",
    fontSize: "0.88rem",
    lineHeight: 1.4,
  },
  chatBubbleAI: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#f0ede6",
    borderBottomLeftRadius: "4px",
  },
  chatBubbleUser: {
    background: "#e8c468",
    color: "#0a0a0a",
    borderBottomRightRadius: "4px",
  },
  chatTime: { fontSize: "0.6rem", opacity: 0.5, marginTop: "0.25rem" },
  dots: { display: "inline-flex", alignItems: "center" },

  quickRow: {
    display: "flex",
    gap: "0.4rem",
    padding: "0.5rem 1.25rem",
    flexWrap: "wrap",
    borderTop: "1px solid rgba(255,255,255,0.05)",
  },
  quickBtn: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#888",
    borderRadius: "20px",
    padding: "0.3rem 0.7rem",
    fontSize: "0.72rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  chatInputRow: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.75rem 1.25rem 1.25rem",
    borderTop: "1px solid rgba(255,255,255,0.05)",
  },
  chatInput: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "22px",
    padding: "0.6rem 1rem",
    color: "#f0ede6",
    fontSize: "0.9rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
  },
  chatSend: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: "#e8c468",
    border: "none",
    color: "#0a0a0a",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
