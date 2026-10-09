import { useTranslation } from 'react-i18next';
import { ShieldHalf } from 'lucide-react';
import { EmptyPanel, PageHeader } from '@/components/empty-page';

export default function PlatformPage() {
  const { t } = useTranslation();
  return (
    <div data-testid="page-platform">
      <PageHeader icon={ShieldHalf} title={t('pages.platform.title')} lead={t('pages.platform.lead')} meta={t('pages.platform.note')} />
      <EmptyPanel
        pageKey="platform"
        title={t('pages.platform.emptyTitle')}
        body={t('pages.platform.emptyBody')}
        items={[t('pages.platform.i1'), t('pages.platform.i2'), t('pages.platform.i3')]}
      />
    </div>
  );
}
