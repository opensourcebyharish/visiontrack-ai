import { useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Analytics } from "./pages/Analytics";
import { History } from "./pages/History";
import { LiveDetection } from "./pages/LiveDetection";
import { Overview } from "./pages/Overview";
import { SettingsPage } from "./pages/SettingsPage";
import { VideoAnalysis } from "./pages/VideoAnalysis";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Overview",
    subtitle: "Real-time detection, tracking and counting at a glance",
  },
  "/live": {
    title: "Live Detection",
    subtitle: "Run YOLO inference on a webcam with ByteTrack IDs",
  },
  "/video": {
    title: "Video Analysis",
    subtitle: "Upload a video and export the annotated result with analytics",
  },
  "/analytics": {
    title: "Analytics",
    subtitle: "Class distribution, event trends and session comparisons",
  },
  "/history": {
    title: "Detection History",
    subtitle: "Browse stored sessions and detection events",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Detection, performance and retention configuration",
  },
};

function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const meta = PAGE_META[location.pathname] ?? PAGE_META["/"];

  return (
    <div className="flex min-h-screen bg-base-950">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          onMenu={() => setSidebarOpen((value) => !value)}
        />
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/live" element={<LiveDetection />} />
            <Route path="/video" element={<VideoAnalysis />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </main>
        <footer className="border-t border-base-700 px-4 py-3 text-center text-[11px] text-slate-600 lg:px-6">
          VisionTrack AI · local-first computer vision · YOLO + ByteTrack + FastAPI
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ErrorBoundary>
  );
}
