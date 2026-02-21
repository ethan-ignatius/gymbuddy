import { useState, FormEvent } from "react";
import type { SignupPayload } from "../pages/SignupPage";

const GOALS: { value: SignupPayload["goal"]; label: string }[] = [
  { value: "lose_fat", label: "Lose fat" },
  { value: "strength_and_size", label: "Strength & size" },
  { value: "strength_without_size", label: "Strength without size" },
];

const CARRIERS: { value: string; label: string }[] = [
  { value: "vtext.com", label: "Verizon" },
  { value: "txt.att.net", label: "AT&T" },
  { value: "tmomail.net", label: "T-Mobile" },
  { value: "messaging.sprintpcs.com", label: "Sprint" },
  { value: "pcs.rogers.com", label: "Rogers" },
  { value: "txt.bell.ca", label: "Bell (Canada)" },
  { value: "msg.telus.com", label: "Telus" },
  { value: "fido.ca", label: "Fido" },
  { value: "msg.koodomobile.com", label: "Koodo" },
  { value: "txt.freedommobile.ca", label: "Freedom Mobile" },
  { value: "vmobile.ca", label: "Virgin (Canada)" },
];

type Props = { onSubmit: (payload: SignupPayload) => Promise<void> };

export default function SignupForm({ onSubmit }: Props) {
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [carrier, setCarrier] = useState(CARRIERS[0].value);
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [goal, setGoal] = useState<SignupPayload["goal"]>("strength_and_size");
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
        carrier,
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        goal,
        gymTravelMinutes: Number(gymTravelMinutes),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.title}>GymBuddy</h1>
        <p style={styles.subtitle}>Get a plan. Get reminders. Get to the gym.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Phone number
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 555 123 4567"
              required
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Phone carrier
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              required
              style={styles.input}
            >
              {CARRIERS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <div style={styles.row}>
            <label style={styles.label}>
              Height (cm)
              <input
                type="number"
                min={100}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="178"
                required
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Weight (kg)
              <input
                type="number"
                min={30}
                max={300}
                step={0.1}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="75"
                required
                style={styles.input}
              />
            </label>
          </div>

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Goal</legend>
            {GOALS.map((g) => (
              <label key={g.value} style={styles.radioLabel}>
                <input
                  type="radio"
                  name="goal"
                  value={g.value}
                  checked={goal === g.value}
                  onChange={() => setGoal(g.value)}
                />
                {g.label}
              </label>
            ))}
          </fieldset>

          <label style={styles.label}>
            Travel time to gym (minutes)
            <input
              type="number"
              min={0}
              max={120}
              value={gymTravelMinutes}
              onChange={(e) => setGymTravelMinutes(e.target.value)}
              style={styles.input}
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Creating your plan…" : "Get my plan"}
          </button>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    padding: "2rem 1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    maxWidth: "420px",
    width: "100%",
    background: "#fff",
    borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    padding: "2rem",
  },
  title: {
    margin: "0 0 0.25rem",
    fontSize: "1.75rem",
    fontWeight: 700,
  },
  subtitle: {
    margin: "0 0 1.5rem",
    color: "#666",
    fontSize: "0.95rem",
  },
  form: { display: "flex", flexDirection: "column", gap: "1rem" },
  label: { display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem" },
  input: {
    padding: "0.6rem 0.75rem",
    border: "1px solid #ccc",
    borderRadius: "8px",
  },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" },
  fieldset: { border: "1px solid #ccc", borderRadius: "8px", padding: "0.75rem" },
  legend: { fontSize: "0.9rem", padding: "0 0.25rem" },
  radioLabel: { display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" },
  error: { color: "#c00", fontSize: "0.9rem", margin: 0 },
  button: {
    marginTop: "0.5rem",
    padding: "0.75rem 1.25rem",
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: "pointer",
  },
};
