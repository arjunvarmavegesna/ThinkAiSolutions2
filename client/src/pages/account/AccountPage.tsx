/**
 * Your Account — personal, GitHub/Vercel-style account surface (replaces Settings).
 *
 * What's genuinely wired vs. client-only is deliberate and honest:
 *  - Name + password   -> Firebase Auth (updateProfile / reauth + updatePassword)
 *  - WhatsApp status    -> live GET /api/onboarding/waba-status (tenant)
 *  - Account created    -> real Firebase user metadata
 *  - Phone + notifications -> persisted on this device (no profile API yet)
 *  - Sessions           -> the current device is real; cross-device revocation
 *                          needs a server endpoint, so it's labelled as such.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Monitor,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { getWabaStatus } from '../../api/onboardingApi';
import { PageHeader } from '@/components/patterns/page-header';
import { HealthDot } from '@/components/patterns/health-dot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COUNTRIES, DEFAULT_COUNTRY, countryByCode, isValidNationalNumber } from '@/lib/countries';
import { cn } from '@/lib/utils';

type Status = { tone: 'success' | 'danger'; text: string } | null;

const NOTIF_KEYS = [
  { key: 'campaigns', label: 'Campaign notifications', desc: 'When a campaign starts, finishes, or stalls.' },
  { key: 'templates', label: 'Template approvals', desc: 'When Meta approves or rejects a template.' },
  { key: 'failed', label: 'Failed messages', desc: 'When deliveries fail above your threshold.' },
  { key: 'billing', label: 'Billing notifications', desc: 'Invoices, payment status, and wallet alerts.' },
] as const;

type NotifKey = (typeof NOTIF_KEYS)[number]['key'];

export function AccountPage(): JSX.Element {
  const { user, role, tenantId, logout } = useAuth();
  const uid = user?.uid ?? 'anon';

  // ---------- Profile ----------
  const [name, setName] = useState(user?.displayName ?? '');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY.code);
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<Status>(null);

  useEffect(() => {
    setName(user?.displayName ?? '');
    try {
      const raw = localStorage.getItem(`tai:profile:${uid}`);
      if (raw) {
        const p = JSON.parse(raw) as { countryCode?: string; phone?: string };
        if (p.countryCode) setCountryCode(p.countryCode);
        if (p.phone) setPhone(p.phone);
      }
    } catch {
      /* ignore corrupt local profile */
    }
  }, [uid, user?.displayName]);

  const country = countryByCode(countryCode);
  const phoneValid = phone === '' || isValidNationalNumber(country, phone);

  async function saveProfile(): Promise<void> {
    if (!user) return;
    if (!phoneValid) {
      setProfileStatus({ tone: 'danger', text: `Enter a valid ${country.name} number.` });
      return;
    }
    setSavingProfile(true);
    setProfileStatus(null);
    try {
      if (name.trim() && name.trim() !== user.displayName) {
        await updateProfile(user, { displayName: name.trim() });
      }
      localStorage.setItem(`tai:profile:${uid}`, JSON.stringify({ countryCode, phone }));
      setProfileStatus({ tone: 'success', text: 'Profile saved.' });
    } catch (err) {
      setProfileStatus({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not save profile.' });
    } finally {
      setSavingProfile(false);
    }
  }

  // ---------- Security ----------
  const hasPasswordProvider = useMemo(
    () => user?.providerData.some((p) => p.providerId === 'password') ?? false,
    [user],
  );
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [pwStatus, setPwStatus] = useState<Status>(null);

  async function changePassword(): Promise<void> {
    if (!user?.email) return;
    if (next.length < 8) return setPwStatus({ tone: 'danger', text: 'New password must be at least 8 characters.' });
    if (next !== confirm) return setPwStatus({ tone: 'danger', text: 'New passwords do not match.' });
    setChangingPw(true);
    setPwStatus(null);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setPwStatus({ tone: 'success', text: 'Password changed.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not change password.';
      setPwStatus({ tone: 'danger', text: /wrong-password|invalid-credential/.test(msg) ? 'Current password is incorrect.' : msg });
    } finally {
      setChangingPw(false);
    }
  }

  // ---------- Notifications ----------
  const [notif, setNotif] = useState<Record<NotifKey, boolean>>({
    campaigns: true,
    templates: true,
    failed: true,
    billing: true,
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`tai:notif:${uid}`);
      if (raw) setNotif((n) => ({ ...n, ...(JSON.parse(raw) as Record<NotifKey, boolean>) }));
    } catch {
      /* ignore */
    }
  }, [uid]);
  function toggleNotif(key: NotifKey): void {
    setNotif((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`tai:notif:${uid}`, JSON.stringify(next));
      return next;
    });
  }

  // ---------- Workspace / WhatsApp ----------
  const [waConnected, setWaConnected] = useState<boolean | null>(null);
  useEffect(() => {
    if (role === 'reseller_admin') return; // admin operator has no single WABA
    let active = true;
    void getWabaStatus()
      .then((s) => active && setWaConnected(s.connected))
      .catch(() => active && setWaConnected(false));
    return () => {
      active = false;
    };
  }, [role]);

  const session = useMemo(() => parseUserAgent(), []);
  const createdAt = user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleString('en-IN') : '—';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Your account" description="Manage your profile, security, and how ThinkAiSolutions reaches you." />

      {/* Profile */}
      <Section icon={<UserIcon />} title="Profile information">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback className="text-lg">{(name || user?.email || 'A')[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{name || '—'}</p>
            <p>{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="acc-name">
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Email address" htmlFor="acc-email" hint="Email is managed by sign-in and can't be edited here.">
            <Input id="acc-email" value={user?.email ?? ''} disabled />
          </Field>
        </div>

        <Field
          label="Phone number"
          htmlFor="acc-phone"
          hint={!phoneValid ? undefined : 'Used for account recovery and important alerts.'}
        >
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" type="button" className="shrink-0 gap-1.5 font-normal">
                  <span className="text-base leading-none">{country.flag}</span> +{country.dial}
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
                {COUNTRIES.map((c) => (
                  <DropdownMenuItem key={c.code} onClick={() => setCountryCode(c.code)}>
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="flex-1">{c.name}</span>
                    <span className="text-muted-foreground">+{c.dial}</span>
                    {c.code === countryCode && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              id="acc-phone"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="9876543210"
              className={cn(!phoneValid && 'border-destructive focus-visible:ring-destructive/30')}
            />
          </div>
          {!phoneValid && <p className="mt-1.5 text-xs text-destructive-emphasis">Enter a valid {country.name} number.</p>}
        </Field>

        <FormFooter status={profileStatus}>
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </FormFooter>
      </Section>

      {/* Security */}
      <Section icon={<Shield />} title="Security">
        {hasPasswordProvider ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Current password" htmlFor="pw-cur">
                <Input id="pw-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="New password" htmlFor="pw-new">
                <Input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Confirm password" htmlFor="pw-conf">
                <Input id="pw-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </Field>
            </div>
            <FormFooter status={pwStatus}>
              <Button onClick={changePassword} disabled={changingPw || !current || !next || !confirm}>
                {changingPw ? <Loader2 className="animate-spin" /> : <Lock />}
                Change password
              </Button>
            </FormFooter>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            You sign in with Google, so there's no password to manage here. Manage security from your Google account.
          </p>
        )}
      </Section>

      {/* Notifications */}
      <Section icon={<Bell />} title="Notifications">
        <div className="divide-y divide-border">
          {NOTIF_KEYS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch checked={notif[key]} onCheckedChange={() => toggleNotif(key)} aria-label={label} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Saved on this device.</p>
      </Section>

      {/* Active sessions */}
      <Section icon={<Monitor />} title="Active sessions">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-muted-foreground">
              <Monitor className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {session.os} · {session.browser} <Badge variant="success" className="ml-1">This device</Badge>
              </p>
              <p className="text-xs text-muted-foreground">Active now</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
        <Separator className="my-4" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            We only track your current device today. Signing out everywhere revokes other sessions once the server
            sessions API is enabled.
          </p>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Log out of all devices
          </Button>
        </div>
      </Section>

      {/* Workspace */}
      <Section icon={<Building2 />} title="Workspace information">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="Workspace ID" value={tenantId ?? (role === 'reseller_admin' ? 'Platform (all tenants)' : '—')} mono={!!tenantId} />
          <Detail label="Account created" value={createdAt} />
          <Detail label="Email verified">
            {user?.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Unverified</Badge>}
          </Detail>
          {role !== 'reseller_admin' && (
            <Detail label="WhatsApp status">
              {waConnected === null ? (
                <span className="text-sm text-muted-foreground">Checking…</span>
              ) : (
                <HealthDot status={waConnected ? 'healthy' : 'pending'} showLabel label={waConnected ? 'Connected' : 'Not connected'} />
              )}
            </Detail>
          )}
        </dl>
      </Section>
    </div>
  );
}

/* ---------- small building blocks ---------- */

function Section({ icon, title, children }: { icon: JSX.Element; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FormFooter({ status, children }: { status: Status; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      {children}
      {status && (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-sm',
            status.tone === 'success' ? 'text-success-emphasis' : 'text-destructive-emphasis',
          )}
        >
          {status.tone === 'success' && <Check className="size-4" />}
          {status.text}
        </span>
      )}
    </div>
  );
}

function Detail({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: React.ReactNode }): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-sm text-foreground', mono && 'font-mono')}>{children ?? value ?? '—'}</dd>
    </div>
  );
}

/** Best-effort OS + browser from the UA string (display only). */
function parseUserAgent(): { os: string; browser: string } {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  return { os, browser };
}
