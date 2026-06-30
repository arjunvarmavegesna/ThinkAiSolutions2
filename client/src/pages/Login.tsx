/**
 * Email/password sign-in page.
 *
 * On success, `onIdTokenChanged` (in AuthProvider) updates auth state; this
 * component then redirects to wherever the user was originally headed (the
 * `from` location captured by ProtectedRoute) or to their role's landing page.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { landingPathForRole } from '../auth/ProtectedRoute';
import { auth } from '../lib/firebase';
import GoogleIcon from '../components/GoogleIcon';
import MicrosoftIcon from '../components/MicrosoftIcon';

/** Location.state we may receive from ProtectedRoute's redirect. */
interface FromState {
  from?: { pathname?: string };
}

/** Map raw Firebase auth error codes/messages to a friendly line. */
function friendlyAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The sign-in was cancelled.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Contact your administrator.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

export function Login(): JSX.Element {
  const { user, role, loading, login, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Where to go once authenticated: the originally-requested page, else role home.
  const fromPath = (location.state as FromState | null)?.from?.pathname;

  // If already signed in (e.g. visiting /login directly), bounce to the app.
  useEffect(() => {
    if (!loading && user) {
      navigate(fromPath ?? landingPathForRole(role), { replace: true });
    }
  }, [loading, user, role, fromPath, navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Redirect is handled by the effect above once auth state updates.
    } catch (err) {
      setError(friendlyAuthError(err));
      setSubmitting(false);
    }
  }

  // Google sign-in for EXISTING users — no provisioning (they already have a tenant from
  // signup). The redirect effect above takes over once auth state updates.
  async function handleGoogle(): Promise<void> {
    if (submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(friendlyAuthError(err));
      setSubmitting(false);
    }
  }

  // Microsoft sign-in for EXISTING users (same flow as Google — no provisioning).
  async function handleMicrosoft(): Promise<void> {
    if (submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await signInWithMicrosoft();
    } catch (err) {
      setError(friendlyAuthError(err));
      setSubmitting(false);
    }
  }

  // Send a Firebase password-reset email to the address currently typed in.
  async function handleForgotPassword(): Promise<void> {
    if (resetting) return;
    setError(null);
    setNotice(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email above, then tap “Forgot password?”.');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setNotice(`Password reset link sent to ${trimmed}.`);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setResetting(false);
    }
  }

  const socialBtn =
    'flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-xs transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60';
  const inputBase =
    'w-full rounded-lg border border-border bg-card py-2.5 pl-10 text-sm text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:bg-muted/50';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <img
              src="/logo.png?v=2"
              alt="ThinkAiSolutions logo"
              className="h-full w-full object-contain"
              width={56}
              height={56}
            />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">ThinkAiSolutions</h1>
          <p className="mt-1 text-sm text-muted-foreground">WhatsApp Business Platform</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-md"
        >
          <button type="button" onClick={handleGoogle} disabled={submitting} className={socialBtn}>
            <GoogleIcon />
            Continue with Google
          </button>

          <button type="button" onClick={handleMicrosoft} disabled={submitting} className={socialBtn}>
            <MicrosoftIcon />
            Continue with Microsoft
          </button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className={inputBase}
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting || submitting}
                className="text-xs font-medium text-primary transition hover:text-primary-emphasis hover:underline disabled:opacity-60"
              >
                {resetting ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className={`${inputBase} pr-10`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {notice && (
            <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success-emphasis" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
