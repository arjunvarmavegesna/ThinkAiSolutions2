/**
 * Self-serve signup: email/password or Google. On success the user is provisioned (their own
 * tenant + tenant_admin) and sent to /dashboard; they attach their WhatsApp number from the
 * console top bar (WabaStatusBadge — "Continue with Facebook").
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';

import { isDisposableEmail } from '@thinkai/shared';

import { useAuth } from '../auth/useAuth';
import { landingPathForRole } from '../auth/ProtectedRoute';
import GoogleIcon from '../components/GoogleIcon';
import MicrosoftIcon from '../components/MicrosoftIcon';
import { ApiError } from '../lib/apiClient';

/** Map raw Firebase auth error codes to a friendly line. */
function friendlyAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The sign-in was cancelled.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Contact your administrator.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Sign-up failed. Please try again.';
  }
}

export function Signup(): JSX.Element {
  const { user, role, loading, signUpWithEmail, signInWithGoogle, signInWithMicrosoft, provision } =
    useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const started = useRef(false);

  // If someone visits /signup while already signed in AND provisioned, send them to their app.
  useEffect(() => {
    if (!loading && user && role && !started.current) {
      navigate(landingPathForRole(role), { replace: true });
    }
  }, [loading, user, role, navigate]);

  async function handleEmailSignup(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const trimmed = email.trim();
    if (isDisposableEmail(trimmed)) {
      setError('Disposable email addresses are not allowed. Please use a permanent email.');
      return;
    }
    started.current = true;
    setSubmitting(true);
    try {
      await signUpWithEmail(trimmed, password);
      await provision();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      started.current = false;
      setError(err instanceof ApiError ? err.message : friendlyAuthError(err));
      setSubmitting(false);
    }
  }

  async function handleGoogle(): Promise<void> {
    if (submitting) return;
    setError(null);
    started.current = true;
    setSubmitting(true);
    try {
      await signInWithGoogle();
      await provision();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      started.current = false;
      setError(err instanceof ApiError ? err.message : friendlyAuthError(err));
      setSubmitting(false);
    }
  }

  async function handleMicrosoft(): Promise<void> {
    if (submitting) return;
    setError(null);
    started.current = true;
    setSubmitting(true);
    try {
      await signInWithMicrosoft();
      await provision();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      started.current = false;
      setError(err instanceof ApiError ? err.message : friendlyAuthError(err));
      setSubmitting(false);
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
          <p className="mt-1 text-sm text-muted-foreground">Create your WhatsApp Business account</p>
        </div>

        <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-md">
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

          <form onSubmit={handleEmailSignup} className="space-y-4">
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
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className={`${inputBase} pr-10`}
                  placeholder="At least 6 characters"
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

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
