import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Database, GitCompare, Info } from 'lucide-react';
import { describeDifference, type OtherSourceOrder, type SettingsDifference } from '@/lib/sources-api';
import { PAGE_SIZE } from '@/lib/import-model';
import { Pager, Raw, Section } from '@/components/imports/shared';

export function PagedOrders({ orders, source, testId }: { orders: string[]; source: string; testId: string }) {
  const [page, setPage] = useState(1);
  const shown = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
      <ul className="flex flex-wrap gap-1" data-testid={testId}>
        {shown.map((o) => (
          <li key={o} className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-xs" data-testid={`${testId}-${o}`}>
            <Raw className="text-xs font-semibold">{o}</Raw>
            <span className="text-muted-foreground">·</span>
            <Raw className="text-xs text-muted-foreground">{source}</Raw>
          </li>
        ))}
      </ul>
      <Pager page={page} total={orders.length} onPage={setPage} testId={`pager-${testId}`} />
    </div>
  );
}

function OtherSources({ items }: { items: OtherSourceOrder[] }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  return (
    <div>
      <ul className="space-y-1" data-testid="list-other-source-orders">
        {items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((o, i) => (
          <li key={`${o.orderId}-${o.sourceName}-${i}`} className="flex items-start gap-2 text-sm" data-testid={`text-other-source-${o.orderId}`}>
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--series-good)]" aria-hidden="true" />
            <span>{t('src.info.other', { order: o.orderId, source: o.sourceName })}</span>
          </li>
        ))}
      </ul>
      <Pager page={page} total={items.length} onPage={setPage} testId="pager-other-source-orders" />
    </div>
  );
}

export function SettingsDiff({ diffs, source }: { diffs: SettingsDifference[]; source: string | null | undefined }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  return (
    <div data-testid="section-settings-diff">
      <p className="flex items-center gap-2 text-sm font-medium">
        <GitCompare className="size-4 text-primary" aria-hidden="true" />
        {t('src.info.diffTitle')}
      </p>
      <p className="mb-2 text-xs text-muted-foreground">{source ? t('src.info.diffBody', { source }) : t('src.info.diffBodyNone')}</p>
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
            {diffs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((d, i) => {
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
      <Pager page={page} total={diffs.length} onPage={setPage} testId="pager-settings-diff" />
    </div>
  );
}

export function SourceInfo({
  sourceName,
  archived,
  replacementOrders,
  otherSourceOrders,
  diffs,
  comparisonSource,
  approved,
}: {
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
              <PagedOrders orders={replacementOrders} source={sourceName} testId="list-source-replacements" />
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-source-replace-none">{t('src.info.replaceNone')}</p>
            )}
          </div>
        )}
        {otherSourceOrders.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('src.info.otherTitle')}</p>
            <OtherSources items={otherSourceOrders} />
          </div>
        )}
        {diffs.length > 0 && <SettingsDiff diffs={diffs} source={comparisonSource} />}
      </div>
    </Section>
  );
}
