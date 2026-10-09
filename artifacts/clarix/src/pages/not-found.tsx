import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StateScreen } from '@/components/state-screen';

export default function NotFound({ home = '/' }: { home?: string }) {
  const { t } = useTranslation();
  return (
    <StateScreen
      icon={Compass}
      title={t('states.notFoundTitle')}
      body={t('states.notFoundBody')}
      code="404"
      testId="state-not-found"
      actions={
        <Button asChild>
          <Link href={home} data-testid="link-home">
            {t('states.notFoundAction')}
          </Link>
        </Button>
      }
    />
  );
}
