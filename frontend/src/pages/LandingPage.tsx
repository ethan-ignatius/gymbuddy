import { useNavigate } from "react-router-dom";
import LiquidEther from "../components/LiquidEther";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.root}>
      <div style={styles.etherWrap}>
        <LiquidEther
          colors={["#e8c468", "#d4600a", "#f5a623", "#b05c2b", "#ffe8a0"]}
          mouseForce={28}
          cursorSize={120}
          autoDemo={true}
          autoSpeed={0.45}
          autoIntensity={2.4}
          resolution={0.5}
          BFECC={true}
        />
      </div>

      <div style={styles.overlay} />

      <nav style={styles.nav}>
        <span style={styles.logo}>GB</span>
        <div style={styles.navRight}>
          <button onClick={() => navigate("/login")} style={styles.navBtnText}>
            Log in
          </button>
          <button onClick={() => navigate("/signup")} style={styles.navBtn}>
            Sign up
          </button>
        </div>
      </nav>

      <main style={styles.main}>
        <div style={styles.tag}>AI-powered gym coaching</div>

        <h1 style={styles.headline}>
          Your gym.
          <br />
          <span style={styles.accent}>Planned.</span>
        </h1>

        <p style={styles.sub}>
          GymBuddy builds your workout schedule around your life — no conflicts,
          no guesswork. Real-time pose tracking keeps your form sharp. SMS
          reminders keep you showing up.
        </p>

        <button
          onClick={() => navigate("/signup")}
          style={styles.primaryBtn}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 8px 32px rgba(232,196,104,0.5)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 4px 16px rgba(232,196,104,0.2)";
          }}
        >
          Get started free →
        </button>

        <div style={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.title} style={styles.glassCard}>
              <div style={styles.featureInner}>
                <span style={styles.featureIcon}>{f.icon}</span>
                <div>
                  <div style={styles.featureTitle}>{f.title}</div>
                  <div style={styles.featureDesc}>{f.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer style={styles.footer}>
        <span>GymBuddy © 2026</span>
        <span style={{ color: "#555" }}>Hackalytics 2026</span>
      </footer>

      <style>{fonts}</style>
    </div>
  );
}

const FEATURES = [
  { icon: "📅", title: "Smart scheduling", desc: "Syncs with Google Calendar. Never double-books." },
  { icon: "🦾", title: "Pose tracking", desc: "MediaPipe AI watches your form in real time." },
  { icon: "💬", title: "SMS coach", desc: "Text to reschedule, confirm, or get hyped." },
];

const fonts = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#080808",
    color: "#f0ede6",
    fontFamily: "'DM Sans', sans-serif",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  etherWrap: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "linear-gradient(160deg, rgba(8,8,8,0.12) 0%, rgba(8,8,8,0.28) 100%)",
    zIndex: 1,
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem 2rem",
    position: "relative",
    zIndex: 10,
    borderBottom: "1px solid rgba(232,196,104,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    background: "rgba(8,8,8,0.12)",
  },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.4rem",
    letterSpacing: "0.1em",
    color: "#e8c468",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
  },
  navBtn: {
    background: "transparent",
    border: "1px solid rgba(232,196,104,0.4)",
    color: "#e8c468",
    padding: "0.35rem 0.95rem",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.8rem",
    letterSpacing: "0.05em",
    fontFamily: "'DM Sans', sans-serif",
  },
  navBtnText: {
    background: "transparent",
    border: "none",
    color: "#b0aca5",
    cursor: "pointer",
    fontSize: "0.8rem",
    letterSpacing: "0.05em",
    fontFamily: "'DM Sans', sans-serif",
    padding: "0.35rem 0.45rem",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "2rem 2rem 1rem",
    maxWidth: "560px",
    margin: "0 auto",
    width: "100%",
    position: "relative",
    zIndex: 10,
  },
  tag: {
    fontSize: "0.68rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "#e8c468",
    border: "1px solid rgba(232,196,104,0.3)",
    padding: "0.25rem 0.65rem",
    borderRadius: "2px",
    marginBottom: "1.4rem",
    animation: "fadeUp 0.6s ease 0.1s both",
    background: "rgba(232,196,104,0.06)",
    backdropFilter: "blur(6px)",
  },
  headline: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "clamp(2.4rem, 7vw, 5rem)",
    lineHeight: 0.95,
    letterSpacing: "0.02em",
    margin: "0 0 1.25rem",
    animation: "fadeUp 0.6s ease 0.2s both",
  },
  accent: { color: "#e8c468" },
  sub: {
    fontSize: "0.85rem",
    lineHeight: 1.7,
    color: "#b0aca5",
    maxWidth: "420px",
    margin: "0 0 2rem",
    fontWeight: 300,
    animation: "fadeUp 0.6s ease 0.35s both",
    textAlign: "left",
  },
  primaryBtn: {
    background: "#e8c468",
    color: "#0a0a0a",
    border: "none",
    padding: "0.6rem 1.4rem",
    borderRadius: "4px",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.02em",
    transition: "transform 0.2s, box-shadow 0.2s",
    boxShadow: "0 4px 16px rgba(232,196,104,0.2)",
    marginBottom: "2.5rem",
    animation: "fadeUp 0.6s ease 0.5s both",
  },
  features: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.65rem",
    width: "100%",
    animation: "fadeUp 0.6s ease 0.65s both",
  },
  glassCard: {
    position: "relative",
    borderRadius: "0.75rem",
    padding: "0.75rem 1rem",
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(20px) saturate(1.6)",
    WebkitBackdropFilter: "blur(20px) saturate(1.6)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 2px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  featureInner: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.85rem",
    textAlign: "left" as const,
    position: "relative",
    zIndex: 1,
  },
  featureIcon: { fontSize: "1.2rem", marginTop: "2px", flexShrink: 0 },
  featureTitle: { fontWeight: 500, fontSize: "0.88rem", marginBottom: "0.15rem", color: "#f0ede6", textAlign: "left" as const },
  featureDesc: { fontSize: "0.78rem", color: "#7a7672", lineHeight: 1.5, textAlign: "left" as const },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    padding: "0.75rem 2rem",
    fontSize: "0.7rem",
    color: "#3a3a3a",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    position: "relative",
    zIndex: 10,
    backdropFilter: "blur(8px)",
    background: "rgba(8,8,8,0.1)",
  }
};