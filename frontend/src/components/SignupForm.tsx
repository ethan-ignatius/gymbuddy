import { useState, FormEvent } from "react";
import type { SignupPayload } from "../pages/SignupPage";
import SpotlightCard from "./SpotlightCard";

type GoalValue = SignupPayload["goal"] | "custom";

const GOALS: { value: GoalValue; label: string; desc: string; icon: string }[] = [
  {
    value: "strength_without_size",
    label: "Strength Focus",
    desc: "Raw power, no bulk.",
    icon: "⚡",
  },
  {
    value: "strength_and_size",
    label: "Hypertrophy Focus",
    desc: "Muscle growth & size.",
    icon: "💪",
  },
  {
    value: "custom",
    label: "Custom Plan",
    desc: "Build your own on the homepage.",
    icon: "✏️",
  },
];

type Props = { onSubmit: (payload: SignupPayload) => Promise<void> };

export default function SignupForm({ onSubmit }: Props) {
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [goal, setGoal] = useState<GoalValue>("strength_and_size");
  const [gymTravelMinutes, setGymTravelMinutes] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        email,
        phoneNumber: phoneNumber.startsWith("+") ? phoneNumber : `+1${phoneNumber.replace(/\D/g, "")}`,
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        // map "custom" to a valid backend value
        goal: goal === "custom" ? "strength_and_size" : goal as SignupPayload["goal"],
        gymTravelMinutes: Number(gymTravelMinutes),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const focusBorder = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.currentTarget.style.borderColor = "#e8c468");
  const blurBorder = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)");

  return (
    <div style={s.wrapper}>
      <a href="/" style={s.back}>← Back</a>

      <SpotlightCard className="signup-card" spotlightColor="rgba(232,196,104,0.1)">
        <div style={s.header}>
          <span style={s.logo}>GB</span>
          <h1 style={s.title}>Create your plan</h1>
          <p style={s.subtitle}>Tell us about yourself and we'll build a schedule around your life.</p>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>

          {/* contact */}
          <div style={s.section}>
            <p style={s.sectionLabel}>Contact</p>
            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required style={s.input}
                onFocus={focusBorder} onBlur={blurBorder} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Phone</label>
              <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555 123 4567" required style={s.input}
                onFocus={focusBorder} onBlur={blurBorder} />
            </div>
          </div>

          {/* body */}
          <div style={s.section}>
            <p style={s.sectionLabel}>Body</p>
            <div style={s.row}>
              <div style={s.field}>
                <label style={s.label}>Height (cm)</label>
                <input type="number" min={100} max={250} value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)} placeholder="178" required
                  style={s.input} onFocus={focusBorder} onBlur={blurBorder} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Weight (kg)</label>
                <input type="number" min={30} max={300} step={0.1} value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)} placeholder="75" required
                  style={s.input} onFocus={focusBorder} onBlur={blurBorder} />
              </div>
            </div>
          </div>

          {/* goal — 3 big cards */}
          <div style={s.section}>
            <p style={s.sectionLabel}>Training focus</p>
            <div style={s.goalGrid}>
              {GOALS.map((g) => {
                const active = goal === g.value;
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGoal(g.value)}
                    style={{
                      ...s.goalBtn,
                      ...(active ? s.goalBtnActive : {}),
                    }}
                  >
                    <div style={s.goalTop}>
                      <span style={{ ...s.goalIcon, ...(active ? s.goalIconActive : {}) }}>
                        {g.icon}
                      </span>
                      {active && <span style={s.goalCheck}>✓</span>}
                    </div>
                    <span style={{ ...s.goalTitle, ...(active ? { color: "#e8c468" } : {}) }}>
                      {g.label}
                    </span>
                    <span style={s.goalDesc}>{g.desc}</span>
                  </button>
                );
              })}
            </div>
            {goal === "custom" && (
              <div style={s.customNote}>
                <span style={{ fontSize: "0.85rem" }}>💬</span>
                <span>You'll build your custom plan on the homepage after signing up.</span>
              </div>
            )}
          </div>

          {/* travel */}
          <div style={s.section}>
            <p style={s.sectionLabel}>Logistics</p>
            <div style={s.field}>
              <label style={s.label}>Travel time to gym</label>
              <div style={s.sliderRow}>
                <input type="range" min={0} max={120} step={5}
                  value={gymTravelMinutes}
                  onChange={(e) => setGymTravelMinutes(e.target.value)}
                  style={s.slider} />
                <span style={s.sliderVal}>{gymTravelMinutes} min</span>
              </div>
            </div>
          </div>

          {error && (
            <div style={s.errorBox}>⚠ {error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...s.submit, ...(loading ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(232,196,104,0.45)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(232,196,104,0.2)"; }}
          >
            {loading ? "Building your plan…" : "Get my plan →"}
          </button>
        </form>
      </SpotlightCard>

      <style>{css}</style>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');

  .signup-card {
    border-color: rgba(232,196,104,0.12) !important;
    background-color: rgba(14,14,14,0.85) !important;
    border-radius: 1.25rem !important;
    padding: 2.5rem !important;
    backdrop-filter: blur(20px) !important;
    max-width: 500px;
    width: 100%;
  }

  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.1);
    outline: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #e8c468;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(232,196,104,0.6);
  }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { opacity: 0.3; }
  input::placeholder { color: #444; }
`;

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
    fontFamily: "'DM Sans', sans-serif",
    gap: "1.25rem",
  },
  back: {
    alignSelf: "flex-start",
    color: "#555",
    textDecoration: "none",
    fontSize: "0.85rem",
    letterSpacing: "0.05em",
    marginLeft: "calc(50% - 250px)",
    transition: "color 0.2s",
  },
  header: { marginBottom: "2rem" },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.4rem",
    letterSpacing: "0.1em",
    color: "#e8c468",
    display: "block",
    marginBottom: "0.75rem",
  },
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "2.2rem",
    letterSpacing: "0.03em",
    color: "#f0ede6",
    margin: "0 0 0.4rem",
  },
  subtitle: { color: "#6b6760", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 },
  form: { display: "flex", flexDirection: "column", gap: "1.75rem" },
  section: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  sectionLabel: {
    fontSize: "0.65rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "#e8c468",
    margin: 0,
    opacity: 0.8,
  },
  field: { display: "flex", flexDirection: "column", gap: "0.35rem" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
  label: { fontSize: "0.8rem", color: "#888", letterSpacing: "0.02em" },
  input: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "0.65rem 0.9rem",
    color: "#f0ede6",
    fontSize: "0.9rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  // goal cards — 3 side-by-side
  goalGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "0.6rem",
  },
  goalBtn: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "1rem 0.75rem",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.18s",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.45rem",
    position: "relative" as const,
  },
  goalBtnActive: {
    border: "1px solid rgba(232,196,104,0.55)",
    background: "rgba(232,196,104,0.06)",
    boxShadow: "0 0 16px rgba(232,196,104,0.08)",
  },
  goalTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.2rem",
  },
  goalIcon: {
    fontSize: "1.3rem",
    lineHeight: 1,
    filter: "grayscale(0.4)",
    transition: "filter 0.18s",
  },
  goalIconActive: { filter: "grayscale(0)" },
  goalCheck: {
    fontSize: "0.7rem",
    color: "#e8c468",
    background: "rgba(232,196,104,0.15)",
    borderRadius: "50%",
    width: "18px",
    height: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  goalTitle: {
    fontSize: "0.82rem",
    color: "#c8c4bc",
    fontWeight: 600,
    lineHeight: 1.2,
    transition: "color 0.18s",
  },
  goalDesc: { fontSize: "0.72rem", color: "#555", lineHeight: 1.4 },
  customNote: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.6rem",
    background: "rgba(232,196,104,0.05)",
    border: "1px solid rgba(232,196,104,0.15)",
    borderRadius: "8px",
    padding: "0.65rem 0.9rem",
    fontSize: "0.8rem",
    color: "#888",
    lineHeight: 1.5,
    marginTop: "0.25rem",
  },
  sliderRow: { display: "flex", alignItems: "center", gap: "1rem" },
  sliderVal: { fontSize: "0.85rem", color: "#e8c468", minWidth: "52px", textAlign: "right" as const },
  slider: { flex: 1 },
  errorBox: {
    background: "rgba(220,50,50,0.1)",
    border: "1px solid rgba(220,50,50,0.3)",
    borderRadius: "8px",
    padding: "0.65rem 0.9rem",
    color: "#f87171",
    fontSize: "0.85rem",
  },
  submit: {
    background: "#e8c468",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "8px",
    padding: "0.85rem 1.5rem",
    fontWeight: 700,
    fontSize: "0.95rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.02em",
    transition: "box-shadow 0.2s",
    boxShadow: "0 4px 16px rgba(232,196,104,0.2)",
  },
};