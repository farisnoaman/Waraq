import { Fragment, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { t } from '../lib/i18n';

export interface ResponsiveColumn<T> {
  /** Header text; also the label shown beside the value on the mobile card. */
  label: string;
  render: (row: T) => ReactNode;
  /** Rendered as the card's heading block on mobile instead of a label/value row. */
  primary?: boolean;
  /** Numeric column: figures right-aligned on desktop, tabular on mobile. */
  num?: boolean;
  /** Kept in the desktop table, omitted from the mobile card. */
  hideOnMobile?: boolean;
  /** Extra class for the th/td, merged after the num class. */
  className?: string;
}

interface Props<T> {
  rows: T[];
  getRowKey: (row: T) => string | number;
  columns: ResponsiveColumn<T>[];
  /** Row actions: the last desktop column and the mobile card footer. */
  actions?: (row: T) => ReactNode;
  /** Expand/collapse support; the caller owns the state, exactly like the tables this replaces. */
  isExpanded?: (row: T) => boolean;
  onToggle?: (row: T) => void;
  expandedContent?: (row: T) => ReactNode;
  /** Accessible name of the expand button, e.g. "Show installments for WP-…". */
  expandAria?: (row: T, expanded: boolean) => string;
  /** Tables nested inside an expanded row keep their lighter border and tighter spacing. */
  nested?: boolean;
  /** Minimum desktop table width in px before it scrolls sideways. */
  minWidth?: number;
  className?: string;
}

/**
 * One source of truth for portal data: a real table on screens ≥1024px,
 * stacked cards (the same card language as the order cards) on phones and
 * tablets, so no table ever scrolls sideways. Both variants carry stable
 * `rt-table` / `rt-cards` classes so print rules can force the table variant
 * when a bill or receipt is printed.
 */
export default function ResponsiveTable<T>({
  rows,
  getRowKey,
  columns,
  actions,
  isExpanded,
  onToggle,
  expandedContent,
  expandAria,
  nested = false,
  minWidth,
  className = '',
}: Props<T>) {
  const canExpand = Boolean(onToggle && isExpanded && expandedContent);
  const expandedOf = (row: T) => (canExpand && isExpanded ? isExpanded(row) : false);
  const colCount = columns.length + (actions ? 1 : 0) + (canExpand ? 1 : 0);

  // Cards below lg (1024px): every min-width table would still scroll
  // sideways on a tablet, so the stacked view covers everything under 1024.
  const wrap = nested
    ? 'rt-table hidden lg:block overflow-x-auto rounded-xl border border-line bg-white'
    : 'rt-table hidden lg:block overflow-x-auto rounded-2xl border border-line bg-card';
  const list = nested ? 'rt-cards space-y-2.5 lg:hidden' : 'rt-cards space-y-3 lg:hidden';
  const cardShell = nested
    ? 'overflow-hidden rounded-xl border border-line bg-white'
    : 'overflow-hidden rounded-2xl border border-line bg-card';

  const chevron = (expanded: boolean) => (
    <ChevronDown
      className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
      aria-hidden="true"
    />
  );
  const cellClass = (col: ResponsiveColumn<T>) =>
    [col.num ? 'num' : '', col.className ?? ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      {/* Desktop: the familiar data table. */}
      <div className={wrap}>
        <table className="data-table" style={minWidth ? { minWidth: `${minWidth}px` } : undefined}>
          <thead>
            <tr>
              {canExpand && (
                <th scope="col" className="w-10">
                  <span className="sr-only">{t('Expand')}</span>
                </th>
              )}
              {columns.map((col) => (
                <th key={col.label} scope="col" className={cellClass(col)}>
                  {col.label}
                </th>
              ))}
              {actions && (
                <th scope="col">
                  <span className="sr-only">{t('Actions')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = expandedOf(row);
              return (
                <Fragment key={getRowKey(row)}>
                  <tr className={expanded ? 'bg-paper-deep/40' : undefined}>
                    {canExpand && onToggle && (
                      <td>
                        <button
                          type="button"
                          onClick={() => onToggle(row)}
                          aria-expanded={expanded}
                          aria-label={expandAria ? expandAria(row, expanded) : expanded ? t('Hide') : t('Show')}
                          className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper-deep"
                        >
                          {chevron(expanded)}
                        </button>
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.label} className={cellClass(col)}>
                        {col.render(row)}
                      </td>
                    ))}
                    {actions && <td className="num">{actions(row)}</td>}
                  </tr>
                  {expanded && expandedContent && (
                    <tr>
                      <td colSpan={colCount} className="bg-paper/60 !p-4 sm:!p-5">
                        {expandedContent(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: the same rows as stacked cards. */}
      <ul className={list}>
        {rows.map((row) => {
          const expanded = expandedOf(row);
          const head = columns.filter((col) => col.primary);
          const body = columns.filter((col) => !col.primary && !col.hideOnMobile);
          return (
            <li key={getRowKey(row)} className={cardShell}>
              <div className="flex items-start gap-3 px-4 pt-4">
                {canExpand && onToggle && (
                  <button
                    type="button"
                    onClick={() => onToggle(row)}
                    aria-expanded={expanded}
                    aria-label={expandAria ? expandAria(row, expanded) : expanded ? t('Hide') : t('Show')}
                    className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-paper-deep"
                  >
                    {chevron(expanded)}
                  </button>
                )}
                {head.length > 0 && (
                  <div className="min-w-0 flex-1 space-y-1">
                    {head.map((col) => (
                      <div key={col.label}>{col.render(row)}</div>
                    ))}
                  </div>
                )}
              </div>

              {body.length > 0 && (
                <dl className="mt-3 divide-y divide-dotted divide-line/80 px-4 pb-1 text-sm">
                  {body.map((col) => (
                    <div
                      key={col.label}
                      className="flex items-baseline justify-between gap-4 py-1.5"
                    >
                      <dt className="shrink-0 text-muted">{col.label}</dt>
                      <dd
                        className={`min-w-0 text-end ${col.num ? 'tabular-nums' : ''} ${col.className ?? ''}`}
                      >
                        {col.render(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {expanded && expandedContent && (
                <div className="mt-3 border-t border-line bg-paper-deep/30 px-4 py-4">
                  {expandedContent(row)}
                </div>
              )}

              {actions && (
                <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-line bg-paper-deep/40 px-4 py-3">
                  {actions(row)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
