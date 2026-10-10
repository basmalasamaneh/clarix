import { useTranslation } from 'react-i18next';
import { isUnitKey, normalizeFixedText, normalizeSign, splitSignedNumbers, unitWord, type GrammaticalCase } from '@/lib/number-format';
import { cn } from '@/lib/utils';

export function useLang() {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('ar') ? ('ar' as const) : ('en' as const);
}

/** A server number string, isolated left-to-right so "-5" never shows as "5-". Clipboard gets the plain digits. */
export function SignedNum({ value, className, testId }: { value: string; className?: string; testId?: string }) {
  return <bdi dir="ltr" className={cn('num whitespace-nowrap', className)} data-testid={testId}>{normalizeSign(value)}</bdi>;
}

/**
 * Number + NBSP + plural-aware unit. The number is shown exactly as given.
 * Unknown units fall back to the given label (e.g. a raw factory unit).
 */
export function Qty({ value, unit, className, numClassName, unitClassName, grammaticalCase, fallbackUnit }: {
  value: string; unit: string; className?: string; numClassName?: string; unitClassName?: string; grammaticalCase?: GrammaticalCase; fallbackUnit?: string;
}) {
  const lang = useLang();
  const known = isUnitKey(unit);
  const word = known ? unitWord(value, unit, lang, { case: grammaticalCase }) : (fallbackUnit ?? unit);
  return (
    <span className={cn('whitespace-nowrap', className)}>
      <SignedNum value={value} className={numClassName} />
      {word && <>{'\u00A0'}<span className={unitClassName}>{word}</span></>}
    </span>
  );
}

/** Fixed server template sentence (never raw cells), formatted only at display. */
export function NumText({ text }: { text: string }) {
  const lang = useLang();
  return (
    <>
      {splitSignedNumbers(normalizeFixedText(text, lang)).map((p, i) =>
        p.kind === 'signed' ? <bdi key={i} dir="ltr" className="num whitespace-nowrap">{p.value}</bdi> : <span key={i}>{p.value}</span>,
      )}
    </>
  );
}
