import { useCallback, useEffect, useState } from 'react';
import { Inbox, Mail } from 'lucide-react';
import { Badge, ErrorPanel } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime,  ltr } from '../../lib/format';
import type { ContactMessage } from '../../lib/types';
import { EmptyState, TabIntro } from './shared';
import { t } from '../../lib/i18n';

export default function InboxTab() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await api<ContactMessage[]>('/api/operations?resource=messages'));
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

  return (
    <div>
      <TabIntro title={t("Inbox")}>{t("Messages sent from the contact form, newest first.")}</TabIntro>
      {error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="space-y-3" role="status">
          <p className="sr-only">{t("Loading messages")}</p>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState icon={Inbox} title={t("No messages yet")}>
          {t("Messages from the contact page will appear here.")}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {messages.map((message) => (
            <li key={message.id} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {t(message.name)}
                    <Badge tone="mint">{t(message.subject)}</Badge>
                  </p>
                  <p className="break-all text-sm text-muted">
                    {message.email}
                    {message.company ? ` · ${message.company}` : ''}
                    {message.phone ? ` · ${ltr(message.phone)}` : ''}
                  </p>
                </div>
                <p className="text-sm text-muted">{formatDateTime(message.created_at)}</p>
              </div>
              <p className="mt-3 whitespace-pre-line text-[15px] text-ink/90">{message.message}</p>
              <a
                href={`mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(`Re: ${t(message.subject)}`)}`}
                className="btn btn-outline btn-sm mt-4"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {t("Reply by email")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
