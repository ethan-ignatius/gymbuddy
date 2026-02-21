import { useState } from "react";
import SignupForm from "../components/SignupForm";
import SignupSuccess from "../components/SignupSuccess";

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

  if (calendarAuthUrl) {
    return <SignupSuccess calendarAuthUrl={calendarAuthUrl} />;
  }
  return <SignupForm onSubmit={handleSubmit} />;
}
