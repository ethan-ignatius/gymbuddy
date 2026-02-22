import GlassSurface from "./GlassSurface";

type Props = { calendarAuthUrl: string };

export default function SignupSuccess({ calendarAuthUrl }: Props) {
  return (
    <div style={s.wrapper}>
      <GlassSurface
        width="100%"
        height="auto"
        borderRadius={20}
        brightness={50}
        opacity={0.93}
        blur={11}
        backgroundOpacity={0}
        saturation={1}
        className="success-card"
      >
        <div style={s.iconWrap}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e8c468" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 style={s.title}>You're in.</h1>
        <p style={s.message}>
          One last step — connect Google Calendar so GymBuddy can find your
          free slots and never book over your existing plans.
        </p>

        <a
          href={calendarAuthUrl}
          style={s.calBtn}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 24px rgba(66,133,244,0.35)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 12px rgba(66,133,244,0.2)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M18.316 5.684H24v12.632h-5.684z" />
            <path fill="#34A853" d="M5.684 18.316v5.684H18.316l2.842-5.684z" />
            <path fill="#EA4335" d="M0 18.316l5.684 5.684V18.316z" />
            <path fill="#FBBC04" d="M24 5.684L18.316 0H5.684L0 5.684z" />
            <path fill="#1A73E8" d="M0 5.684v12.632h5.684V5.684z" />
            <path fill="#185FC2" d="M5.684 0v5.684H18.316L24 0z" />
            <rect x="6.5" y="9.5" width="11" height="7" fill="white" />
            <path fill="#1A73E8" d="M12 10.8c.9 0 1.5.5 1.7 1.1l-.9.5c-.1-.4-.4-.6-.8-.6-.7 0-1.2.6-1.2 1.4s.5 1.4 1.2 1.4c.5 0 .9-.3 1-.7h-1v-.8h1.9c0 .1.1.3.1.5 0 1.1-.7 1.9-2 1.9-1.2 0-2.1-.9-2.1-2.3s.9-2.4 2.1-2.4z" />
          </svg>
          Connect Google Calendar
        </a>

        <div style={s.hint}>
          <span style={s.hintIcon}>💬</span>
          <p style={s.hintText}>
            After connecting, we'll text you to set up your workout schedule —
            days, times, and intensity — all over SMS.
          </p>
        </div>
      </GlassSurface>

      <style>{css}</style>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
  .success-card {
    max-width: 440px;
    width: 100%;
    text-align: center;
  }
  .success-card .glass-surface__content {
    padding: 2.5rem;
    flex-direction: column;
    align-items: stretch;
  }
`;

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
    fontFamily: "'DM Sans', sans-serif",
  },
  iconWrap: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: "rgba(232,196,104,0.1)",
    border: "1px solid rgba(232,196,104,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 1.5rem",
  },
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "2.8rem",
    letterSpacing: "0.03em",
    color: "#f0ede6",
    margin: "0 0 0.75rem",
  },
  message: {
    color: "#888",
    fontSize: "0.9rem",
    lineHeight: 1.7,
    margin: "0 0 2rem",
    maxWidth: "320px",
    marginLeft: "auto",
    marginRight: "auto",
  },
  calBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.8rem 1.5rem",
    background: "#fff",
    color: "#1a1a1a",
    borderRadius: "8px",
    fontWeight: 600,
    textDecoration: "none",
    fontSize: "0.9rem",
    fontFamily: "'DM Sans', sans-serif",
    transition: "box-shadow 0.2s, transform 0.2s",
    boxShadow: "0 4px 12px rgba(66,133,244,0.2)",
    marginBottom: "1.75rem",
  },
  hint: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "10px",
    padding: "1rem",
    textAlign: "left" as const,
  },
  hintIcon: { fontSize: "1.1rem", flexShrink: 0, marginTop: "1px" },
  hintText: { fontSize: "0.82rem", color: "#6b6760", lineHeight: 1.6, margin: 0 },
};