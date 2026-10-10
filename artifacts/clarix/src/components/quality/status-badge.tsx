import { useTranslation } from 'react-i18next';
import { CircleCheck, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/lib/quality-i18n';

/**
 * Quality status badge (green / yellow / red). Distinct from the import
 * lifecycle StatusBadge in components/imports/shared.tsx (draft/approved...).
 * Never colour alone: icon + text + accessible name. Status comes from the server.
 */
export type QualityStatus = 'green' | 'yellow' | 'red';

const TONE: Record<QualityStatus, { icon: LucideIcon; cls: string }> = {
  green: {
    icon: CircleCheck,
    cls: 'text-status-green border-[color-mix(in_srgb,var(--status-green)_38%,transparent)] bg-[color-mix(in_srgb,var(--status-green)_9%,var(--card))]',
  },
  yellow: {
    icon: TriangleAlert,
    cls: 'text-status-amber border-[color-mix(in_srgb,var(--status-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-amber)_10%,var(--card))]',
  },
  red: {
    icon: OctagonX,
    cls: 'text-status-red border-[color-mix(in_srgb,var(--status-red)_38%,transparent)] bg-[color-mix(in_srgb,var(--status-red)_8%,var(--card))]',
  },
};

export function isQualityStatus(s: unknown): s is QualityStatus {
  return s === 'green' || s === 'yellow' || s === 'red';
}

export function QualityStatusBadge({
  status,
  label,
  size = 'md',
  testId,
  className,
}: {
  status: QualityStatus;
  /** Optional text instead of OK/Check/Blocked (e.g. severity name); status word stays in the accessible name. */
  label?: string;
  size?: 'sm' | 'md';
  testId?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const tone = TONE[status];
  const Icon = tone.icon;
  const statusWord = t(`q.status.${status}`);
  const text = label ?? statusWord;
  const aria = label ? t('q.status.ariaWith', { label, status: statusWord }) : t('q.status.aria', { label: statusWord });
  return (
    <span
      role="img"
      aria-label={aria}
      data-testid={testId}
      data-status={status}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        tone.cls,
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden="true" strokeWidth={2.25} />
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
