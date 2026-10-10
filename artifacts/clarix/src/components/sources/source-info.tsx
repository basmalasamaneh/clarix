import { useTranslation } from 'react-i18next';
import { Archive, Database, GitCompare, Info } from 'lucide-react';
import { describeDifference, type OtherSourceOrder, type SettingsDifference } from '@/lib/sources-api';
import { Raw, Section } from '@/components/imports/shared';
import { ServerPaged } from '@/components/imports/review-paging';
import type { ReviewKind } from '@/lib/import-api';

export function PagedOrders({ importId, kind, orders, total, source, testId }: { importId: string; kind: ReviewKind; orders: string[]; total?: number; source: string; testId: string }) {
  return (
    <ServerPaged importId={importId} kind={kind} preview={orders} total={total ?? orders.length} testId={testId}>
      {(shown) => (
      <ul className="flex flex-wrap gap-1" data-testid={testId}>
        {shown.map((o) => (
          <li key={o} className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-xs" data-testid={`${testId}-${o}`}>
            <Raw className="text-xs font-semibold">{o}</Raw>
            <span className="text-muted-foreground">·</span>
            <Raw className="text-xs text-muted-foreground">{source}</Raw>
          </li>
        ))}
      </ul>
      )}
    </ServerPaged>
  );
}

function OtherSources({ importId, items, total }: { importId: string; items: OtherSourceOrder[]; total: number }) {
  const { t } = useTranslation();
  return (
    <ServerPaged importId={importId} kind="otherSourceOrders" preview={items} total={total} testId="other-source-orders">
      {(shown) => (
      <ul className="space-y-1" data-testid="list-other-source-orders">
        {shown.map((o, i) => (
          <li key={`${o.orderId}-${o.sourceName}-${i}`} className="flex items-start gap-2 text-sm" data-testid={`text-other-source-${o.orderId}`}>
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--series-good)]" aria-hidden="true" />
            <span>{t('src.info.other', { order: o.orderId, source: o.sourceName })}</span>
          </li>
        ))}
      </ul>
      )}
    </ServerPaged>
  );
}

export function SettingsDiff({ importId, diffs, total, source }: { importId: string; diffs: SettingsDifference[]; total: number; source: string | null | undefined }) {
  const { t } = useTranslation();
  return (
    <div data-testid="section-settings-diff">
      <p className="flex items-center gap-2 text-sm font-medium">
        <GitCompare className="size-4 text-primary" aria-hidden="true" />
        {t('src.info.diffTitle')}
      </p>
      <p className="mb-2 text-xs text-muted-foreground">{source ? t('src.info.diffBody', { source }) : t('src.info.diffBodyNone')}</p>
      <ServerPaged importId={importId} kind="settingsDifferences" preview={diffs} total={total} testId="settings-diff">
      {(shown, offset) => (
      <div className="min-w-0 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[480px] text-sm" data-testid="table-settings-diff">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium" />
              <th className="px-3 py-2 text-start font-medium">{t('src.info.here')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('src.info.there')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((d, j) => {
              const i = offset + j;
              const x = describeDifference(t, d);
              return (
                <tr key={`${d.path}-${i}`} data-testid={`row-settings-diff-${i}`}>
                  <td className="px-3 py-2 font-medium">{x.label}</td>
                  <td className="px-3 py-2"><Raw className="text-sm">{x.here}</Raw></td>
                  <td className="px-3 py-2 text-muted-foreground"><Raw className="text-sm">{x.there}</Raw></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      </ServerPaged>
    </div>
  );
}

export function SourceInfo({
  importId,
  counts = {},
  sourceName,
  archived,
  replacementOrders,
  otherSourceOrders,
  diffs,
  comparisonSource,
  approved,
}: {
  importId: string;
  counts?: { replacementOrders?: number; otherSourceOrders?: number; settingsDifferences?: number };
  sourceName: string;
  archived: boolean;
  replacementOrders: string[];
  otherSourceOrders: OtherSourceOrder[];
  diffs: SettingsDifference[];
  comparisonSource: string | null | undefined;
  approved: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Section title={t('src.info.title')} testId="section-source-info">
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Database className="size-4 text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">{t('src.info.source')}:</span>
          <Raw className="font-sans font-semibold">{sourceName}</Raw>
          {archived && (
            <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground" data-testid="badge-source-archived">
              <Archive className="size-3" aria-hidden="true" />
              {t('src.pick.archived')}
            </span>
          )}
        </p>
        {archived && !approved && (
          <p className="rounded-md bg-[color-mix(in_srgb,var(--status-amber)_8%,var(--card))] px-3 py-2 text-sm" role="alert" data-testid="text-source-archived">{t('src.info.archived')}</p>
        )}
        {!approved && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('src.info.replaceTitle')}</p>
            {replacementOrders.length > 0 ? (
              <PagedOrders importId={importId} kind="replacementOrders" orders={replacementOrders} total={counts.replacementOrders} source={sourceName} testId="list-source-replacements" />
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-source-replace-none">{t('src.info.replaceNone')}</p>
            )}
          </div>
        )}
        {otherSourceOrders.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('src.info.otherTitle')}</p>
            <OtherSources importId={importId} items={otherSourceOrders} total={counts.otherSourceOrders ?? otherSourceOrders.length} />
          </div>
        )}
        {diffs.length > 0 && <SettingsDiff importId={importId} diffs={diffs} total={counts.settingsDifferences ?? diffs.length} source={comparisonSource} />}
      </div>
    </Section>
  );
}
