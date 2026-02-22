import { FormEvent, useEffect, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, ReactNode, RefObject } from "react";
import type { SignupPayload } from "../pages/SignupPage";
import SpotlightCard from "./SpotlightCard";

const PROXIMITY = 120;

function useBorderGlow(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const id = `bglow-${Math.random().toString(36).slice(2)}`;
    el.classList.add(id);

    const style = document.createElement("style");
    style.textContent = `
      .${id} {
        --glow-x: 50%;
        --glow-y: 50%;
        --glow-intensity: 0;
        position: relative;
        overflow: hidden;
      }
      .${id}::after {
        content: "";
        position: absolute;
        inset: 0;
        padding: 1px;
        border-radius: inherit;
        background: radial-gradient(
          120px circle at var(--glow-x) var(--glow-y),
          rgba(232,196,104,calc(var(--glow-intensity) * 0.9)) 0%,
          rgba(232,196,104,calc(var(--glow-intensity) * 0.35)) 45%,
          transparent 72%
        );
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask-composite: exclude;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * 100;
      const relY = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--glow-x", `${relX}%`);
      el.style.setProperty("--glow-y", `${relY}%`);

      const nearX = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const nearY = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const dist = Math.hypot(nearX, nearY);
      const intensity = dist >= PROXIMITY ? 0 : 1 - dist / PROXIMITY;
      el.style.setProperty("--glow-intensity", intensity.toFixed(3));
    };

    const onLeave = () => el.style.setProperty("--glow-intensity", "0");

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      style.remove();
      el.classList.remove(id);
    };
  }, [ref]);
}

type GoalValue = SignupPayload["goal"] | "custom";

const GOALS: { value: GoalValue; label: string; desc: string }[] = [
  { value: "strength_without_size", label: "Strength Focus", desc: "Raw power, lower volume." },
  { value: "strength_and_size", label: "Hypertrophy Focus", desc: "Size and strength progression." },
  { value: "custom", label: "Custom Plan", desc: "Start here and tune later." },
];

const CARRIERS: { value: string; label: string }[] = [
  { value: "vtext.com", label: "Verizon" },
  { value: "txt.att.net", label: "AT&T" },
  { value: "tmomail.net", label: "T-Mobile" },
  { value: "messaging.sprintpcs.com", label: "Sprint" },
  { value: "mms.uscc.net", label: "US Cellular" },
];

function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
}) {
  const num = parseFloat(value);
  const adjust = (delta: number) => {
    const next = Number.isNaN(num)
      ? delta > 0
        ? min
        : max
      : Math.min(max, Math.max(min, parseFloat((num + delta).toFixed(10))));
    onChange(String(next));
  };

  return (
    <div style={ns.wrap}>
      <button type="button" onClick={() => adjust(-step)} style={ns.btn} tabIndex={-1}>
        -
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={ns.input}
      />
      <button type="button" onClick={() => adjust(step)} style={ns.btn} tabIndex={-1}>
        +
      </button>
    </div>
  );
}

function GoalBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useBorderGlow(ref as RefObject<HTMLElement | null>);
  return (
    <button type="button" ref={ref} onClick={onClick} style={{ ...s.goalBtn, ...(active ? s.goalBtnActive : {}) }}>
      {children}
    </button>
  );
}

type Props = { onSubmit: (payload: SignupPayload) => Promise<void> };

export default function SignupForm({ onSubmit }: Props) {
  const submitRef = useRef<HTMLButtonElement>(null);
  useBorderGlow(submitRef as RefObject<HTMLElement | null>);

  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [carrier, setCarrier] = useState(CARRIERS[0].value);
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [goal, setGoal] = useState<GoalValue>("strength_and_size");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const ft = Number(heightFt);
    const inch = Number(heightIn || "0");
    const lbs = Number(weightLbs);

    if (Number.isNaN(ft) || Number.isNaN(inch) || Number.isNaN(lbs)) {
      setError("Please enter valid numeric values.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        email,
        phoneNumber: normalizePhone(phoneNumber),
        carrier,
        heightCm: Math.round((ft * 12 + inch) * 2.54),
        weightKg: Math.round((lbs * 0.453592) * 10) / 10,
        goal: goal === "custom" ? "strength_and_size" : goal,
        gymTravelMinutes: 15, // default, hidden from user
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onFocus = (e: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "#e8c468";
  };
  const onBlur = (e: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
  };

  return (
    <div style={s.wrapper}>
      <a href="/" style={s.back}>
        {"<- Back"}
      </a>

      <SpotlightCard className="signup-card" spotlightColor="rgba(232,196,104,0.1)">
        <div style={s.header}>
          <span style={s.logo}>GB</span>
          <h1 style={s.title}>Create your plan</h1>
          <p style={s.subtitle}>Tell us about yourself and we will build a schedule around your life.</p>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.section}>
            <p style={s.sectionLabel}>Contact</p>
            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={s.input}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Phone</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555 123 4567"
                required
                style={s.input}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Carrier</label>
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)} required style={s.select} onBlur={onBlur} onFocus={onFocus}>
                {CARRIERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
                <NumberStepper value={weightLbs} onChange={setWeightLbs} min={66} max={660} step={1} placeholder="165" />
              </div>
            </div>
          </div>

          <div style={s.section}>
            <p style={s.sectionLabel}>Training focus</p>
            <div style={s.goalGrid}>
              {GOALS.map((g) => {
                const active = goal === g.value;
                return (
                  <GoalBtn key={g.value} active={active} onClick={() => setGoal(g.value)}>
                    <div style={s.goalTop}>
                      {active && <span style={s.goalCheck}>✓</span>}
                    </div>
                    <span style={{ ...s.goalTitle, ...(active ? { color: "#e8c468" } : {}) }}>{g.label}</span>
                    <span style={s.goalDesc}>{g.desc}</span>
                  </GoalBtn>
                );
              })}
            </div>
            {goal === "custom" && (
              <div style={s.customNote}>
                <span>You will build your custom plan on the homepage after signup.</span>
              </div>
            )}
          </div>

          {error && <div style={s.errorBox}>Error: {error}</div>}

          <button
            type="submit"
            ref={submitRef}
            disabled={loading}
            style={{ ...s.submit, ...(loading ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
          >
            {loading ? "Building your plan..." : "Get my plan ->"}
          </button>
        </form>
      </SpotlightCard>
      <style>{css}</style>
    </div>
  );
}

function normalizePhone(raw: string): string {
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  return `+1${digits}`;
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

const ns: Record<string, CSSProperties> = {
  wrap: {
    display: "flex",
    alignItems: "stretch",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    overflow: "hidden",
    background: "rgba(255,255,255,0.04)",
  },
  btn: {
    background: "rgba(232,196,104,0.08)",
    border: "none",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    color: "#e8c468",
    fontSize: "1.05rem",
    fontWeight: 600,
    width: "36px",
    cursor: "pointer",
    lineHeight: 1,
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
    textAlign: "center",
    width: "100%",
    minWidth: 0,
  },
};

const s: Record<string, CSSProperties> = {
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
    color: "#777",
    textDecoration: "none",
    fontSize: "0.85rem",
    letterSpacing: "0.05em",
    marginLeft: "calc(50% - 250px)",
  },
  header: { marginBottom: "2rem" },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.35rem",
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
    textTransform: "uppercase",
    color: "#e8c468",
    margin: 0,
    opacity: 0.8,
  },
  field: { display: "flex", flexDirection: "column", gap: "0.35rem" },
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
    width: "100%",
    boxSizing: "border-box",
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
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
    appearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.9rem center",
  },
  goalGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" },
  goalBtn: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "1rem 0.75rem",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    position: "relative",
  },
  goalBtnActive: {
    border: "1px solid rgba(232,196,104,0.55)",
    background: "rgba(232,196,104,0.06)",
    boxShadow: "0 0 16px rgba(232,196,104,0.08)",
  },
  goalTop: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: "0.2rem",
    minHeight: "18px",
  },
  goalCheck: {
    fontSize: "0.65rem",
    color: "#e8c468",
    background: "rgba(232,196,104,0.15)",
    borderRadius: "10px",
    padding: "2px 6px",
  },
  goalTitle: { fontSize: "0.82rem", color: "#c8c4bc", fontWeight: 600, lineHeight: 1.2 },
  goalDesc: { fontSize: "0.72rem", color: "#555", lineHeight: 1.4 },
  customNote: {
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
    boxShadow: "0 4px 16px rgba(232,196,104,0.2)",
  },
};