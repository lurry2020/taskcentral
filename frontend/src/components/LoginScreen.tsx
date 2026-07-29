import { useState } from "react";
import { ArrowLeft, KeyRound, ListChecks, Loader2, Lock, LogIn, Terminal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 401
          ? "Invalid username or password."
          : (err as Error).message || "Could not sign in.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-b from-accent to-accent-deep text-white shadow-[0_1px_0_0_#ffffff33_inset,0_6px_16px_-6px_var(--color-accent)]">
            <ListChecks className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-3 text-lg font-semibold tracking-tight">Task Central</h1>
          <p className="mt-0.5 text-xs text-muted">
            {showRecovery ? "Reset your password" : "Sign in to continue"}
          </p>
        </div>

        {showRecovery ? (
          <div className="space-y-4 rounded-2xl bg-surface/95 p-6 shadow-(--shadow-card) ring-1 ring-line">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
                <KeyRound className="h-4.5 w-4.5" aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Reset from the server</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  For security, Task Central does not reset passwords by email. Open a terminal on
                  the server that runs Task Central.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-muted">
                From the Task Central directory, run:
              </p>
              <div className="overflow-x-auto rounded-lg bg-surface-3 p-3 ring-1 ring-inset ring-line">
                <code className="block whitespace-nowrap font-mono text-[0.7rem] text-text">
                  docker compose exec backend python -m app.cli setpassword
                </code>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                Enter and confirm the new password at the prompts. The change takes effect
                immediately for new sign-ins.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-xs leading-relaxed text-info ring-1 ring-inset ring-info/20">
              <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              If you do not have server access, contact the person who manages this installation.
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowRecovery(false)}
              autoFocus
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to sign in
            </Button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl bg-surface/95 p-6 shadow-(--shadow-card) ring-1 ring-line"
          >
            <FormField label="Username" htmlFor="login-user">
              <Input
                id="login-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                placeholder="username"
              />
            </FormField>
            <FormField label="Password" htmlFor="login-pass">
              <Input
                id="login-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </FormField>

            <button
              type="button"
              className="block w-full text-center text-xs font-medium text-muted transition-colors hover:text-text focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              onClick={() => {
                setError(null);
                setShowRecovery(true);
              }}
            >
              Forgot password?
            </button>

            {error && (
              <div
                className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-hover ring-1 ring-inset ring-accent/25"
                role="alert"
              >
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={busy || !username.trim() || !password}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden />
              )}
              Sign in
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
