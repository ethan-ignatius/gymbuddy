type Props = {
  calendarAuthUrl: string;
  scheduled: number;
};

export default function SignupSuccess({ calendarAuthUrl, scheduled }: Props) {
  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.icon}>✓</div>
        <h1 style={styles.title}>You're all set</h1>
        <p style={styles.message}>
          I've generated your workout plan and scheduled <strong>{scheduled} workouts</strong> for
          next week. I'll text you before each one so you leave on time.
        </p>

        <a href={calendarAuthUrl} style={styles.calendarButton}>
          Connect Google Calendar
        </a>
        <p style={styles.hint}>
          Link your calendar so I can find your free slots and add gym events automatically.
        </p>
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
    textAlign: "center",
  },
  icon: {
    width: "48px",
    height: "48px",
    margin: "0 auto 1rem",
    background: "#22c55e",
    color: "#fff",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    fontWeight: 700,
  },
  title: {
    margin: "0 0 0.75rem",
    fontSize: "1.5rem",
    fontWeight: 700,
  },
  message: {
    margin: "0 0 1.5rem",
    color: "#555",
    lineHeight: 1.6,
  },
  calendarButton: {
    display: "inline-block",
    padding: "0.75rem 1.5rem",
    background: "#4285f4",
    color: "#fff",
    borderRadius: "8px",
    fontWeight: 600,
    textDecoration: "none",
    fontSize: "0.95rem",
  },
  hint: {
    marginTop: "0.75rem",
    fontSize: "0.85rem",
    color: "#888",
  },
};
