import { useState } from "react";
import SignupForm from "../components/SignupForm";
import SignupSuccess from "../components/SignupSuccess";

export type SignupPayload = {
  email: string;
  phoneNumber: string;
  heightCm: number;
  weightKg: number;
  goal: "lose_fat" | "strength_and_size" | "strength_without_size";
  gymTravelMinutes: number;
};

type SignupResult = {
  calendarAuthUrl: string;
  scheduled: number;
};

export default function SignupPage() {
  const [result, setResult] = useState<SignupResult | null>(null);

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
    setResult({
      calendarAuthUrl: data.calendarAuthUrl,
      scheduled: data.scheduled,
    });
  };

  if (result) {
    return (
      <SignupSuccess
        calendarAuthUrl={result.calendarAuthUrl}
        scheduled={result.scheduled}
      />
    );
  }
  return <SignupForm onSubmit={handleSubmit} />;
}
