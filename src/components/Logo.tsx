/**
 * The Waraq Pro mark: rounded icon + stacked wordmark (Arabic over a leaf
 * rule over English). Sizing is driven by the `--u` unit set in index.css
 * (responsive, and `.logo-lg` for the footer), so the lockup scales as one
 * piece. Fonts fall back to Readex Pro until the Cairo / Plus Jakarta Sans
 * files are self-hosted in /public/fonts (see fonts.css).
 */
export default function Logo({ tone = 'light', large = false }: { tone?: 'light' | 'dark'; large?: boolean }) {
  const dark = tone === 'dark';
  return (
    <span className={`logo-mark ${dark ? 'logo-dark' : 'logo-light'} ${large ? 'logo-lg' : ''}`}>
      <svg className="logo-icon" viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="14" fill={dark ? '#D8F26A' : '#123D35'} />
        <path
          d="M17.5 28.5 C15.2 23.2 18.2 18.2 24.2 17.5 C27.2 17.1 29.8 16.1 31.8 14.5 C34.2 20.8 33.4 27.6 28.2 30.8 C24.2 33.2 19.6 32.2 17.5 28.5 Z"
          fill="none"
          stroke={dark ? '#123D35' : '#D8F26A'}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.5 34.5 C15.2 29.8 18.8 26.8 24.5 24.2"
          fill="none"
          stroke={dark ? '#123D35' : '#D8F26A'}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
      {/*
        The wordmark block is locked to LTR so the lockup geometry is identical
        in both languages: the leaf stays under the dotless ٮ (it is its dot)
        at the 3.7/10.3 split, and "Waraq Pro" stays left-aligned under it.
        Without this, an RTL page mirrors the divider and pushes the leaf
        beneath the wrong letter.
      */}
      <span className="logo-wm" dir="ltr">
        <span className="logo-ar" lang="ar" dir="rtl">
          ورق ٮرو
        </span>
        <span className="logo-divider" aria-hidden="true">
          <span className="logo-bar logo-bar-a" />
          <svg className="logo-leaf" viewBox="0 0 16 12">
            <path d="M2 10 C2 4.5, 6.5 2, 14 2 C13.5 7.5, 9 10.5, 2 10 Z" fill="var(--logo-leaf)" />
          </svg>
          <span className="logo-bar logo-bar-b" />
        </span>
        <span className="logo-en" lang="en" dir="ltr">
          Waraq Pro
        </span>
      </span>
    </span>
  );
}
