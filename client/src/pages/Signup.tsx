/**
 * Self-serve signup: email/password or Google. On success the user is provisioned (their own
 * tenant + tenant_admin) and sent to /dashboard; they attach their WhatsApp number from the
 * console top bar (WabaStatusBadge — "Continue with Facebook").
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { isDisposableEmail } from '@thinkai/shared';

import { useAuth } from '../auth/useAuth';
import { landingPathForRole } from '../auth/ProtectedRoute';
import GoogleIcon from '../components/GoogleIcon';
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
      return 'The Google sign-in was cancelled.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Sign-up failed. Please try again.';
  }
}

export function Signup(): JSX.Element {
  const { user, role, loading, signUpWithEmail, signInWithGoogle, provision } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
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
          <h1 className="text-xl font-semibold text-slate-900">ThinkAiSolutions</h1>
          <p className="mt-1 text-sm text-slate-500">Create your WhatsApp Business account</p>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
                placeholder="At least 6 characters"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </form>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-emerald-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
