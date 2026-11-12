import { useEffect, useState, type FormEvent } from 'react';
import { LogOut, Save, UserRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, errorMessage } from '../lib/api';
import { formatDate, ROLE_LABEL, ROLE_TONE,  ltr } from '../lib/format';
import { schemas, validate, type FieldErrors } from '../lib/validation';
import { Alert, Badge, Spinner, TextField } from './ui';
import { t } from '../lib/i18n';

/** Profile view and contact-details form, shared by the buyer and admin/staff portals. */
export default function ProfilePanel({ children }: { children?: React.ReactNode }) {
  const { profile, updateProfile, signOut, offlineSession } = useAuth();
  const [values, setValues] = useState({ full_name: '', company: '', phone: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    setValues({
      full_name: profile.full_name ?? '',
      company: profile.company ?? '',
      phone: profile.phone ?? '',
    });
  }, [profile]);

  if (!profile) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setMessage(null);
    const result = validate(schemas.profile, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateProfile(result.data);
      setMessage({ tone: 'success', text: t("Your profile has been saved.") });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      setMessage({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <aside className="space-y-6">
        <div className="rounded-2xl border border-line bg-card p-6">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
            <UserRound className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-2xl">{profile.full_name}</h2>
          <p className="break-all text-muted">{profile.email}</p>
          <dl className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("Role")}</dt>
              <dd>
                <Badge tone={ROLE_TONE[profile.role]}>{t(ROLE_LABEL[profile.role])}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("Company")}</dt>
              <dd className="text-end font-medium">{profile.company || '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("Phone")}</dt>
              <dd className="font-medium">{ltr(profile.phone) || '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("Member since")}</dt>
              <dd className="font-medium">{formatDate(profile.created_at)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => void signOut()}
            className="btn btn-danger mt-6 w-full"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("Sign out")}
          </button>
          <p className="mt-3 text-xs text-muted">
            {t("For your security you are signed out automatically after 10 minutes without activity.")}
          </p>
        </div>
        {children}
      </aside>

      <form
        onSubmit={submit}
        noValidate
        className="rounded-2xl border border-line bg-card p-6 sm:p-8 lg:self-start"
      >
        <h2 className="text-2xl">{t("Contact details")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("These details are used on your orders and bills. Your role can only be changed by an administrator.")}
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField
              id="profile-name"
              label={t("Full name")}
              required
              autoComplete="name"
              value={values.full_name}
              onChange={set('full_name')}
              error={errors.full_name}
              maxLength={120}
            />
          </div>
          <TextField
            id="profile-company"
            label={t("Company")}
            autoComplete="organization"
            value={values.company}
            onChange={set('company')}
            error={errors.company}
            maxLength={160}
          />
          <TextField
            id="profile-phone"
            label={t("Phone")}
            type="tel"
            autoComplete="tel"
            placeholder={t("+966 5X XXX XXXX")}
            value={values.phone}
            onChange={set('phone')}
            error={errors.phone}
            maxLength={20}
          />
          <div className="sm:col-span-2">
            <TextField
              id="profile-email"
              label={t("Email")}
              value={profile.email}
              disabled
              readOnly
              hint={t("Your sign-in email cannot be changed here.")}
            />
          </div>
        </div>
        {message && (
          <Alert tone={message.tone} className="mt-6">
            {t(message.text)}
          </Alert>
        )}
        <button type="submit" className="btn btn-primary mt-6" disabled={saving || offlineSession}>
          {saving ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? t("Saving") : t("Save changes")}
        </button>
        {offlineSession && (
          <p className="mt-3 text-sm text-muted">{t("You are offline. Reconnect to edit your profile.")}</p>
        )}
      </form>
    </div>
  );
}
