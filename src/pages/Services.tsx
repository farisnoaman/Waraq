import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Mail } from 'lucide-react';
import WhatsAppIcon from '../components/WhatsAppIcon';
import {
  EASE,
  ErrorPanel,
  PageHeader,
  Reveal,
  SectionHeading,
  serviceIcon,
  usePageTitle,
} from '../components/ui';
import { useApi } from '../lib/api';
import { PHONE_DISPLAY, SITE_EMAIL, whatsappLink } from '../lib/site';
import type { ServiceItem } from '../lib/types';
import { t } from '../lib/i18n';

export default function Services() {
  usePageTitle(t('Services'), {
    description: t(
      'From request to delivery: Waraq Pro handles sourcing, quotations, supply and delivery of paper, packaging and office products in Jeddah.',
    ),
  });
  const services = useApi<ServiceItem[]>('/api/services');

  const steps = useMemo(
    () =>
      (services.data ?? [])
        .filter((s) => s.kind === 'step')
        .sort((a, b) => a.sort_order - b.sort_order),
    [services.data],
  );
  const extras = useMemo(
    () =>
      (services.data ?? [])
        .filter((s) => s.kind === 'service')
        .sort((a, b) => a.sort_order - b.sort_order),
    [services.data],
  );

  return (
    <>
      <PageHeader
        tone="dark"
        eyebrow={t("Services")}
        title={t("From your request to your door.")}
        description={t("We look after every stage of an order, so you deal with one supplier and one clear process from start to finish.")}
      >
        {steps.length > 0 && (
          <ol className="mt-10 flex flex-wrap gap-x-2 gap-y-3" aria-label={t("Process overview")}>
            {steps.map((step, i) => (
              <li key={step.id} className="flex items-center gap-2">
                <a
                  href={`#step-${step.id}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-sm font-medium text-paper transition-colors hover:border-primary-bright hover:text-primary-bright"
                >
                  <span className="font-display text-brass-soft">{i + 1}</span>
                  {t(step.title)}
                </a>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden h-4 w-4 text-white/35 sm:block" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        )}
      </PageHeader>

      <section className="container-x py-16 lg:py-24">
        <Reveal>
          <SectionHeading
            eyebrow={t("The process")}
            title={t("Six steps, one supplier")}
            description={t("Each step has a clear outcome, and you can follow your order in the buyer portal at every stage.")}
          />
        </Reveal>
        <div className="mt-12">
          {services.error ? (
            <ErrorPanel message={services.error} onRetry={services.reload} />
          ) : services.loading ? (
            <div className="border-t border-line">
              <p className="sr-only" role="status">
                {t("Loading services")}
              </p>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid gap-6 border-b border-line py-10 lg:grid-cols-12">
                  <div className="skeleton h-14 w-20 lg:col-span-2" />
                  <div className="skeleton h-9 w-3/4 lg:col-span-4" />
                  <div className="space-y-3 lg:col-span-6">
                    <div className="skeleton h-5 w-full" />
                    <div className="skeleton h-4 w-5/6" />
                    <div className="skeleton h-4 w-4/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ol className="border-t border-line">
              {steps.map((step, i) => {
                const Icon = serviceIcon(step.icon);
                return (
                  <motion.li
                    key={step.id}
                    id={`step-${step.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '0px 0px -80px 0px' }}
                    transition={{ duration: 0.6, ease: EASE }}
                    className="grid scroll-mt-24 gap-5 border-b border-line py-10 lg:grid-cols-12 lg:gap-10 lg:py-14"
                  >
                    <div className="flex items-center justify-between lg:col-span-2 lg:block">
                      <span className="font-display text-6xl leading-none text-primary lg:text-7xl">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-strong lg:mt-6">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="lg:col-span-4">
                      <p className="eyebrow text-muted">{t("Step")}{' '}{i + 1}</p>
                      <h3 className="mt-2 text-3xl leading-tight sm:text-4xl">{t(step.title)}</h3>
                    </div>
                    <div className="lg:col-span-6">
                      <p className="text-lg text-ink/90">{t(step.summary)}</p>
                      <ul className="mt-5 space-y-3">
                        {(step.points ?? []).map((point) => (
                          <li key={point} className="flex gap-3 text-muted">
                            <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            {t(point)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="container-x grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <Reveal>
            <div className="overflow-hidden rounded-2xl bg-paper-deep">
              <img
                src="/images/delivery.jpg"
                alt={t("A delivery worker carrying cardboard boxes")}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="eyebrow text-primary-strong">{t("Door-to-door delivery")}</p>
            <h2 className="mt-3 text-3xl leading-[1.1] sm:text-4xl lg:text-[2.75rem]">
              {t("The last step is ours too.")}
            </h2>
            <p className="mt-5 text-lg text-muted">
              {t("Your order is not finished when it is packed. We bring it to the address you gave us, whether that is an office, a shop, a warehouse or a site, and hand it over so you can check it against what you approved.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/request" className="btn btn-primary">
                {t("Start a request")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/products" className="btn btn-outline">
                {t("Browse products")}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {(services.loading || extras.length > 0) && (
        <section className="container-x py-16 lg:py-24">
          <Reveal>
            <SectionHeading eyebrow={t("Also available")} title={t("Supporting services")} />
          </Reveal>
          {services.loading ? (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-52 rounded-2xl" />
              ))}
            </div>
          ) : (
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {extras.map((service, i) => {
                const Icon = serviceIcon(service.icon);
                return (
                  <motion.li
                    key={service.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '0px 0px -60px 0px' }}
                    transition={{ duration: 0.6, delay: i * 0.06, ease: EASE }}
                    className="rounded-2xl border border-line bg-card p-6"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-strong">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-2xl leading-snug">{t(service.title)}</h3>
                    <p className="mt-2 text-muted">{t(service.summary)}</p>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="on-dark bg-primary text-white">
        <div className="container-x flex flex-col gap-8 py-16 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl leading-[1.1] sm:text-4xl">{t("Ready to send your first request?")}</h2>
            <p className="mt-3 text-lg text-white/90">
              {t("It takes a few minutes, and you can track it from your buyer portal straight away.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/request" className="btn btn-light">
              {t("Start a request")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href={whatsappLink('Hello Waraq Pro, I would like to request a quotation.')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-whatsapp"
            >
              <WhatsAppIcon className="h-4 w-4" />
              {t("WhatsApp")}{' '}{PHONE_DISPLAY}
            </a>
            <a href={`mailto:${SITE_EMAIL}`} className="btn btn-on-dark">
              <Mail className="h-4 w-4" aria-hidden="true" />
              {t("Email us")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
