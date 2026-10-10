/** Bundled fonts as inline data: URLs (Vite ?url&inline). No network font is ever used by the print document. */
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url&inline';
import arabic400 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2?url&inline';
import arabic600 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2?url&inline';
import type { ReportFonts } from './render';

export const REPORT_FONTS: ReportFonts = { inter, arabic400, arabic600 };
