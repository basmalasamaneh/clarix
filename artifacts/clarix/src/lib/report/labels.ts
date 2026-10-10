/** Localised labels for the print renderer, from the existing app dictionaries (fixed copy only, no AI). */
import i18n from '@/lib/i18n';
import '@/lib/imports-i18n';
import '@/lib/imports-i18n-fix';
import '@/lib/quality-i18n';
import '@/lib/runs-i18n';
import '@/lib/charts-i18n';
import type { ReportLabels, ReportLang } from './render';

export function reportLabels(lang: ReportLang): ReportLabels {
  const t = i18n.getFixedT(lang);
  return {
    metric: (k) => t(`rc.metric.${k}`, { defaultValue: k }),
    issue: (code) => (i18n.exists(`imp.issues.${code}`, { lng: lang }) ? t(`imp.issues.${code}`) : t('imp.issues.unknown', { code })),
    unit: (u) => t(`ch.unit.${u}`, { defaultValue: u }),
  };
}
