import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { Alert, Badge, PageHeader, Spinner, TextField, usePageTitle } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { errorMessage } from '../lib/api';
import { ROLE_LABEL, ROLE_TONE } from '../lib/format';
import { SITE_NAME } from '../lib/site';
import { safeNextPath, schemas, validate, type FieldErrors } from '../lib/validation';
import { t } from '../lib/i18n';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.2v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4.1-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.2 6.6l4.1 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
      />
    </svg>
  );
}

export default function Login() {
  usePageTitle(t('Sign in'));
  const { profile, loading, signIn, signUp, googleSignIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const idle = params.get('reason') === 'idle';

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [values, setValues] = useState({ full_name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const home = profile ? (profile.role === 'buyer' ? '/buyer' : '/admin') : '/buyer';

  // After a sign-in on this page (email or Google), or when arriving with a
  // destination, continue to it. The server decides the role, so a buyer sent
  // to an admin address simply lands on the buyer portal.
  useEffect(() => {
    if (!profile || loading) return;
    if (attempted || next) navigate(safeNextPath(next, home), { replace: true });
  }, [profile, loading, attempted, next, home, navigate]);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    setNotice(null);

    const result =
      mode === 'signup'
        ? validate(schemas.signup, values)
        : validate(schemas.login, { email: values.email, password: values.password });
    if (!result.ok) {
      setErrors(result.errors);
      const first = ['full_name', 'email', 'password'].find((key) => result.errors[key]);
      if (first) document.getElementById(`login-${first}`)?.focus();
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const outcome = await signUp(values.full_name.trim(), result.data.email, values.password);
        if (outcome.needsConfirmation) {
          setNotice(
            t("Almost there. We sent a confirmation link to {0}. Open it, then sign in here.", [result.data.email]),
          );
          setMode('signin');
          setValues((current) => ({ ...current, password: '' }));
          return;
        }
      } else {
        await signIn(result.data.email, values.password);
      }
      setAttempted(true);
    } catch (err) {
      setFailure(errorMessage(err, 'We could not sign you in. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const google = () => {
    setFailure(null);
    setNotice(null);
    const opened = googleSignIn();
    if (opened) setAttempted(true);
    else {
      setFailure(
        t("The Google sign-in window could not be opened. Allow pop-ups for this site and try again."),
      );
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t("Account access")}
        title={t("Sign in to {0}", [SITE_NAME])}
        description={t("Sign in with your Google account or your email to place orders, track them in the buyer portal and view your VAT bills.")}
      />

      <section className="container-x py-12 lg:py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-6 sm:p-10">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-muted" role="status">
              <Spinner className="h-5 w-5 text-primary" />
              {t("Checking your session…")}
            </div>
          ) : profile ? (
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
                <UserRound className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="eyebrow mt-5 text-muted">{t("Signed in")}</p>
              <h2 className="mt-2 text-3xl">{profile.full_name}</h2>
              <p className="mt-1 break-all text-muted">{profile.email}</p>
              <Badge tone={ROLE_TONE[profile.role]} className="mt-3">
                {t("Role:")}{' '}{t(ROLE_LABEL[profile.role])}
              </Badge>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to={home} className="btn btn-primary">
                  {profile.role === 'buyer'
                    ? t("Open buyer portal")
                    : profile.role === 'staff'
                      ? t("Open staff portal")
                      : t("Open admin portal")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {profile.role !== 'buyer' && (
                  <Link to="/buyer" className="btn btn-outline">
                    {t("My own orders")}
                  </Link>
                )}
                <button type="button" onClick={() => void signOut()} className="btn btn-danger">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {t("Sign out")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-3xl">{mode === 'signup' ? t("Create your account") : t("Welcome back")}</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-deep px-3 py-1 text-xs font-semibold text-muted">
                  <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("Secure portal")}
                </span>
              </div>

              {idle && (
                <Alert tone="info" className="mt-5">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {t("You were signed out after 10 minutes without activity.")}
                  </span>{' '}
                  {t("Sign in again to continue.")}
                </Alert>
              )}
              {notice && (
                <Alert tone="success" className="mt-5">
                  {notice}
                </Alert>
              )}

              <button
                type="button"
                onClick={google}
                className="btn btn-outline mt-6 w-full bg-white py-3 text-base"
              >
                <GoogleMark />
                {mode === 'signup' ? t("Sign up with Google") : t("Sign in with Google")}
              </button>

              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted">
                <span className="h-px flex-1 bg-line" />
                <span>{t("or continue with email")}</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <form onSubmit={submit} noValidate className="space-y-5">
                {mode === 'signup' && (
                  <TextField
                    id="login-full_name"
                    label={t("Full name")}
                    required
                    autoComplete="name"
                    placeholder={t("Your full name")}
                    maxLength={120}
                    value={values.full_name}
                    onChange={set('full_name')}
                    error={errors.full_name}
                  />
                )}
                <TextField
                  id="login-email"
                  label={t("Email address")}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@company.com"
                  maxLength={254}
                  value={values.email}
                  onChange={set('email')}
                  error={errors.email}
                />
                <TextField
                  id="login-password"
                  label={t("Password")}
                  type="password"
                  required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  maxLength={72}
                  value={values.password}
                  onChange={set('password')}
                  error={errors.password}
                  hint={mode === 'signup' ? t("At least 8 characters.") : undefined}
                />

                {failure && <Alert>{failure}</Alert>}

                <button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={busy}>
                  {busy && <Spinner />}
                  {busy
                    ? mode === 'signup'
                      ? t("Creating account")
                      : t("Signing in")
                    : mode === 'signup'
                      ? t("Create account")
                      : t("Sign in")}
                </button>
              </form>

              <p className="mt-6 text-center text-[15px] text-muted">
                {mode === 'signup' ? t("Already have an account?") : t("New to Waraq Pro?")}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signup' ? 'signin' : 'signup');
                    setErrors({});
                    setFailure(null);
                  }}
                  className="font-semibold text-primary-strong underline underline-offset-4"
                >
                  {mode === 'signup' ? t("Sign in") : t("Create an account")}
                </button>
              </p>

              <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-sm text-muted">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {t("New accounts, including Google sign-ins, start as buyers. Staff access is granted by a Waraq Pro administrator.")}
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
