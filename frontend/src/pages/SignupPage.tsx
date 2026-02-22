import { useState } from "react";
import SignupForm from "../components/SignupForm";
import SignupSuccess from "../components/SignupSuccess";
import LiquidEther from "../components/LiquidEther";

export type SignupPayload = {
  email: string;
  phoneNumber: string;
  carrier: string;
  heightCm: number;
  weightKg: number;
  goal: "lose_fat" | "strength_and_size" | "strength_without_size";
  gymTravelMinutes: number;
};

export default function SignupPage() {
  const [calendarAuthUrl, setCalendarAuthUrl] = useState<string | null>(null);

  const handleSubmit = async (payload: SignupPayload) => {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message ?? data.error ?? `Request failed: ${res.status}`);
    }
    setCalendarAuthUrl(data.calendarAuthUrl);
  };

  return (
    <div style={s.root}>
      {/* shared plasma background */}
      <div style={s.plasma}>
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
      <div style={s.overlay} />

      {/* page content */}
      <div style={s.content}>
        {calendarAuthUrl
          ? <SignupSuccess calendarAuthUrl={calendarAuthUrl} />
          : <SignupForm onSubmit={handleSubmit} />
        }
      </div>
    </div>
  );
}

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
};