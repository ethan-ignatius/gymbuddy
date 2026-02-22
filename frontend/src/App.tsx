import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignupPage from "./pages/SignupPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import LiveSessionPage from "./pages/LiveSessionPage";
import AnalyticsPage from "./pages/AnalyticsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/live-session" element={<LiveSessionPage />} />
      <Route path="/pose-tracker" element={<Navigate to="/live-session" replace />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
    </Routes>
  );
}