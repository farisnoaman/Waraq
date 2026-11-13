import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ClipboardList, Mail, MapPin, Send } from 'lucide-react';
import WhatsAppIcon from '../components/WhatsAppIcon';
import {
  Alert,
  PageHeader,
  SelectField,
  Spinner,
  TextAreaField,
  TextField,
  usePageTitle,
} from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import {
  mailtoLink,
  PHONE_DISPLAY,
  SITE_DOMAIN,
  SITE_EMAIL,
  SITE_POSTAL_CODE,
  SITE_SHORT_ADDRESS,
  siteAddress,
  whatsappLink,
} from '../lib/site';
import { schemas, validate, type FieldErrors } from '../lib/validation';
import { t, useLang } from '../lib/i18n';

const SUBJECTS = ['General enquiry', 'Product enquiry', 'Quotation', 'Delivery'];
const MESSAGE_LIMIT = 2000;
const FIELD_ORDER = ['name', 'email', 'company', 'phone', 'subject', 'message'];

const EMPTY = {
  name: '',
  email: '',
  company: '',
  phone: '',
  subject: SUBJECTS[0],
  message: '',
  website: '',
};

export default function Contact() {
  usePageTitle(t('Contact'), {
    description: t(
      'Contact Waraq Pro in Riyadh for paper, packaging and office supply enquiries, quotations and orders.',
    ),
  });
  const lang = useLang();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<typeof EMPTY | null>(null);

  const set =
    (key: keyof typeof EMPTY) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((current) => ({ ...current, [key]: event.target.value }));
      setErrors((current) => ({ ...current, [key]: '' }));
    };

  const focusFirst = (fields: FieldErrors) => {
    const first = FIELD_ORDER.find((key) => fields[key]);
    if (first) document.getElementById(`ct-${first}`)?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setFailure(null);
    const result = validate(schemas.contact, values);
    if (!result.ok) {
      setErrors(result.errors);
      focusFirst(result.errors);
      return;
    }
    setSending(true);
    try {
      await api('/api/contact', {
        method: 'POST',
        auth: false,
        body: { ...result.data, website: values.website },
      });
      setSent(values);
      setValues(EMPTY);
      setErrors({});
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        setErrors(err.fields);
        focusFirst(err.fields);
      }
      setFailure(errorMessage(err, 'We could not send your message. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const iconWrap = 'grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-strong';

  return (
    <>
      <PageHeader
        eyebrow={t("Contact us")}
        title={t("Talk to Waraq Pro.")}
        description={t("Questions about a product, an order or a delivery? Write to us at {0} or reach us on WhatsApp and we will get back to you.", [SITE_EMAIL])}
      />

      <section className="container-x grid gap-10 py-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-16">
        <div className="space-y-5">
          <div className="on-dark relative overflow-hidden rounded-2xl bg-forest p-6 text-paper sm:p-8">
            <div aria-hidden="true" className="ruled absolute inset-0" />
            <div className="relative">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-bright/15 text-primary-bright">
                <Mail className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="eyebrow mt-5 text-brass-soft">{t("Email (")}{SITE_DOMAIN})</p>
              <a
                href={`mailto:${SITE_EMAIL}`}
                className="mt-2 inline-block break-all font-display text-3xl text-paper underline decoration-primary-bright/50 decoration-2 underline-offset-8 transition-colors hover:text-primary-bright sm:text-4xl"
              >
                {SITE_EMAIL}
              </a>
              <p className="mt-4 text-paper/75">
                {t("The most direct way to reach Waraq Pro. Include your company name and what you need.")}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-card p-6">
            <span className={iconWrap}>
              <WhatsAppIcon className="h-6 w-6" />
            </span>
            <p className="eyebrow mt-5 text-muted">{t("Phone & WhatsApp")}</p>
            <a
              href={whatsappLink('Hello Waraq Pro, I would like to enquire about your products.')}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-display text-2xl text-ink transition-colors hover:text-primary-strong sm:text-3xl"
            >
              {PHONE_DISPLAY}
            </a>
            <p className="mt-2 text-muted">
              {t("Message us directly on WhatsApp or call us for product enquiries and orders.")}
            </p>
            <a
              href={whatsappLink('Hello Waraq Pro, I would like to enquire about your products.')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-whatsapp mt-5"
            >
              <WhatsAppIcon className="h-4 w-4" />
              {t("Chat on WhatsApp")}
            </a>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-6">
              <span className={iconWrap}>
                <MapPin className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="eyebrow mt-5 text-muted">{t("Location")}</p>
              <p className="mt-2 font-display text-xl">{siteAddress(lang)}</p>
              <p className="mt-1 text-sm text-muted">
                {t("Postal code")}{' '}{SITE_POSTAL_CODE} · {t("Short address")}{' '}{SITE_SHORT_ADDRESS}
              </p>
              <p className="mt-1 text-sm text-muted">{t("Established 2015 ·")}{' '}{SITE_DOMAIN}</p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-6">
              <span className={iconWrap}>
                <ClipboardList className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="eyebrow mt-5 text-muted">{t("Ready to order?")}</p>
              <p className="mt-2 text-muted">
                {t("Build a request list from the catalogue so we can supply exactly what you need.")}
              </p>
              <Link
                to="/request"
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary-strong underline decoration-2 underline-offset-4 hover:decoration-primary"
              >
                {t("Open request list")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5 sm:p-8 lg:p-10">
          {sent ? (
            <div role="status">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
                <Check className="h-7 w-7" aria-hidden="true" />
              </span>
              <h2 className="mt-6 text-3xl sm:text-4xl">{t("Message received.")}</h2>
              <p className="mt-3 text-lg text-muted">
                {t("Thank you,")}{' '}{sent.name.trim()}{t(". We have saved your message and will reply to")}{' '}
                <span className="font-semibold text-ink">{sent.email.trim()}</span>.
              </p>
              <p className="mt-6 text-muted">
                {t("If it is urgent, or you want to attach a file, send the same message by email or directly on WhatsApp (")}{PHONE_DISPLAY}).
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={mailtoLink(`${sent.subject} from ${sent.name.trim()}`, sent.message.trim())}
                  className="btn btn-outline bg-white"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {t("Email a copy")}
                </a>
                <a
                  href={whatsappLink(`${sent.subject} from ${sent.name.trim()}\n\n${sent.message.trim()}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  {t("Send on WhatsApp")}
                </a>
              </div>
              <button type="button" className="btn btn-primary mt-8" onClick={() => setSent(null)}>
                {t("Send another message")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate aria-labelledby="contact-form-title">
              <h2 id="contact-form-title" className="text-3xl">
                {t("Send us a message")}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {t("Fields marked")}{' '}<span className="text-danger">*</span>{' '}{t("are required.")}
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <TextField
                  id="ct-name"
                  label={t("Full name")}
                  required
                  autoComplete="name"
                  maxLength={120}
                  value={values.name}
                  onChange={set('name')}
                  error={errors.name}
                />
                <TextField
                  id="ct-email"
                  label={t("Email")}
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
                  id="ct-company"
                  label={t("Company")}
                  autoComplete="organization"
                  maxLength={160}
                  value={values.company}
                  onChange={set('company')}
                  error={errors.company}
                />
                <TextField
                  id="ct-phone"
                  label={t("Phone")}
                  type="tel"
                  autoComplete="tel"
                  placeholder={PHONE_DISPLAY}
                  maxLength={20}
                  value={values.phone}
                  onChange={set('phone')}
                  error={errors.phone}
                />
                <div className="sm:col-span-2">
                  <SelectField
                    id="ct-subject"
                    label={t("Subject")}
                    required
                    value={values.subject}
                    onChange={set('subject')}
                    error={errors.subject}
                  >
                    {SUBJECTS.map((subject) => (
                      <option key={subject} value={subject}>
                        {t(subject)}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="sm:col-span-2">
                  <TextAreaField
                    id="ct-message"
                    label={t("Message")}
                    required
                    rows={6}
                    maxLength={MESSAGE_LIMIT}
                    value={values.message}
                    onChange={set('message')}
                    error={errors.message}
                    hint={t("{0} of {1} characters", [values.message.length, MESSAGE_LIMIT])}
                  />
                </div>
                {/* Honeypot: hidden from people, tempting for bots. */}
                <div className="absolute -start-[9999px]" aria-hidden="true">
                  <label htmlFor="ct-website">{t("Website")}</label>
                  <input
                    id="ct-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={values.website}
                    onChange={set('website')}
                  />
                </div>
              </div>

              {failure && (
                <Alert className="mt-6">
                  {failure}{' '}
                  <a href={`mailto:${SITE_EMAIL}`} className="font-semibold underline underline-offset-2">
                    {t("Email")}{' '}{SITE_EMAIL}
                  </a>
                </Alert>
              )}

              <button type="submit" className="btn btn-primary mt-7 w-full sm:w-auto" disabled={sending}>
                {sending ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {sending ? t("Sending message") : t("Send message")}
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
