import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Search, ShieldCheck, UserCog, UserPlus, Users } from 'lucide-react';
import { Alert, Badge, ErrorPanel, Spinner, TextField } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatDate, ROLE_LABEL, ROLE_TONE,  ltr } from '../../lib/format';
import type { Profile } from '../../lib/types';
import { schemas, validate, type FieldErrors } from '../../lib/validation';
import { EmptyState, TabIntro, useAction } from './shared';
import { t } from '../../lib/i18n';

const EMPTY = { full_name: '', email: '', phone: '', password: '' };

export default function UsersTab({ me }: { me: Profile }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api<Profile[]>('/api/operations?resource=users'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const action = useAction(load);

  const set = (key: keyof typeof EMPTY) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const createStaff = async (event: FormEvent) => {
    event.preventDefault();
    setCreated(null);
    const result = validate(schemas.staffCreate, form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const ok = await action.run('create', async () => {
      try {
        await api('/api/operations?resource=users', {
          method: 'POST',
          body: { ...result.data, password: form.password },
        });
      } catch (err) {
        if (err instanceof ApiError) setErrors(err.fields);
        throw err;
      }
    });
    if (ok) {
      setCreated(t("{0} can now sign in as staff with {1}.", [result.data.full_name, result.data.email]));
      setForm(EMPTY);
    }
  };

  const setRole = (user: Profile, role: 'buyer' | 'staff') =>
    action.run(`role-${user.id}`, () =>
      api('/api/operations?resource=users', { method: 'PUT', body: { id: user.id, role } }),
    );

  const needle = query.trim().toLowerCase();
  const visible = users.filter(
    (user) =>
      !needle ||
      [user.full_name, user.email, user.company ?? '', user.role].join(' ').toLowerCase().includes(needle),
  );
  const staffCount = users.filter((u) => u.role === 'staff').length;

  return (
    <div>
      <TabIntro title={t("Users and staff")}>
        {t("Everyone who signs in with Google or email starts as a buyer. Assign a signed-in user as staff to give them the staff portal, or create a dedicated staff account below.")}
      </TabIntro>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <form
          onSubmit={createStaff}
          noValidate
          className="rounded-2xl border border-line bg-card p-5 sm:p-6 lg:self-start"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-strong">
            <UserPlus className="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 className="mt-4 text-2xl">{t("Create a staff account")}</h3>
          <p className="mt-1 text-sm text-muted">
            {t("For deliveries, receipts and commission tracking. Share the password with the staff member privately.")}
          </p>
          <div className="mt-5 space-y-4">
            <TextField
              id="staff-name"
              label={t("Full name")}
              required
              placeholder={t("e.g. Fahad Al-Otaibi")}
              maxLength={120}
              autoComplete="off"
              value={form.full_name}
              onChange={set('full_name')}
              error={errors.full_name}
            />
            <TextField
              id="staff-email"
              label={t("Staff email")}
              type="email"
              required
              placeholder="name@waraq.pro"
              maxLength={254}
              autoComplete="off"
              value={form.email}
              onChange={set('email')}
              error={errors.email}
            />
            <TextField
              id="staff-phone"
              label={t("Phone / WhatsApp")}
              type="tel"
              placeholder={t("+966 5X XXX XXXX")}
              maxLength={20}
              autoComplete="off"
              value={form.phone}
              onChange={set('phone')}
              error={errors.phone}
            />
            <TextField
              id="staff-password"
              label={t("Temporary password")}
              type="password"
              required
              maxLength={72}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              error={errors.password}
              hint={t("At least 8 characters.")}
            />
          </div>
          {created && (
            <Alert tone="success" className="mt-5">
              {created}
            </Alert>
          )}
          <button type="submit" className="btn btn-primary mt-5 w-full" disabled={action.busy !== null}>
            {action.busy === 'create' ? <Spinner /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            {t("Create staff member")}
          </button>
        </form>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-2xl">
              {t("Registered users")}{' '}<span className="text-muted">({users.length})</span>
              <span className="ms-2 align-middle text-sm font-sans font-normal text-muted">
                {staffCount}{' '}{t("staff")}
              </span>
            </h3>
            <div className="relative sm:w-64">
              <label htmlFor="user-search" className="sr-only">
                {t("Search users")}
              </label>
              <Search
                className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id="user-search"
                type="search"
                className="field-input field-sm ps-10"
                placeholder={t("Name, email or role")}
                maxLength={80}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {action.error && <Alert className="mt-4">{action.error}</Alert>}

          <div className="mt-4">
            {error ? (
              <ErrorPanel message={error} onRetry={() => void load()} />
            ) : loading ? (
              <div className="space-y-2" role="status">
                <p className="sr-only">{t("Loading users")}</p>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState icon={Users} title={t("No users match")}>
                {t("Try a different name or email.")}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                {visible.map((user) => (
                  <li
                    key={user.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {user.full_name}
                        <Badge tone={ROLE_TONE[user.role]}>{t(ROLE_LABEL[user.role])}</Badge>
                        {user.id === me.id && <span className="text-xs font-normal text-muted">{t("(you)")}</span>}
                      </p>
                      <p className="break-all text-sm text-muted">
                        {user.email}
                        {user.company ? ` · ${user.company}` : ''}
                        {user.phone ? ` · ${ltr(user.phone)}` : ''}
                      </p>
                      <p className="text-xs text-muted">{t("Joined")}{' '}{formatDate(user.created_at)}</p>
                    </div>
                    <div className="shrink-0">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                          {t("Administrator")}
                        </span>
                      ) : user.role === 'buyer' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={action.busy !== null}
                          onClick={() => void setRole(user, 'staff')}
                        >
                          {action.busy === `role-${user.id}` ? (
                            <Spinner />
                          ) : (
                            <UserCog className="h-4 w-4" aria-hidden="true" />
                          )}
                          {t("Assign as staff")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={action.busy !== null}
                          onClick={() => void setRole(user, 'buyer')}
                        >
                          {action.busy === `role-${user.id}` && <Spinner />}
                          {t("Set as buyer")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
