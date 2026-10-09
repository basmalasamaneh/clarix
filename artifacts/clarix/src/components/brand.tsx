import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <defs>
        <linearGradient id="clarix-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#clarix-g)" />
      <path
        d="M21.5 10.2A8 8 0 1 0 21.5 21.8"
        fill="none"
        stroke="var(--on-primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <g stroke="var(--on-primary)" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
        <path d="M14 13h6" />
        <path d="M14 16h8" />
        <path d="M14 19h6" />
      </g>
    </svg>
  );
}

export function BrandLockup({ className, tagline }: { className?: string; tagline?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <div className="leading-tight">
        <div className="text-[1.05rem] font-semibold tracking-tight" dir="ltr">
          Clarix
        </div>
        {tagline && <div className="text-xs text-muted-foreground">{tagline}</div>}
      </div>
    </div>
  );
}
