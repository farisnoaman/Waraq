import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageTitle } from '../components/ui';
import { t } from '../lib/i18n';

export default function NotFound() {
  usePageTitle(t('Page not found'), { noIndex: true });
  return (
    <section className="container-x py-24 text-center sm:py-32">
      <p className="eyebrow text-primary-strong">{t("Page not found")}</p>
      <h1 className="mt-4 text-4xl sm:text-5xl">{t("This page is not in our catalogue")}</h1>
      <p className="mx-auto mt-4 max-w-md text-muted">
        {t("The address may be mistyped, or the page may have moved.")}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn btn-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("Back to home")}
        </Link>
        <Link to="/products" className="btn btn-outline">
          {t("Browse products")}
        </Link>
      </div>
    </section>
  );
}
