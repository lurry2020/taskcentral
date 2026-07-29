import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { ToastProvider } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { LoginScreen } from "@/components/LoginScreen";
import { LoadingState } from "@/components/ui/State";
import { AuthProvider, useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { clearToken } from "@/lib/authToken";
import { SetupPage } from "@/pages/Setup";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

function AuthGate() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading…" />
      </div>
    );
  }
  return status === "authed" ? <App /> : <LoginScreen />;
}

function FirstRunGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const [setupStatus, setSetupStatus] = useState<{
    completed: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    setSetupStatus(null);
    try {
      const status = await api.get<{
        completed: boolean;
        required: boolean;
      }>("/setup/status");
      setSetupStatus(status);
    } catch (err) {
      setError((err as Error).message || "Could not check setup status.");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (setupStatus?.completed === false && location.pathname !== "/setup") {
      navigate("/setup", { replace: true });
    } else if (setupStatus?.completed === true && location.pathname === "/setup") {
      navigate("/", { replace: true });
    }
  }, [location.pathname, navigate, setupStatus?.completed]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm rounded-2xl bg-surface/95 p-6 text-center shadow-(--shadow-card) ring-1 ring-line">
          <p className="text-sm font-medium">Task Central could not check its setup status.</p>
          <p className="mt-1 text-xs text-muted">{error}</p>
          <Button className="mt-4" onClick={() => void loadStatus()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (setupStatus === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading…" />
      </div>
    );
  }

  if (!setupStatus.completed) {
    return (
      <SetupPage
        onComplete={() => {
          clearToken();
          queryClient.clear();
          navigate("/", { replace: true });
          setSetupStatus({ completed: true });
        }}
      />
    );
  }

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <FirstRunGate />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
