interface LogoProps {
  /** Edge length in px (square). Default 24. */
  size?: number;
  /** Decorative when paired with the "Zolpanel" wordmark; standalone otherwise. */
  title?: string;
}

/**
 * Zolpanel brand mark — official asset (panel-icon.svg), rendered inline for
 * crisp scaling and theme independence. Do not recolor (correct-brand-logos).
 */
export default function Logo({ size = 24, title }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 240"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="zolpanel-logo-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3463FF" />
          <stop offset="1" stopColor="#1733B0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="240" height="240" rx="53.64" ry="53.64" fill="url(#zolpanel-logo-grad)" />
      <g transform="scale(2)">
        <rect x="20" y="24" width="80" height="20" rx="10" ry="10" fill="#FFFFFF" />
        <rect x="20" y="50" width="80" height="20" rx="10" ry="10" fill="#FFFFFF" />
        <rect x="20" y="76" width="80" height="20" rx="10" ry="10" fill="#FFFFFF" />
        <circle cx="33" cy="34" r="4.6" fill="#15E0C4" />
        <circle cx="33" cy="60" r="4.6" fill="#15E0C4" />
        <circle cx="33" cy="86" r="4.6" fill="#15E0C4" />
      </g>
    </svg>
  );
}
