export default function Logo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
        <rect width="40" height="40" rx="10" fill={dark ? '#10b981' : '#047857'} />
        <path d="M12 8.5h11l6 6V31.5H12z" fill="#fffdf8" />
        <path d="M23 8.5v6h6z" fill={dark ? '#047857' : '#9fd6bd'} />
        <path
          d="M15.5 20h9M15.5 24h9M15.5 28h5.5"
          stroke="#047857"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <span className="flex items-baseline gap-2 leading-none">
        <span
          className={`whitespace-nowrap font-display text-[1.5rem] font-semibold tracking-tight ${dark ? 'text-paper' : 'text-ink'}`}
        >
          Waraq Pro
        </span>
        <span
          lang="ar"
          dir="rtl"
          aria-hidden="true"
          className={`hidden whitespace-nowrap font-arabic text-lg font-medium min-[430px]:inline ${dark ? 'text-brass-soft' : 'text-primary'}`}
        >
          ورق برو
        </span>
      </span>
    </span>
  );
}
