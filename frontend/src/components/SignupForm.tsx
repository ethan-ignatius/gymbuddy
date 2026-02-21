import { useState, FormEvent, useRef, useEffect, useCallback } from "react";
import type { SignupPayload } from "../pages/SignupPage";
import SpotlightCard from "./SpotlightCard";
// ── Border glow proximity effect ────────────────────────────────────────
const PROXIMITY = 120; // px — how far away cursor triggers the glow

function useBorderGlow(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Inject the ::after pseudo-element glow via a unique class
    const id = `bglow-${Math.random().toString(36).slice(2)}`;
    el.classList.add(id);
    const style = document.createElement('style');
    style.textContent = `
      .${id} {
        --glow-x: 50%; --glow-y: 50%; --glow-intensity: 0;
        position: relative; overflow: hidden;
      }
      .${id}::after {
        content: '';
        position: absolute;
        inset: 0;
        padding: 1px;
        border-radius: inherit;
        background: radial-gradient(
          120px circle at var(--glow-x) var(--glow-y),
          rgba(232,196,104,calc(var(--glow-intensity) * 0.9)) 0%,
          rgba(232,196,104,calc(var(--glow-intensity) * 0.4)) 40%,
          transparent 70%
        );
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask-composite: exclude;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
    `;
    document.head.appendChild(style);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      // Position relative to the element for the gradient
      const relX = ((e.clientX - rect.left) / rect.width) * 100;
      const relY = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--glow-x', `${relX}%`);
      el.style.setProperty('--glow-y', `${relY}%`);

      // Distance from cursor to nearest edge of element
      const nearX = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const nearY = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const dist = Math.hypot(nearX, nearY);
      const intensity = dist >= PROXIMITY ? 0 : 1 - dist / PROXIMITY;
      el.style.setProperty('--glow-intensity', intensity.toFixed(3));
    };

    const handleMouseLeave = () => {
      el.style.setProperty('--glow-intensity', '0');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      style.remove();
      el.classList.remove(id);
    };
  }, [ref]);
}
// ───────────────────────────────────────────────────────────────────────

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

const CARRIERS = [
  "AT&T", "Verizon", "T-Mobile", "Sprint", "US Cellular",
  "Cricket Wireless", "Boost Mobile", "Metro by T-Mobile",
  "Straight Talk", "Mint Mobile", "Google Fi", "Other",
];

function NumberStepper({
  value, onChange, min, max, step = 1, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  min: number; max: number; step?: number; placeholder?: string;
}) {
  const num = parseFloat(value);
  const adjust = (delta: number) => {
    const next = isNaN(num) ? (delta > 0 ? min : max) : Math.min(max, Math.max(min, parseFloat((num + delta).toFixed(10))));
    onChange(String(next));
  };
  return (
    <div style={ns.wrap}>
      <button type="button" onClick={() => adjust(-step)} style={ns.btn} tabIndex={-1}>−</button>
      <input
        type="number" min={min} max={max} step={step}
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required style={ns.input}
      />
      <button type="button" onClick={() => adjust(step)} style={ns.btn} tabIndex={-1}>+</button>
    </div>
  );
}
const ns: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex", alignItems: "stretch",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px", overflow: "hidden",
    background: "rgba(255,255,255,0.04)",
    transition: "border-color 0.2s",
  },
  btn: {
    background: "rgba(232,196,104,0.08)",
    border: "none",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    color: "#e8c468",
    fontSize: "1.1rem",
    fontWeight: 600,
    width: "36px",
    cursor: "pointer",
    lineHeight: 1,
    transition: "background 0.15s",
    fontFamily: "'DM Sans', sans-serif",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    padding: "0.65rem 0.5rem",
    color: "#f0ede6",
    fontSize: "0.9rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    textAlign: "center" as const,
    width: "100%",
    minWidth: 0,
  },
};

function GoalBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useBorderGlow(ref as React.RefObject<HTMLElement | null>);
  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      style={{ ...s.goalBtn, ...(active ? s.goalBtnActive : {}) }}
    >
      {children}
    </button>
  );
}

type Props = { onSubmit: (payload: SignupPayload) => Promise<void> };
export default function SignupForm({ onSubmit }: Props) {
const submitBtnRef = useRef<HTMLButtonElement>(null);
useBorderGlow(submitBtnRef as React.RefObject<HTMLElement | null>);
const [email, setEmail] = useState("");
const [phoneNumber, setPhoneNumber] = useState("");
const [heightFt, setHeightFt] = useState("");
const [heightIn, setHeightIn] = useState("");
const [weightKg, setWeightKg] = useState("");
const [goal, setGoal] = useState<GoalValue>("strength_and_size");
const [carrier, setCarrier] = useState("");
const [error, setError] = useState<string | null>(null);
const [loading, setLoading] = useState(false);
const handleSubmit = async (e: FormEvent) => {
e.preventDefault();
setError(null);
if (!carrier) { setError("Please select your carrier."); return; }
setLoading(true);
try {
await onSubmit({
email,
phoneNumber: phoneNumber.startsWith("+") ? phoneNumber : `+1${phoneNumber.replace(/\D/g, "")}`,
heightCm: Math.round(((Number(heightFt) * 12) + Number(heightIn || 0)) * 2.54),
weightKg: Math.round(Number(weightKg) * 0.453592 * 10) / 10,
// map "custom" to a valid backend value
goal: goal === "custom" ? "strength_and_size" : goal as SignupPayload["goal"],
gymTravelMinutes: 15,
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
<div style={s.field}>
<label style={s.label}>Carrier</label>
<select value={carrier} onChange={(e) => setCarrier(e.target.value)} required style={s.select}>
<option value="" disabled>Select your carrier</option>
{CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
</select>
</div>
</div>
{/* body */}
<div style={s.section}>
<p style={s.sectionLabel}>Body</p>
<div style={s.threeCol}>
<div style={s.field}>
<label style={s.label}>ft</label>
<NumberStepper value={heightFt} onChange={setHeightFt} min={4} max={7} placeholder="5" />
</div>
<div style={s.field}>
<label style={s.label}>in</label>
<NumberStepper value={heightIn} onChange={setHeightIn} min={0} max={11} placeholder="10" />
</div>
<div style={s.field}>
<label style={s.label}>Weight (lbs)</label>
<NumberStepper value={weightKg} onChange={setWeightKg} min={66} max={660} step={1} placeholder="165" />
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
<GoalBtn
key={g.value}
active={active}
onClick={() => setGoal(g.value)}
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
</GoalBtn>
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
{error && (
<div style={s.errorBox}>⚠ {error}</div>
          )}
<button
type="submit"
ref={submitBtnRef}
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
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { display: none; }
  input[type=number] { -moz-appearance: textfield; }
  input::placeholder { color: #444; }
  select option { background: #1a1a1a; color: #f0ede6; }
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
threeCol: { display: "grid", gridTemplateColumns: "1fr 1fr 1.6fr", gap: "0.75rem" },
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
select: {
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
cursor: "pointer",
appearance: "none" as const,
backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
backgroundRepeat: "no-repeat",
backgroundPosition: "right 0.9rem center",
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