import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Mail } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import WhatsAppIcon from '../components/WhatsAppIcon';
import {
  EASE,
  ErrorPanel,
  ProductCardSkeleton,
  Reveal,
  RevealItem,
  SectionHeading,
  serviceIcon,
  usePageTitle,
} from '../components/ui';
import { useApi } from '../lib/api';
import { PHONE_DISPLAY, SITE_DOMAIN, SITE_EMAIL, whatsappLink } from '../lib/site';
import type { Category, Product, ServiceItem } from '../lib/types';
import { t } from '../lib/i18n';

const heroVariants = {
  hidden: { opacity: 0, y: 24 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, delay: 0.1 + index * 0.09, ease: EASE },
  }),
};

const PROMISES = [
  {
    title: 'One request',
    text: 'Send a single list, however mixed. Paper, packaging and stationery can all go on the same request.',
  },
  {
    title: 'A clear bill',
    text: 'You see every price in writing, with VAT shown for each item, before your order is confirmed.',
  },
  {
    title: 'To your door',
    text: 'We bring the complete order to the address you give us and hand it over.',
  },
];

export default function Home() {
  usePageTitle(undefined, {
    description: t(
      'Waraq Pro supplies paper, packaging and office products in Jeddah. Established 2015 — from your request to delivery at your door.',
    ),
  });
  const categories = useApi<Category[]>('/api/categories');
  const products = useApi<Product[]>('/api/products');
  const services = useApi<ServiceItem[]>('/api/services');

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/images/hero-warehouse.jpg';
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  const productCategories = useMemo(
    () =>
      [...(categories.data ?? [])]
        .filter((c) => c.kind === 'product')
        .sort((a, b) => a.sort_order - b.sort_order),
    [categories.data],
  );
  const steps = useMemo(
    () =>
      (services.data ?? [])
        .filter((s) => s.kind === 'step')
        .sort((a, b) => a.sort_order - b.sort_order),
    [services.data],
  );
  const featured = useMemo(
    () => (products.data ?? []).filter((p) => p.featured).slice(0, 4),
    [products.data],
  );
  const countBySlug = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products.data ?? []) {
      counts.set(product.category_slug, (counts.get(product.category_slug) ?? 0) + 1);
    }
    return counts;
  }, [products.data]);
  const nameBySlug = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.slug, c.name])),
    [categories.data],
  );

  const stats = [
    { value: '2015', label: 'Established in Riyadh' },
    {
      value: categories.data ? String(productCategories.length) : null,
      label: 'Product categories',
    },
    { value: products.data ? String(products.data.length) : null, label: 'Catalogue items' },
    { value: services.data ? String(steps.length) : null, label: 'Steps from request to door' },
  ];

  return (
    <>
      <section className="on-dark relative overflow-hidden bg-forest text-paper">
        <div aria-hidden="true" className="ruled absolute inset-0" />
        <div className="container-x relative grid gap-14 pb-20 pt-14 sm:pt-20 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-24">
          <div className="lg:col-span-7 lg:pe-6">
            <motion.p
              variants={heroVariants}
              initial="hidden"
              animate="show"
              custom={0}
              className="eyebrow inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-brass-soft"
            >
              <span>{t("Riyadh")}</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-brass" />
              <span>{t("Kingdom of Saudi Arabia")}</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-brass" />
              <span>{SITE_DOMAIN}</span>
            </motion.p>
            <motion.h1
              variants={heroVariants}
              initial="hidden"
              animate="show"
              custom={1}
              className="mt-6 text-[2.7rem] leading-[1.04] sm:text-6xl lg:text-[4.4rem]"
            >
              {t("Paper, packaging and office supply,")}{' '}
              <em className="font-normal italic text-primary-bright">{t("delivered to your door.")}</em>
            </motion.h1>
            <motion.p
              variants={heroVariants}
              initial="hidden"
              animate="show"
              custom={2}
              className="mt-6 max-w-xl text-lg text-paper/80 sm:text-xl"
            >
              {t("Waraq Pro (")}{SITE_DOMAIN}{t(") is a Riyadh supplier established in 2015. Send us one request and we take care of the rest: confirmation, sourcing, quality check and door-to-door delivery.")}
            </motion.p>
            <motion.div
              variants={heroVariants}
              initial="hidden"
              animate="show"
              custom={3}
              className="mt-9 flex flex-wrap gap-3"
            >
              <Link to="/products" className="btn btn-bright">
                {t("Browse products")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/services" className="btn btn-on-dark">
                {t("How it works")}
              </Link>
              <a
                href={whatsappLink('Hello Waraq Pro, I would like to request a quotation.')}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-on-dark"
              >
                <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                {PHONE_DISPLAY}
              </a>
            </motion.div>
          </div>

          <motion.div
            variants={heroVariants}
            initial="hidden"
            animate="show"
            custom={2}
            className="relative mx-auto mb-8 w-full max-w-md lg:col-span-5 lg:mb-0 lg:me-0 lg:max-w-[26rem]"
          >
            <span
              lang="ar"
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 end-0 select-none font-arabic text-[8rem] leading-none text-white/[0.07] sm:text-[10rem]"
            >
              ورق
            </span>
            <div className="relative aspect-[4/5] overflow-hidden rounded-b-3xl rounded-t-[999px] border border-white/15 bg-forest-soft">
              <img
                src="/images/hero-warehouse.jpg"
                alt={t("Warehouse shelving stacked with packed cartons")}
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-forest/70 via-transparent to-transparent"
              />
            </div>
            {!services.error && (
              <div className="absolute -bottom-8 start-3 w-60 rounded-2xl bg-card p-5 text-ink shadow-[0_24px_50px_-18px_rgba(0,0,0,0.6)] sm:-start-8">
                <p className="eyebrow text-primary-strong">{t("Request to door")}</p>
                {services.loading ? (
                  <div className="mt-3 space-y-2.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton h-4" />
                    ))}
                  </div>
                ) : (
                  <ol className="mt-3 space-y-2">
                    {steps.map((step, i) => (
                      <li key={step.id} className="flex items-center gap-2.5 text-sm font-medium">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mint text-[11px] font-bold text-primary-strong">
                          {i + 1}
                        </span>
                        {t(step.title)}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </motion.div>
        </div>

        <div className="relative border-t border-white/10">
          <dl className="container-x grid grid-cols-2 gap-x-6 gap-y-8 py-10 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse gap-1">
                <dt className="text-sm text-paper/70">{t(stat.label)}</dt>
                <dd className="font-display text-4xl text-paper sm:text-5xl">
                  {stat.value ?? (
                    <span className="skeleton skeleton-dark inline-block h-10 w-14 align-middle" />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container-x grid gap-12 py-20 lg:grid-cols-12 lg:py-28">
        <Reveal className="lg:col-span-5">
          <p className="eyebrow text-primary-strong">{t("About Waraq Pro")}</p>
          <h2 className="mt-3 text-3xl leading-[1.1] sm:text-4xl lg:text-[2.75rem]">
            {t("A Riyadh supplier, established in 2015.")}
          </h2>
          <p
            lang="ar"
            dir="rtl"
            aria-hidden="true"
            className="mt-6 text-start font-arabic text-6xl text-primary/25"
          >
            ورق برو
          </p>
        </Reveal>
        <div className="lg:col-span-7">
          <Reveal>
            <p className="text-xl leading-relaxed text-ink/90">
              {t("Waraq means paper in Arabic. At Waraq Pro (")}{SITE_DOMAIN}{t("), we supply paper, packaging and office products to businesses across Saudi Arabia, managing the whole journey from the first request to delivery at your door.")}
            </p>
          </Reveal>
          <ul className="mt-10 border-t border-line">
            {PROMISES.map((promise, i) => (
              <RevealItem
                key={promise.title}
                delay={i * 0.06}
                className="grid grid-cols-1 gap-2 border-b border-line py-6 sm:grid-cols-[3.5rem_13rem_1fr] sm:items-baseline sm:gap-6"
              >
                <span className="font-display text-xl text-brass">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-2xl">{t(promise.title)}</h3>
                <p className="text-muted">{t(promise.text)}</p>
              </RevealItem>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="container-x py-20 lg:py-24">
          <Reveal>
            <SectionHeading
              eyebrow={t("What we supply")}
              title={t("Browse by category")}
              description={t("Choose a category to see what is available, then add items to your request list.")}
              action={
                <Link to="/products" className="btn btn-outline">
                  {t("View all products")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
          </Reveal>
          <div className="mt-12">
            {categories.error ? (
              <ErrorPanel message={categories.error} onRetry={categories.reload} />
            ) : categories.loading ? (
              <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton aspect-[4/5] rounded-2xl sm:aspect-[4/3]" />
                ))}
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                {productCategories.map((category, i) => {
                  const count = countBySlug.get(category.slug) ?? 0;
                  return (
                    <RevealItem key={category.id} delay={(i % 3) * 0.06}>
                      <Link
                        to={`/products?category=${category.slug}`}
                        className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-forest sm:aspect-[4/3]"
                      >
                        <img
                          src={category.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-gradient-to-t from-forest via-forest/55 to-forest/5"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-paper sm:p-6">
                          <div>
                            <h3 className="text-lg leading-tight sm:text-2xl">{t(category.name)}</h3>
                            {products.data && (
                              <p className="mt-1 text-sm text-paper/80">
                                {count} {count === 1 ? t("product") : t("products")}
                              </p>
                            )}
                          </div>
                          <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-paper text-forest transition-colors group-hover:bg-primary-bright sm:grid">
                            <ChevronRight className="h-5 w-5" aria-hidden="true" />
                          </span>
                        </div>
                      </Link>
                    </RevealItem>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="on-dark relative overflow-hidden bg-forest text-paper">
        <div aria-hidden="true" className="ruled absolute inset-0" />
        <div className="container-x relative py-20 lg:py-28">
          <Reveal>
            <SectionHeading
              dark
              eyebrow={t("How we work")}
              title={t("From request to your door")}
              description={t("One clear path for every order, so you always know what happens next.")}
              action={
                <Link to="/services" className="btn btn-on-dark">
                  {t("See the full process")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
          </Reveal>
          <div className="mt-14">
            {services.error ? (
              <ErrorPanel dark message={services.error} onRetry={services.reload} />
            ) : services.loading ? (
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-3 border-t border-white/15 pt-6">
                    <div className="skeleton skeleton-dark h-10 w-10 rounded-full" />
                    <div className="skeleton skeleton-dark h-5 w-3/4" />
                    <div className="skeleton skeleton-dark h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <ol className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-6">
                {steps.map((step, i) => {
                  const Icon = serviceIcon(step.icon);
                  return (
                    <motion.li
                      key={step.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
                      transition={{ duration: 0.6, delay: i * 0.07, ease: EASE }}
                      className="border-t border-white/20 pt-6"
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-bright/15 text-primary-bright">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="font-display text-2xl text-brass-soft">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <h3 className="mt-5 text-xl leading-snug">{t(step.title)}</h3>
                      <p className="mt-2 text-[15px] text-paper/75">{t(step.summary)}</p>
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section className="container-x py-20 lg:py-28">
        <Reveal>
          <SectionHeading
            eyebrow={t("From the catalogue")}
            title={t("Selected products")}
            action={
              <Link to="/products" className="btn btn-outline">
                {t("Full catalogue")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
        </Reveal>
        <div className="mt-12">
          {products.error ? (
            <ErrorPanel message={products.error} onRetry={products.reload} />
          ) : products.loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((product, i) => (
                <Reveal key={product.id} delay={i * 0.06} className="h-full">
                  <ProductCard
                    product={product}
                    categoryName={nameBySlug.get(product.category_slug)}
                    projectCategoryName={
                      product.project_category_slug
                        ? nameBySlug.get(product.project_category_slug)
                        : undefined
                    }
                  />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="on-dark bg-primary text-white">
        <div className="container-x flex flex-col gap-8 py-16 lg:flex-row lg:items-center lg:justify-between lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl leading-[1.1] sm:text-4xl lg:text-5xl">{t("Tell us what you need.")}</h2>
            <p className="mt-4 text-lg text-white/90">
              {t("Build a request list from the catalogue and place your order. You can follow every step in your buyer portal.")}
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
              {SITE_EMAIL}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
