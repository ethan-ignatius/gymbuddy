import { useNavigate } from "react-router-dom";
import Plasma from "../components/Plasma";
import SpotlightCard from "../components/SpotlightCard";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.root}>
      <div style={styles.plasmaWrap}>
        <Plasma
          color="#e8c468"
          speed={1.0}
          direction="forward"
          scale={1.5}
          opacity={0.85}
          mouseInteractive={false}
        />
      </div>

      <div style={styles.overlay} />

      <nav style={styles.nav}>
        <span style={styles.logo}>GB</span>
        <button onClick={() => navigate("/signup")} style={styles.navBtn}>
          Sign up
        </button>
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
              "0 8px 32px rgba(232,196,104,0.45)";
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
            <SpotlightCard
              key={f.title}
              className="feature-card"
              spotlightColor="rgba(232,196,104,0.15)"
            >
              <div style={styles.featureInner}>
                <span style={styles.featureIcon}>{f.icon}</span>
                <div>
                  <div style={styles.featureTitle}>{f.title}</div>
                  <div style={styles.featureDesc}>{f.desc}</div>
                </div>
              </div>
            </SpotlightCard>
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
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .feature-card {
    border-color: rgba(232,196,104,0.12) !important;
    background-color: rgba(10,10,10,0.6) !important;
    border-radius: 0.75rem !important;
    padding: 1rem 1.25rem !important;
    backdrop-filter: blur(12px);
  }
`;

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#f0ede6",
    fontFamily: "'DM Sans', sans-serif",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  plasmaWrap: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "linear-gradient(to bottom, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.75) 100%)",
    zIndex: 1,
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.5rem 2.5rem",
    position: "relative",
    zIndex: 10,
    borderBottom: "1px solid rgba(232,196,104,0.1)",
  },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "1.6rem",
    letterSpacing: "0.1em",
    color: "#e8c468",
  },
  navBtn: {
    background: "transparent",
    border: "1px solid rgba(232,196,104,0.4)",
    color: "#e8c468",
    padding: "0.4rem 1.1rem",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.85rem",
    letterSpacing: "0.05em",
    fontFamily: "'DM Sans', sans-serif",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "4rem 2.5rem 2rem",
    maxWidth: "780px",
    margin: "0 auto",
    width: "100%",
    position: "relative",
    zIndex: 10,
  },
  tag: {
    fontSize: "0.75rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "#e8c468",
    border: "1px solid rgba(232,196,104,0.3)",
    padding: "0.3rem 0.75rem",
    borderRadius: "2px",
    marginBottom: "1.75rem",
    animation: "fadeUp 0.6s ease 0.1s both",
  },
  headline: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "clamp(4rem, 12vw, 8rem)",
    lineHeight: 0.95,
    letterSpacing: "0.02em",
    margin: "0 0 1.5rem",
    animation: "fadeUp 0.6s ease 0.2s both",
  },
  accent: { color: "#e8c468" },
  sub: {
    fontSize: "1.05rem",
    lineHeight: 1.7,
    color: "#b0aca5",
    maxWidth: "480px",
    margin: "0 0 2.5rem",
    fontWeight: 300,
    animation: "fadeUp 0.6s ease 0.35s both",
  },
  primaryBtn: {
    background: "#e8c468",
    color: "#0a0a0a",
    border: "none",
    padding: "0.85rem 2rem",
    borderRadius: "4px",
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.02em",
    transition: "transform 0.2s, box-shadow 0.2s",
    boxShadow: "0 4px 16px rgba(232,196,104,0.2)",
    marginBottom: "4rem",
    animation: "fadeUp 0.6s ease 0.5s both",
  },
  features: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
    width: "100%",
    animation: "fadeUp 0.6s ease 0.65s both",
  },
  featureInner: {
    display: "flex",
    alignItems: "flex-start",
    gap: "1rem",
  },
  featureIcon: { fontSize: "1.4rem", marginTop: "2px", flexShrink: 0 },
  featureTitle: { fontWeight: 500, fontSize: "0.95rem", marginBottom: "0.2rem", color: "#f0ede6" },
  featureDesc: { fontSize: "0.85rem", color: "#6b6760", lineHeight: 1.5 },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    padding: "1rem 2.5rem",
    fontSize: "0.75rem",
    color: "#3a3a3a",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    position: "relative",
    zIndex: 10,
  },
};