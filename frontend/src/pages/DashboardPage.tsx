import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  exercises?: { name: string; detail: string }[];
}

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  time: string;
  citations?: Array<{ source: string; page: number | null }>;
  ragSource?: string;
  usedRag?: boolean;
}

interface LiveWorkoutProgress {
  percent: number;
  doneSets: number;
  totalSets: number;
  exercises: Array<{ name: string; detail: string }>;
}

interface DashboardApiData {
  user: {
    id: string;
    email: string;
    goal: "lose_fat" | "strength_and_size" | "strength_without_size";
    heightCm: number;
    weightKg: number;
    gymTravelMin: number;
    preferredDays: string | null;
    preferredTime: string | null;
    onboardingStep: string;
  };
  plan: {
    daysPerWeek: number;
    blocks: Array<{
      name: string;
      focus: string;
      exercises: Array<{ name: string; sets: number; reps: string }>;
    }>;
  };
  todayWorkout: {
    name: string;
    day: string;
    focus: string;
    exercises: Array<{ name: string; sets: number; reps: string }>;
  } | null;
  upcoming: Array<{
    id: string;
    name: string;
    day: string;
    date: string;
    time: string;
    status: string;
  }>;
  history: Array<{
    id: string;
    date: string;
    blockName: string;
    durationMin: number;
    status: string;
    formAvg: number;
    prs: number;
    notes: string | null;
    exercises: Array<{ name: string; detail: string }>;
  }>;
  attendance: { last28: number[] };
  recentPRs: Array<{ exercise: string; weight: number | null; date: string }>;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

type PlanType = "strength" | "hypertrophy" | "custom";

const STRENGTH_DAYS: WorkoutBlock[] = [
  {
    name: "Heavy Upper", day: "Day A", focus: "Strength",
    exercises: [
      { name: "Barbell Bench Press", sets: 5, reps: "3", weight: 225 },
      { name: "Pendlay Row", sets: 5, reps: "5", weight: 185 },
      { name: "Overhead Press", sets: 5, reps: "3", weight: 135 },
      { name: "Weighted Pull-up", sets: 4, reps: "5", weight: 45 },
      { name: "Barbell Curl", sets: 3, reps: "5", weight: 80 },
    ],
  },
  {
    name: "Heavy Lower", day: "Day B", focus: "Strength",
    exercises: [
      { name: "Back Squat", sets: 5, reps: "3", weight: 315 },
      { name: "Deadlift", sets: 5, reps: "3", weight: 365 },
      { name: "Front Squat", sets: 3, reps: "5", weight: 205 },
      { name: "Barbell Lunge", sets: 3, reps: "5", weight: 135 },
      { name: "Calf Raise", sets: 4, reps: "8", weight: 225 },
    ],
  },
  {
    name: "Power Day", day: "Day C", focus: "Strength",
    exercises: [
      { name: "Incline Bench", sets: 5, reps: "5", weight: 185 },
      { name: "Barbell Row", sets: 5, reps: "5", weight: 175 },
      { name: "Back Squat", sets: 5, reps: "5", weight: 275 },
      { name: "Close-Grip Bench", sets: 3, reps: "5", weight: 165 },
      { name: "Weighted Dip", sets: 3, reps: "5", weight: 45 },
    ],
  },
];

const HYPERTROPHY_DAYS: WorkoutBlock[] = [
  {
    name: "Push", day: "Day A", focus: "PPL",
    exercises: [
      { name: "Bench Press", sets: 4, reps: "8-10", weight: 185 },
      { name: "Incline DB Press", sets: 4, reps: "10-12", weight: 65 },
      { name: "Overhead Press", sets: 3, reps: "10-12", weight: 95 },
      { name: "Lateral Raise", sets: 3, reps: "12-15", weight: 20 },
      { name: "Tricep Pushdown", sets: 3, reps: "12", weight: 55 },
      { name: "Overhead Extension", sets: 3, reps: "12", weight: 50 },
    ],
  },
  {
    name: "Pull", day: "Day B", focus: "PPL",
    exercises: [
      { name: "Barbell Row", sets: 4, reps: "8-10", weight: 155 },
      { name: "Lat Pulldown", sets: 3, reps: "10-12", weight: 130 },
      { name: "Cable Row", sets: 3, reps: "10-12", weight: 120 },
      { name: "Face Pull", sets: 3, reps: "15", weight: 40 },
      { name: "Bicep Curl", sets: 3, reps: "12", weight: 35 },
      { name: "Hammer Curl", sets: 3, reps: "12", weight: 30 },
    ],
  },
  {
    name: "Legs", day: "Day C", focus: "PPL",
    exercises: [
      { name: "Back Squat", sets: 4, reps: "8-10", weight: 225 },
      { name: "Romanian Deadlift", sets: 3, reps: "10-12", weight: 185 },
      { name: "Leg Press", sets: 3, reps: "12", weight: 360 },
      { name: "Leg Curl", sets: 3, reps: "12", weight: 90 },
      { name: "Calf Raise", sets: 4, reps: "15", weight: 180 },
    ],
  },
];

function getTodayWorkout(plan: PlanType, customExercises: Exercise[]): WorkoutBlock {
  const dayIndex = new Date().getDay() % 3; // cycle A/B/C
  if (plan === "strength") return STRENGTH_DAYS[dayIndex];
  if (plan === "hypertrophy") return HYPERTROPHY_DAYS[dayIndex];
  return {
    name: "My Workout",
    day: "Today",
    focus: "Custom",
    exercises: customExercises,
  };
}

const HISTORY: HistoryEntry[] = [
  {
    date: "Feb 19", blockName: "Lower A", duration: "58m", formAvg: 89, prs: 1, notes: "Left knee felt tight on squats",
    exercises: [{ name: "Back Squat", detail: "5×3 @ 305 lbs" }, { name: "Deadlift", detail: "5×3 @ 355 lbs" }, { name: "Front Squat", detail: "3×5 @ 195 lbs" }, { name: "Lunges", detail: "3×5 @ 135 lbs" }]
  },
  {
    date: "Feb 17", blockName: "Upper B", duration: "62m", formAvg: 92, prs: 0,
    exercises: [{ name: "Incline DB Press", detail: "4×10 @ 65 lbs" }, { name: "Cable Row", detail: "4×10 @ 120 lbs" }, { name: "Lateral Raise", detail: "3×12 @ 20 lbs" }, { name: "Face Pull", detail: "3×15 @ 40 lbs" }]
  },
  {
    date: "Feb 14", blockName: "Lower B", duration: "55m", formAvg: 86, prs: 2,
    exercises: [{ name: "Back Squat", detail: "4×8 @ 225 lbs 🏆" }, { name: "RDL", detail: "3×10 @ 185 lbs" }, { name: "Leg Press", detail: "3×12 @ 370 lbs 🏆" }, { name: "Calf Raise", detail: "4×15 @ 180 lbs" }]
  },
  {
    date: "Feb 12", blockName: "Upper A", duration: "61m", formAvg: 88, prs: 1,
    exercises: [{ name: "Bench Press", detail: "4×8 @ 185 lbs" }, { name: "Barbell Row", detail: "4×10 @ 155 lbs" }, { name: "OHP", detail: "3×10 @ 95 lbs 🏆" }, { name: "Lat Pulldown", detail: "3×10 @ 130 lbs" }]
  },
  {
    date: "Feb 10", blockName: "Lower A", duration: "49m", formAvg: 90, prs: 0,
    exercises: [{ name: "Back Squat", detail: "5×3 @ 295 lbs" }, { name: "Deadlift", detail: "5×3 @ 345 lbs" }, { name: "Front Squat", detail: "3×5 @ 185 lbs" }]
  },
  {
    date: "Feb 7", blockName: "Upper B", duration: "57m", formAvg: 84, prs: 0,
    exercises: [{ name: "Incline DB Press", detail: "4×10 @ 60 lbs" }, { name: "Cable Row", detail: "4×10 @ 115 lbs" }, { name: "Lateral Raise", detail: "3×12 @ 20 lbs" }]
  },
  {
    date: "Feb 5", blockName: "Lower B", duration: "53m", formAvg: 91, prs: 1,
    exercises: [{ name: "Back Squat", detail: "4×8 @ 215 lbs" }, { name: "RDL", detail: "3×10 @ 175 lbs 🏆" }, { name: "Leg Press", detail: "3×12 @ 360 lbs" }]
  },
  {
    date: "Feb 3", blockName: "Upper A", duration: "60m", formAvg: 87, prs: 0,
    exercises: [{ name: "Bench Press", detail: "4×8 @ 180 lbs" }, { name: "Barbell Row", detail: "4×10 @ 150 lbs" }, { name: "OHP", detail: "3×10 @ 90 lbs" }]
  },
];

// Map history dates to a calendar lookup
const HISTORY_BY_DATE: Record<string, HistoryEntry> = {};
HISTORY.forEach((h) => { HISTORY_BY_DATE[h.date] = h; });

function getUpcoming(
  plan: PlanType,
  planBlocks?: Array<{ name: string; exercises: Exercise[] }>,
  count = 12,
) {
  const fallbackBlocks =
    plan === "strength"
      ? STRENGTH_DAYS.map((d) => ({ name: d.name, exercises: d.exercises }))
      : HYPERTROPHY_DAYS.map((d) => ({ name: d.name, exercises: d.exercises }));
  const blocks = (planBlocks && planBlocks.length > 0 ? planBlocks : fallbackBlocks).map((b) => b.name);
  const results: Array<{ day: string; date: string; name: string; time: string }> = [];
  const allowedWeekdays =
    plan === "strength" ? new Set([1, 3, 5]) : new Set([1, 2, 3, 4, 5, 6]); // Mon/Wed/Fri vs Mon-Sat

  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let blockIdx = 0;
  let guard = 0;

  while (results.length < count && guard < 120) {
    guard += 1;
    const wd = cursor.getDay();
    if (allowedWeekdays.has(wd)) {
      results.push({
        day: cursor.toLocaleDateString("en-US", { weekday: "short" }),
        date: cursor.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
        name: blocks[blockIdx % blocks.length] ?? "Workout",
        time: plan === "strength" ? "7:00 AM" : wd === 6 ? "8:00 AM" : "7:00 AM",
      });
      blockIdx += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { role: "ai", text: "Hey! I'm watching your form and tracking your progress. Ask me about weights, substitutions, or anything.", time: "now" },
];

function goalToPlanType(goal?: string): PlanType {
  if (goal === "strength_without_size") return "strength";
  if (goal === "strength_and_size") return "hypertrophy";
  if (goal === "lose_fat") return "hypertrophy";
  return "strength";
}

function mapApiWorkoutToBlock(
  apiWorkout: DashboardApiData["todayWorkout"] | null
): WorkoutBlock | null {
  if (!apiWorkout) return null;
  return {
    name: apiWorkout.name,
    day: apiWorkout.day,
    focus: apiWorkout.focus,
    exercises: apiWorkout.exercises.map((e) => ({
      name: e.name,
      sets: e.sets,
      reps: e.reps,
    })),
  };
}

function formatShortDate(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumericDate(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function formatHeaderName(email?: string): string {
  if (!email) return "GymBuddy User";
  const base = email.split("@")[0] || email;
  const parts = base.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0][0].toUpperCase() + parts[0].slice(1);
    const lastInitial = parts[1][0].toUpperCase();
    return `${first} ${lastInitial}.`;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function computeStreak(days: number[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (!days[i]) break;
    streak++;
  }
  return streak;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calc1RM(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30));
}

function scoreColor(score: number): string {
  if (score >= 90) return "#30d158";
  if (score >= 75) return "#e8c468";
  return "#ff453a";
}

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
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
      <text
        x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px`, fill: "#f0ede6", fontSize: "11px", fontWeight: 600 }}
      >
        {score}
      </text>
    </svg>
  );
}

// ─── AI Chat Responses ────────────────────────────────────────────────────────

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

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, style, label }: { children: React.ReactNode; style?: React.CSSProperties; label?: string }) {
  return (
    <div style={{ ...S.card, ...style }}>
      {label && <div style={S.cardLabel}>{label}</div>}
      {children}
    </div>
  );
}

// ─── Panel: Today's Workout ───────────────────────────────────────────────────

function WorkoutPanel({
  workout,
  onCompletionChange,
  onProgressChange,
}: {
  workout: WorkoutBlock;
  onCompletionChange?: (isComplete: boolean) => void;
  onProgressChange?: (progress: LiveWorkoutProgress) => void;
}) {
  const [completedSets, setCompletedSets] = useState<Record<string, boolean[]>>({});
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restActive, setRestActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCompletedSets({});
    if (timerRef.current) clearInterval(timerRef.current);
    setRestTimer(null);
    setRestActive(false);
  }, [workout.name, workout.day, workout.exercises.length]);

  const startRest = (secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestTimer(secs);
    setRestActive(true);
    timerRef.current = setInterval(() => {
      setRestTimer((prev) => {
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
    setCompletedSets((prev) => {
      const curr = prev[key] ?? Array(workout.exercises[exIdx].sets).fill(false);
      const next = [...curr];
      next[setIdx] = !next[setIdx];
      if (next[setIdx]) startRest(90);
      return { ...prev, [key]: next };
    });
  };

  const totalSets = workout.exercises.reduce((a, e) => a + e.sets, 0);
  const doneSets = Object.values(completedSets).flat().filter(Boolean).length;
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const isWorkoutComplete = totalSets > 0 && doneSets === totalSets;

  useEffect(() => {
    onCompletionChange?.(isWorkoutComplete);
  }, [isWorkoutComplete, onCompletionChange]);

  useEffect(() => {
    const exercises = workout.exercises.map((ex, exIdx) => {
      const sets = completedSets[String(exIdx)] ?? Array(ex.sets).fill(false);
      const done = sets.filter(Boolean).length;
      return {
        name: ex.name,
        detail: `${done}/${ex.sets} sets done · target ${ex.sets}×${ex.reps}`,
      };
    });
    onProgressChange?.({
      percent: pct,
      doneSets,
      totalSets,
      exercises,
    });
  }, [completedSets, workout, pct, doneSets, totalSets, onProgressChange]);

  if (workout.exercises.length === 0) {
    return (
      <Card label="Today's Workout">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "0.5rem", color: "#555" }}>
          <span style={{ fontSize: "1.5rem" }}>🏋️</span>
          <span style={{ fontSize: "0.82rem" }}>No exercises yet — add some below</span>
        </div>
      </Card>
    );
  }

  return (
    <Card label="Today's Workout">
      {/* Header row */}
      <div style={S.workoutHeader}>
        <div>
          <div style={S.workoutTag}>{workout.focus}</div>
          <h2 style={S.workoutTitle}>{workout.name}</h2>
          <div style={S.workoutMeta}>{workout.exercises.length} exercises · {totalSets} sets total</div>
        </div>
        <div style={S.progressWrap}>
          <ScoreRing score={pct} size={56} />
          <div style={S.progressLbl}>done</div>
        </div>
      </div>

      {/* Rest timer */}
      {restActive && restTimer !== null && (
        <div style={S.restBanner}>
          <span>⏱</span>
          <span style={{ fontWeight: 600 }}>Rest</span>
          <span style={S.restTime}>{restTimer}s</span>
          <button
            style={S.restSkip}
            onClick={() => { clearInterval(timerRef.current!); setRestActive(false); setRestTimer(null); }}
          >
            Skip
          </button>
        </div>
      )}

      {/* Exercise list */}
      <div style={S.exerciseList}>
        {workout.exercises.map((ex, exIdx) => {
          const sets = completedSets[String(exIdx)] ?? Array(ex.sets).fill(false);
          const allDone = sets.every(Boolean);
          return (
            <div key={exIdx} style={{ ...S.exRow, ...(allDone ? S.exRowDone : {}) }}>
              <div style={S.exInfo}>
                <div style={S.exName}>{ex.name}</div>
                <div style={S.exMeta}>
                  {ex.sets}×{ex.reps}
                  {ex.weight && <span style={{ color: "#f0ede6" }}> · {ex.weight} lbs</span>}
                  {ex.weight && <span style={{ color: "#555" }}> · 1RM ≈ {calc1RM(ex.weight, parseInt(ex.reps))} lbs</span>}
                </div>
              </div>
              {ex.formScore && <ScoreRing score={ex.formScore} size={36} />}
              <div style={S.setBubbles}>
                {Array.from({ length: ex.sets }, (_, si) => (
                  <button
                    key={si}
                    onClick={() => toggleSet(exIdx, si)}
                    style={{ ...S.setBubble, ...(sets[si] ? S.setBubbleDone : {}) }}
                  >
                    {si + 1}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Custom Workout Builder ───────────────────────────────────────────────────

function CustomBuilderPanel({ exercises, onChange }: { exercises: Exercise[]; onChange: (exs: Exercise[]) => void }) {
  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  const addExercise = () => {
    if (!name || !sets || !reps) return;
    onChange([...exercises, { name, sets: Number(sets), reps, weight: weight ? Number(weight) : undefined }]);
    setName(""); setSets(""); setReps(""); setWeight("");
  };

  const removeExercise = (idx: number) => {
    onChange(exercises.filter((_, i) => i !== idx));
  };

  return (
    <Card label="Build Your Workout">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Exercise name"
          style={{ ...S.logInput, width: "100%" }}
        />
        <div style={{ display: "flex", gap: "0.3rem" }}>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            value={sets}
            onChange={(e) => setSets(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Sets"
            style={{ ...S.logInput, flex: 1, textAlign: "center" }}
          />
          <input
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="Reps"
            style={{ ...S.logInput, flex: 1, textAlign: "center" }}
          />
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="lbs"
            style={{ ...S.logInput, flex: 1, textAlign: "center" }}
          />
          <button onClick={addExercise} style={S.logBtn}>+</button>
        </div>
      </div>
      {exercises.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, overflow: "auto", minHeight: 0 }}>
          {exercises.map((ex, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{ex.name}</span>
              <span style={{ color: "#e8c468" }}>{ex.sets}×{ex.reps}{ex.weight ? ` · ${ex.weight}lbs` : ""}</span>
              <button onClick={() => removeExercise(i)} style={{ background: "none", border: "none", color: "#ff453a", cursor: "pointer", fontSize: "0.82rem", padding: "0 0.2rem" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Panel: PR Tracker ────────────────────────────────────────────────────────

const RECENT_PRS = [
  { exercise: "Back Squat", weight: 225, date: "Feb 14" },
  { exercise: "Leg Press", weight: 370, date: "Feb 14" },
  { exercise: "OHP", weight: 95, date: "Feb 12" },
  { exercise: "RDL", weight: 175, date: "Feb 5" },
];

function PRTrackerPanel({ prs }: { prs?: Array<{ exercise: string; weight: number | null; date: string }> }) {
  const items = prs ?? RECENT_PRS;
  return (
    <Card label="Personal Records">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", overflow: "auto", flex: 1, minHeight: 0 }}>
        {items.length === 0 && (
          <div style={{ fontSize: "0.7rem", color: "#555", padding: "0.25rem 0.1rem" }}>
            No PRs logged yet.
          </div>
        )}
        {items.map((pr, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.35rem", background: "rgba(232,196,104,0.06)", borderRadius: "6px", padding: "0.25rem 0.4rem" }}>
            <span style={{ fontSize: "0.7rem" }}>🏆</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 600 }}>{pr.exercise}</div>
              <div style={{ fontSize: "0.55rem", color: "#555" }}>{pr.date}</div>
            </div>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "0.95rem", color: "#e8c468" }}>
              {pr.weight ?? "--"}
              <span style={{ fontSize: "0.55rem", color: "#555" }}>{pr.weight != null ? " lbs" : ""}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Panel: Upcoming (Calendar-synced) ────────────────────────────────────────

function UpcomingPanel({
  plan,
  upcomingData,
  planBlocks,
}: {
  plan: PlanType;
  upcomingData?: Array<{ day: string; date: string; name: string; time: string }>;
  planBlocks?: Array<{ name: string; exercises: Exercise[] }>;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const realUpcoming = upcomingData ?? [];
  const projectedUpcoming = getUpcoming(plan, planBlocks, 14);
  const seen = new Set(realUpcoming.map((u) => `${u.date}|${u.name}|${u.time}`));
  const filler = projectedUpcoming.filter((u) => {
    const key = `${u.date}|${u.name}|${u.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const upcoming = [...realUpcoming, ...filler].slice(0, 12);
  // Map upcoming names to preset exercises for preview
  const getPreview = (name: string) => {
    const all = planBlocks && planBlocks.length > 0 ? planBlocks : [...STRENGTH_DAYS, ...HYPERTROPHY_DAYS];
    const match = all.find((d) => d.name === name);
    return match?.exercises ?? [];
  };

  return (
    <Card label="Upcoming">
      <div style={{ ...S.upcomingList, overflow: "auto" }}>
        {upcoming.length === 0 && (
          <div style={{ fontSize: "0.7rem", color: "#555", padding: "0.35rem 0.4rem" }}>
            No upcoming workouts scheduled yet.
          </div>
        )}
        {upcoming.map((u, i) => (
          <div key={i}>
            <div
              style={{ ...S.upcomingItem, cursor: "pointer" }}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span style={{ fontSize: "0.7rem" }}>📅</span>
              <div style={{ display: "flex", flexDirection: "column", width: "42px", lineHeight: 1.05 }}>
                <div style={{ fontSize: "0.65rem", color: "#e8c468", fontWeight: 700 }}>{u.date}</div>
                <div style={S.upcomingDay}>{u.day}</div>
              </div>
              <div style={S.upcomingName}>{u.name}</div>
              <div style={S.upcomingTime}>{u.time}</div>
              <span style={{ color: "#555", fontSize: "0.55rem" }}>{expanded === i ? "▲" : "▼"}</span>
            </div>
            {expanded === i && (
              <div style={{ padding: "0.15rem 0.4rem 0.3rem", display: "flex", flexDirection: "column", gap: "0.1rem", animation: "fadeUp 0.15s ease" }}>
                {getPreview(u.name).map((ex, j) => (
                  <div key={j} style={{ display: "flex", fontSize: "0.58rem", gap: "0.2rem" }}>
                    <span style={{ color: "#888" }}>{ex.name}</span>
                    <span style={{ color: "#e8c468", marginLeft: "auto" }}>{ex.sets}×{ex.reps}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.55rem", color: "#30d158", flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#30d158", display: "inline-block" }} />
        Synced with Google Calendar
      </div>
    </Card>
  );
}

// ─── Panel: Attendance ────────────────────────────────────────────────────────

function AttendancePanel({ consistency }: { consistency?: number[] }) {
  const days = consistency ?? [];
  const attended = days.filter(Boolean).length;
  const pct = days.length ? Math.round((attended / days.length) * 100) : 0;

  return (
    <Card label="Attendance · 4 wks">
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", color: "#e8c468" }}>{pct}%</span>
        <span style={{ fontSize: "0.65rem", color: "#555" }}>{attended}/{days.length} days</span>
      </div>
      <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
        {days.length === 0 && (
          <div style={{ fontSize: "0.65rem", color: "#555", padding: "0.2rem 0" }}>
            No attendance history yet.
          </div>
        )}
        {days.map((v, i) => (
          <div
            key={i}
            title={v ? "Gym" : "Rest"}
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              background: v ? "rgba(232,196,104,0.7)" : "rgba(255,255,255,0.06)",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.55rem", color: "#555" }}>
        <div style={{ width: 7, height: 7, borderRadius: 2, background: "rgba(255,255,255,0.06)" }} /> Rest
        <div style={{ width: 7, height: 7, borderRadius: 2, background: "rgba(232,196,104,0.7)" }} /> Gym
      </div>
    </Card>
  );
}

// ─── Panel: Quick Log ─────────────────────────────────────────────────────────

function QuickLogPanel() {
  const exercises = ["Bench Press", "Squat", "Deadlift", "OHP", "Barbell Row"];
  const [selectedEx, setSelectedEx] = useState(exercises[0]);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [logged, setLogged] = useState<{ ex: string; weight: string; reps: string }[]>([]);

  const logSet = () => {
    if (!weight || !reps) return;
    setLogged((prev) => [...prev, { ex: selectedEx, weight, reps }]);
    setWeight("");
    setReps("");
  };

  const oneRM = weight && reps ? calc1RM(Number(weight), Number(reps)) : null;

  return (
    <Card label="Quick Log">
      <div style={S.logPills}>
        {exercises.map((ex) => (
          <button
            key={ex}
            onClick={() => setSelectedEx(ex)}
            style={{ ...S.logPill, ...(selectedEx === ex ? S.logPillActive : {}) }}
          >
            {ex}
          </button>
        ))}
      </div>
      <div style={S.logInputRow}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="lbs"
          style={S.logInput}
        />
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={reps}
          onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="reps"
          style={S.logInput}
        />
        <button onClick={logSet} style={S.logBtn}>Log</button>
      </div>
      {oneRM && (
        <div style={S.onermBadge}>
          Est. 1RM: <strong style={{ color: "#e8c468" }}>{oneRM} lbs</strong>
        </div>
      )}
      {logged.length > 0 && (
        <div style={S.loggedList}>
          {[...logged].reverse().map((l, i) => (
            <div key={i} style={S.loggedItem}>
              <span style={{ fontWeight: 600 }}>{l.ex}</span>
              <span style={{ color: "#e8c468", marginLeft: "auto" }}>{l.weight} lbs × {l.reps}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Panel: Session Calendar Grid ─────────────────────────────────────────────

function HistoryPanel({
  historyEntries,
  highlightedDates,
  liveEntry,
  autoSelectDate,
}: {
  historyEntries?: HistoryEntry[];
  highlightedDates?: string[];
  liveEntry?: HistoryEntry | null;
  autoSelectDate?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const entries = historyEntries ?? [];
  const mergedEntries = [...entries];
  if (liveEntry) {
    const idx = mergedEntries.findIndex((e) => e.date === liveEntry.date);
    if (idx >= 0) mergedEntries[idx] = liveEntry;
    else mergedEntries.unshift(liveEntry);
  }
  const historyByDate: Record<string, HistoryEntry> = {};
  mergedEntries.forEach((h) => {
    historyByDate[h.date] = h;
  });
  const highlighted = new Set(highlightedDates ?? []);
  useEffect(() => {
    if (autoSelectDate) setSelected(autoSelectDate);
  }, [autoSelectDate]);

  const parsedDates = mergedEntries
    .map((h) => new Date(h.date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  const basis = parsedDates[0] ?? new Date();
  const month = basis.getMonth();
  const year = basis.getFullYear();

  const DAYS_HEADER = ["S", "M", "T", "W", "T", "F", "S"];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dayToDateStr = (d: number) =>
    new Date(year, month, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const selectedEntry = selected ? historyByDate[selected] : null;
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long" });

  return (
    <Card label={`${monthLabel} Sessions`}>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", flexShrink: 0 }}>
          {DAYS_HEADER.map((d, i) => (
            <div key={`h-${i}`} style={{ textAlign: "center", fontSize: "0.5rem", color: "#555", padding: "1px 0" }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dateStr = dayToDateStr(day);
            const session = historyByDate[dateStr];
            const isHighlighted = Boolean(session) || highlighted.has(dateStr);
            const isSelected = selected === dateStr;
            return (
              <div
                key={i}
                onClick={() => session && setSelected(isSelected ? null : dateStr)}
                style={{
                  aspectRatio: "1",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.55rem",
                  cursor: session ? "pointer" : "default",
                  background: isSelected ? "rgba(232,196,104,0.3)" : isHighlighted ? "rgba(232,196,104,0.12)" : "rgba(255,255,255,0.03)",
                  border: isSelected ? "1px solid rgba(232,196,104,0.6)" : isHighlighted ? "1px solid rgba(232,196,104,0.25)" : "1px solid transparent",
                  color: isHighlighted ? "#e8c468" : "#555",
                  fontWeight: isHighlighted ? 700 : 400,
                  transition: "all 0.15s",
                }}
              >
                {day}
              </div>
            );
          })}
        </div>
        {mergedEntries.length === 0 && (
          <div style={{ fontSize: "0.65rem", color: "#555", padding: "0.2rem 0.1rem" }}>
            No session history yet.
          </div>
        )}
        {selectedEntry && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "0.35rem 0 0", display: "flex", flexDirection: "column", gap: "0.15rem", animation: "fadeUp 0.2s ease", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.1rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.72rem" }}>{selectedEntry.blockName}</span>
              <span style={{ fontSize: "0.6rem", color: "#555" }}>{selectedEntry.duration}</span>
              {selectedEntry.prs > 0 && <span style={{ fontSize: "0.6rem", color: "#e8c468" }}>{selectedEntry.prs} PRs</span>}
              {selectedEntry.formAvg > 0 && <div style={{ marginLeft: "auto" }}><ScoreRing score={selectedEntry.formAvg} size={24} /></div>}
            </div>
            {selectedEntry.exercises?.map((ex, j) => (
              <div key={j} style={{ display: "flex", fontSize: "0.6rem", gap: "0.2rem" }}>
                <span style={{ color: "#888" }}>{ex.name}</span>
                <span style={{ color: "#e8c468", marginLeft: "auto" }}>{ex.detail}</span>
              </div>
            ))}
            {selectedEntry.notes && (
              <div style={{ fontSize: "0.55rem", color: "#ff9f0a", fontStyle: "italic" }}>{selectedEntry.notes}</div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// --- iMessage-Style Chat ──────────────────────────────────────────────────────

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { role: "user", text, time }]);
    setInput("");
    setThinking(true);

    try {
      const saved = localStorage.getItem("gymbuddyUser");
      const user = saved ? JSON.parse(saved) as { id?: string; email?: string } : null;
      const res = await fetch("/api/chat/dashboard-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          userId: user?.id,
          email: user?.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Request failed: ${res.status}`);
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.reply || getAIResponse(text),
          time,
          citations: Array.isArray(data.ragHits) ? data.ragHits : undefined,
          ragSource: typeof data.ragSource === "string" ? data.ragSource : undefined,
          usedRag: Boolean(data.usedRag),
        },
      ]);
    } catch (err) {
      console.error("Dashboard chat failed:", err);
      setThinking(false);
      setMessages((prev) => [...prev, { role: "ai", text: getAIResponse(text), time }]);
    }
  };

  const QUICK = ["What weight?", "My knee hurts", "How's my form?", "Rest time?"];

  return (
    <div style={S.chatCol}>
      {/* Chat header */}
      <div style={S.chatHeader}>
        <div style={S.chatHeaderAvatar}>GB</div>
        <div>
          <div style={S.chatHeaderName}>GymBuddy Coach</div>
          <div style={S.chatHeaderStatus}>
            <span style={S.chatOnlineDot} />
            Online
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={S.chatMessages}>
        {messages.map((m, i) => (
          <div key={i} style={{ ...S.msgRow, ...(m.role === "user" ? S.msgRowUser : {}) }}>
            {m.role === "ai" && <div style={S.msgAvatar}>GB</div>}
            <div style={{ ...S.msgBubble, ...(m.role === "user" ? S.msgBubbleUser : S.msgBubbleAI) }}>
              {m.text}
              {m.role === "ai" && m.usedRag && m.citations && m.citations.length > 0 && (
                <div style={S.citationWrap}>
                  <div style={S.citationMeta}>
                    Sources
                  </div>
                  <div style={S.citationList}>
                    {m.citations.slice(0, 3).map((c, idx) => (
                      <span key={`${c.source}-${c.page}-${idx}`} style={S.citationChip}>
                        {c.source}{c.page ? ` p.${c.page}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={S.msgTime}>{m.time}</div>
            </div>
          </div>
        ))}
        {thinking && (
          <div style={S.msgRow}>
            <div style={S.msgAvatar}>GB</div>
            <div style={{ ...S.msgBubble, ...S.msgBubbleAI }}>
              <span className="dots"><span /><span /><span /></span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div style={S.quickRow}>
        {QUICK.map((q) => (
          <button key={q} style={S.quickBtn} onClick={() => setInput(q)}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={S.chatInputRow}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message your coach..."
          style={S.chatInput}
        />
        <button onClick={send} style={S.chatSend} disabled={!input.trim()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardApiData | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [plan, setPlan] = useState<PlanType>("strength");
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [todayWorkoutCompleted, setTodayWorkoutCompleted] = useState(false);
  const [liveWorkoutProgress, setLiveWorkoutProgress] = useState<LiveWorkoutProgress | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("gymbuddyUser");
    const user = saved ? JSON.parse(saved) as { id?: string; email?: string; goal?: string } : null;
    const qs = user?.id
      ? `userId=${encodeURIComponent(user.id)}`
      : user?.email
        ? `email=${encodeURIComponent(user.email)}`
        : "";
    if (!qs) {
      setLoadingDashboard(false);
      return;
    }

    fetch(`/api/dashboard-data?${qs}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? data.error ?? `Request failed: ${r.status}`);
        return data;
      })
      .then((data) => {
        setDashboard(data);
        setPlan(goalToPlanType(data.user?.goal));
      })
      .catch((err) => {
        console.error("Dashboard load failed:", err);
      })
      .finally(() => setLoadingDashboard(false));
  }, []);

  const apiWorkout = mapApiWorkoutToBlock(dashboard?.todayWorkout ?? null);
  const workout = plan === "custom"
    ? getTodayWorkout(plan, customExercises)
    : apiWorkout ?? getTodayWorkout(plan, customExercises);

  const upcomingData = (dashboard?.upcoming ?? []).map((u) => ({
    day: u.day,
    date: formatNumericDate(u.date),
    name: u.name,
    time: u.time,
  }));
  const historyEntries: HistoryEntry[] = (dashboard?.history ?? []).map((h) => ({
    date: formatShortDate(h.date),
    blockName: h.blockName,
    duration: `${h.durationMin}m`,
    formAvg: h.formAvg,
    prs: h.prs,
    notes: h.notes ?? undefined,
    exercises: h.exercises,
  }));
  const consistency = dashboard?.attendance?.last28;
  const todayCalendarDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const hasTodayProgress = Boolean(liveWorkoutProgress && liveWorkoutProgress.doneSets > 0);
  const historyHighlightDates = hasTodayProgress || todayWorkoutCompleted ? [todayCalendarDate] : [];
  const liveHistoryEntry: HistoryEntry | null = hasTodayProgress && liveWorkoutProgress ? {
    date: todayCalendarDate,
    blockName: workout.day || workout.name,
    duration: `${liveWorkoutProgress.percent}% done`,
    formAvg: 0,
    prs: 0,
    notes: `${liveWorkoutProgress.doneSets}/${liveWorkoutProgress.totalSets} total sets completed`,
    exercises: liveWorkoutProgress.exercises,
  } : null;
  const streak = computeStreak(consistency ?? []);
  const headerName = formatHeaderName(dashboard?.user?.email);
  const headerSub = loadingDashboard ? "Loading..." : `${workout.name} ? ${dashboard?.plan?.daysPerWeek ?? 0} days/week`;
  const planBlocks = dashboard?.plan?.blocks?.map((b) => ({
    name: b.name,
    exercises: b.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })),
  }));

  return (
    <div style={S.root}>
      <div style={S.bg} />

      <header style={S.header}>
        <a href="/" style={S.logoLink}>
          <span style={S.logo}>GB</span>
        </a>
        <div style={S.headerCenter}>
          <div style={S.headerUser}>{headerName}</div>
          <div style={S.headerSub}>{headerSub}</div>
        </div>
        <Link to="/live-session" style={S.liveSessionBtn}>
          Live Session
        </Link>
        <div style={S.planPills}>
          {(["strength", "hypertrophy", "custom"] as PlanType[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlan(p)}
              style={{ ...S.planPill, ...(plan === p ? S.planPillActive : {}) }}
            >
              {p === "strength" ? "Strength" : p === "hypertrophy" ? "Hypertrophy" : "Custom"}
            </button>
          ))}
        </div>
        <div style={S.streakBadge}>{streak}</div>
      </header>

      <div style={S.body}>
        <div style={S.grid}>
          <div style={{ gridColumn: '1 / 3', gridRow: '1 / 4', display: 'flex', overflow: 'hidden', minHeight: 0 }}><WorkoutPanel workout={workout} onCompletionChange={setTodayWorkoutCompleted} onProgressChange={setLiveWorkoutProgress} /></div>
          <div style={{ gridColumn: '3 / 4', gridRow: '1 / 3', display: 'flex', overflow: 'hidden', minHeight: 0 }}><HistoryPanel historyEntries={historyEntries} highlightedDates={historyHighlightDates} liveEntry={liveHistoryEntry} autoSelectDate={hasTodayProgress ? todayCalendarDate : null} /></div>
          <div style={{ gridColumn: '3 / 4', gridRow: '3 / 4', display: 'flex', overflow: 'hidden', minHeight: 0 }}><UpcomingPanel plan={plan} upcomingData={upcomingData} planBlocks={planBlocks} /></div>
          <div style={{ gridColumn: '1 / 2', gridRow: '4 / 5', display: 'flex', overflow: 'hidden', minHeight: 0 }}><AttendancePanel consistency={consistency} /></div>
          <div style={{ gridColumn: '2 / 3', gridRow: '4 / 5', display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            {plan === "custom" ? <CustomBuilderPanel exercises={customExercises} onChange={setCustomExercises} /> : <QuickLogPanel />}
          </div>
          <div style={{ gridColumn: '3 / 4', gridRow: '4 / 5', display: 'flex', overflow: 'hidden', minHeight: 0 }}><PRTrackerPanel prs={dashboard?.recentPRs} /></div>
        </div>

        <ChatPanel />
      </div>

      <style>{globalCss}</style>
    </div>
  );
}

// --- Global CSS ───────────────────────────────────────────────────────────────

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
  input::placeholder, textarea::placeholder { color: #3a3a3a; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes dotBlink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
  .dots span { display:inline-block; width:7px; height:7px; border-radius:50%; background:#888; animation: dotBlink 1.4s infinite; margin: 0 2px; }
  .dots span:nth-child(2){animation-delay:.2s} .dots span:nth-child(3){animation-delay:.4s}
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
    background: "radial-gradient(ellipse 60% 40% at 70% 20%, rgba(232,196,104,0.04) 0%, transparent 60%)",
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
  logoLink: { textDecoration: "none" },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.4rem",
    letterSpacing: "0.1em",
    color: "#e8c468",
  },
  headerCenter: { flex: 1 },
  liveSessionBtn: {
    background: "rgba(232,196,104,0.1)",
    border: "1px solid rgba(232,196,104,0.3)",
    color: "#e8c468",
    borderRadius: "8px",
    padding: "0.35rem 0.7rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textDecoration: "none",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  headerUser: { fontWeight: 600, fontSize: "0.82rem" },
  headerSub: { fontSize: "0.65rem", color: "#6b6760" },
  streakBadge: {
    background: "rgba(232,196,104,0.12)",
    border: "1px solid rgba(232,196,104,0.25)",
    borderRadius: "20px",
    padding: "0.25rem 0.7rem",
    fontSize: "0.78rem",
    color: "#e8c468",
    fontWeight: 600,
  },
  planPills: {
    display: "flex",
    gap: "0.3rem",
    marginRight: "0.5rem",
  },
  planPill: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#888",
    borderRadius: "16px",
    padding: "0.25rem 0.65rem",
    fontSize: "0.68rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  planPillActive: {
    background: "rgba(232,196,104,0.12)",
    border: "1px solid rgba(232,196,104,0.4)",
    color: "#e8c468",
  },

  // ── Body layout ──
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
    position: "relative",
    zIndex: 5,
    minHeight: 0,
  },

  // ── Bento grid ──
  grid: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1.2fr 1fr 0.8fr 0.7fr",
    gap: "0.5rem",
    padding: "0.5rem",
    overflow: "hidden",
    minHeight: 0,
  },


  // ── Card (shared) ──
  card: {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "0.6rem 0.7rem",
    animation: "fadeUp 0.35s ease both",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    overflow: "hidden",
    minHeight: 0,
    height: "100%",
    width: "100%",
  },
  cardLabel: {
    fontSize: "0.55rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#e8c468",
    opacity: 0.8,
    flexShrink: 0,
  },

  // ── Workout panel ──
  workoutHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  workoutTag: {
    fontSize: "0.62rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#e8c468",
    marginBottom: "0.2rem",
  },
  workoutTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.3rem",
    letterSpacing: "0.04em",
    color: "#f0ede6",
    margin: 0,
    lineHeight: 1,
  },
  workoutMeta: { fontSize: "0.68rem", color: "#555" },
  progressWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.1rem" },
  progressLbl: { fontSize: "0.5rem", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" },

  restBanner: {
    background: "rgba(232,196,104,0.08)",
    border: "1px solid rgba(232,196,104,0.25)",
    borderRadius: "8px",
    padding: "0.35rem 0.6rem",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.75rem",
    flexShrink: 0,
  },
  restTime: { color: "#e8c468", fontWeight: 700, fontSize: "1rem", flex: 1 },
  restSkip: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#888",
    borderRadius: "6px",
    padding: "0.2rem 0.5rem",
    cursor: "pointer",
    fontSize: "0.72rem",
    fontFamily: "'DM Sans', sans-serif",
  },

  exerciseList: { display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, overflow: "auto", minHeight: 0 },
  exRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "8px",
    padding: "0.4rem 0.6rem",
    flexWrap: "wrap",
    transition: "border-color 0.2s, background 0.2s",
  },
  exRowDone: {
    borderColor: "rgba(48,209,88,0.25)",
    background: "rgba(48,209,88,0.03)",
  },
  exInfo: { flex: 1, minWidth: "100px" },
  exName: { fontWeight: 600, fontSize: "0.78rem" },
  exMeta: { fontSize: "0.65rem", color: "#888" },
  setBubbles: { display: "flex", gap: "0.3rem" },
  setBubble: {
    width: "22px",
    height: "22px",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#888",
    fontSize: "0.62rem",
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

  // ── Stats panel ──
  statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" },
  statItem: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: "8px",
    padding: "0.4rem 0.35rem",
    textAlign: "center",
  },
  statValue: {
    fontSize: "1.1rem",
    fontWeight: 700,
    fontFamily: "'Bebas Neue', sans-serif",
    letterSpacing: "0.04em",
  },
  statLabel: {
    fontSize: "0.58rem",
    color: "#555",
    marginTop: "0.1rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },

  // ── Upcoming panel ──
  upcomingList: { display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, overflow: "auto", minHeight: 0 },
  upcomingItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "6px",
    padding: "0.35rem 0.5rem",
  },
  upcomingDay: { fontSize: "0.62rem", color: "#555", width: "24px", fontWeight: 600 },
  upcomingName: { fontSize: "0.75rem", fontWeight: 600, color: "#f0ede6", flex: 1 },
  upcomingTime: { fontSize: "0.62rem", color: "#e8c468" },

  // ── Consistency heatmap ──
  heatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "4px",
  },
  heatCell: {
    aspectRatio: "1",
    borderRadius: "4px",
    minWidth: 0,
  },

  // ── Quick log panel ──
  logPills: { display: "flex", gap: "0.3rem", flexWrap: "wrap" },
  logPill: {
    padding: "0.25rem 0.55rem",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    color: "#888",
    fontSize: "0.7rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  logPillActive: {
    background: "rgba(232,196,104,0.1)",
    border: "1px solid rgba(232,196,104,0.4)",
    color: "#e8c468",
  },
  logInputRow: { display: "flex", gap: "0.4rem" },
  logInput: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "0.5rem 0.65rem",
    color: "#f0ede6",
    fontSize: "0.82rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    minWidth: 0,
  },
  logBtn: {
    background: "#e8c468",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "8px",
    padding: "0.5rem 0.85rem",
    fontWeight: 700,
    fontSize: "0.78rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
  },
  onermBadge: {
    background: "rgba(232,196,104,0.06)",
    border: "1px solid rgba(232,196,104,0.2)",
    borderRadius: "8px",
    padding: "0.4rem 0.65rem",
    fontSize: "0.75rem",
    color: "#888",
  },
  loggedList: { display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1, overflow: "auto", minHeight: 0 },
  loggedItem: {
    display: "flex",
    alignItems: "center",
    fontSize: "0.78rem",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "6px",
    padding: "0.35rem 0.6rem",
    animation: "fadeUp 0.2s ease",
  },

  // ── History panel ──
  historyList: { display: "flex", flexDirection: "column", gap: "0.45rem", flex: 1, overflow: "auto", minHeight: 0 },
  historyItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "10px",
    padding: "0.7rem 0.85rem",
  },
  historyDate: { fontSize: "0.6rem", color: "#555", marginBottom: "0.15rem" },
  historyBlock: { fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.12rem" },
  historyMeta: { fontSize: "0.7rem", color: "#888" },

  // ── Chat column (iMessage) ──
  chatCol: {
    width: "380px",
    minWidth: "380px",
    borderLeft: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    background: "rgba(10,10,10,0.6)",
    backdropFilter: "blur(16px)",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    padding: "0.85rem 1rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  chatHeaderAvatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "rgba(232,196,104,0.15)",
    border: "1px solid rgba(232,196,104,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#e8c468",
    fontFamily: "'Bebas Neue', sans-serif",
    letterSpacing: "0.05em",
  },
  chatHeaderName: { fontWeight: 600, fontSize: "0.9rem", color: "#f0ede6" },
  chatHeaderStatus: {
    fontSize: "0.68rem",
    color: "#555",
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
  },
  chatOnlineDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#30d158",
    display: "inline-block",
  },

  chatMessages: {
    flex: 1,
    overflow: "auto",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  },
  msgRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "flex-end",
    animation: "fadeUp 0.25s ease",
  },
  msgRowUser: { flexDirection: "row-reverse" },
  msgAvatar: {
    width: "26px",
    height: "26px",
    borderRadius: "50%",
    background: "rgba(232,196,104,0.15)",
    border: "1px solid rgba(232,196,104,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.55rem",
    fontWeight: 700,
    color: "#e8c468",
    flexShrink: 0,
    fontFamily: "'Bebas Neue', sans-serif",
    letterSpacing: "0.05em",
  },
  msgBubble: {
    maxWidth: "80%",
    padding: "0.6rem 0.8rem",
    borderRadius: "16px",
    fontSize: "0.84rem",
    lineHeight: 1.45,
  },
  msgBubbleAI: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#f0ede6",
    borderBottomLeftRadius: "4px",
  },
  msgBubbleUser: {
    background: "#e8c468",
    color: "#0a0a0a",
    borderBottomRightRadius: "4px",
  },
  msgTime: { fontSize: "0.55rem", opacity: 0.5, marginTop: "0.2rem" },
  citationWrap: {
    marginTop: "0.35rem",
    paddingTop: "0.3rem",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  citationMeta: { fontSize: "0.52rem", color: "#888" },
  citationList: { display: "flex", flexWrap: "wrap", gap: "0.2rem" },
  citationChip: {
    fontSize: "0.5rem",
    color: "#e8c468",
    border: "1px solid rgba(232,196,104,0.25)",
    background: "rgba(232,196,104,0.06)",
    borderRadius: "999px",
    padding: "0.08rem 0.3rem",
  },

  quickRow: {
    display: "flex",
    gap: "0.35rem",
    padding: "0.45rem 1rem",
    flexWrap: "wrap",
    borderTop: "1px solid rgba(255,255,255,0.05)",
  },
  quickBtn: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#888",
    borderRadius: "16px",
    padding: "0.25rem 0.6rem",
    fontSize: "0.68rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  chatInputRow: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.65rem 1rem 0.85rem",
    borderTop: "1px solid rgba(255,255,255,0.05)",
  },
  chatInput: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "22px",
    padding: "0.55rem 0.85rem",
    color: "#f0ede6",
    fontSize: "0.85rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
  },
  chatSend: {
    width: "36px",
    height: "36px",
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
