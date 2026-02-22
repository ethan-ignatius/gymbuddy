import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import Plasma from "../components/Plasma";
import SpotlightCard from "../components/SpotlightCard";

export default function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message ?? data.error ?? `Request failed: ${res.status}`);
            }

            if (data.user) {
                localStorage.setItem("gymbuddyUser", JSON.stringify(data.user));
            }
            navigate("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.root}>
            <div style={s.plasma}>
                <Plasma
                    color="#e8c468"
                    speed={1.0}
                    direction="forward"
                    scale={1.5}
                    opacity={0.6}
                    mouseInteractive={false}
                />
            </div>
            <div style={s.overlay} />

            <div style={s.content}>
                <div style={s.wrapper}>
                    <a href="/" style={s.back}>{"<- Back"}</a>

                    <SpotlightCard className="login-card" spotlightColor="rgba(232,196,104,0.1)">
                        <div style={s.header}>
                            <span style={s.logo}>GB</span>
                            <h1 style={s.title}>Welcome back</h1>
                            <p style={s.subtitle}>
                                Enter your email to get to your dashboard.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} style={s.form}>
                            <div style={s.field}>
                                <label style={s.label}>Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    style={s.input}
                                    onFocus={(e) => { e.currentTarget.style.borderColor = "#e8c468"; }}
                                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                                />
                            </div>

                            {error && <div style={s.errorBox}>{error}</div>}

                            <button
                                type="submit"
                                disabled={loading}
                                style={{ ...s.submit, ...(loading ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
                            >
                                {loading ? "Logging in..." : "Log in →"}
                            </button>
                        </form>

                        <p style={s.switchText}>
                            Don't have an account?{" "}
                            <a href="/signup" style={s.switchLink}>Sign up</a>
                        </p>
                    </SpotlightCard>
                </div>
            </div>

            <style>{css}</style>
        </div>
    );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
  .login-card {
    border-color: rgba(232,196,104,0.12) !important;
    background-color: rgba(14,14,14,0.85) !important;
    border-radius: 1.25rem !important;
    padding: 2.5rem !important;
    backdrop-filter: blur(20px) !important;
    max-width: 440px;
    width: 100%;
  }
  input::placeholder { color: #444; }
`;

const s: Record<string, React.CSSProperties> = {
    root: {
        minHeight: "100vh",
        background: "#0a0a0a",
        position: "relative",
        overflow: "hidden",
    },
    plasma: { position: "fixed", inset: 0, zIndex: 0 },
    overlay: {
        position: "fixed",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(10,10,10,0.65) 0%, rgba(10,10,10,0.8) 100%)",
        zIndex: 1,
    },
    content: { position: "relative", zIndex: 10 },
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
        marginLeft: "calc(50% - 220px)",
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
    form: { display: "flex", flexDirection: "column", gap: "1.25rem" },
    field: { display: "flex", flexDirection: "column", gap: "0.35rem" },
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
        transition: "border-color 0.15s",
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
        transition: "opacity 0.15s",
    },
    switchText: {
        color: "#555",
        fontSize: "0.82rem",
        textAlign: "center",
        marginTop: "1.5rem",
    },
    switchLink: {
        color: "#e8c468",
        textDecoration: "none",
        fontWeight: 500,
    },
};
