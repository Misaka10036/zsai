import { LanguageAbbreviation } from '@/constants/common';
import storage from '@/utils/authorization-util';
import dayjs from 'dayjs';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { upperFirst } from 'lodash';
import { initReactI18next } from 'react-i18next';
import translation_zh from './zh';

//The language is based on the .ng file stored in the client's local storage.
// The language stored in the database is for agent template resources, as these resources reside on the server.
// The app UI is fixed to the supported language list below.

const languageImports: Record<string, () => Promise<{ default: any }>> = {
  [LanguageAbbreviation.Zh]: () => import('./zh'),
};

const supportedLanguageCodes: Intl.UnicodeBCP47LocaleIdentifier[] =
  Object.keys(languageImports);

export const DEFAULT_LANGUAGE_CODE = LanguageAbbreviation.Zh;

export const normalizeLanguageCode = (lng?: string | null) =>
  supportedLanguageCodes.includes(lng as Intl.UnicodeBCP47LocaleIdentifier)
    ? (lng as Intl.UnicodeBCP47LocaleIdentifier)
    : DEFAULT_LANGUAGE_CODE;

export const supportedLanguages = supportedLanguageCodes.map((code) => {
  const locale = new Intl.Locale(code);

  return {
    code,
    locale,
    displayName: upperFirst(
      new Intl.DisplayNames(locale, { type: 'language' }).of(code)!,
    ),
  };
});

const resources = {
  [LanguageAbbreviation.Zh]: translation_zh,
};

const updateDocumentLocale = (lng: string) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = 'ltr';
  dayjs.locale(lng.startsWith('zh') ? 'zh-cn' : lng);
};

i18n
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    detection: {
      lookupLocalStorage: 'lng',
      order: ['localStorage'],
      caches: [],
    },
    supportedLngs: supportedLanguageCodes,
    resources,
    fallbackLng: DEFAULT_LANGUAGE_CODE,
    interpolation: {
      escapeValue: false,
    },
  });

export const loadLanguageAsync = async (lng: string): Promise<void> => {
  const normalizedLng = normalizeLanguageCode(lng);

  if (i18n.hasResourceBundle(normalizedLng, 'translation')) {
    return;
  }

  const importFn = languageImports[normalizedLng];
  if (!importFn) {
    console.warn(`Language ${lng} is not supported for lazy loading`);
    return;
  }

  try {
    const module = await importFn();
    const translationData = module.default?.translation || module.default;
    i18n.addResourceBundle(normalizedLng, 'translation', translationData);
  } catch (error) {
    console.error(`Failed to load language ${lng}:`, error);
  }
};

export const changeLanguageAsync = async (
  lng: string,
  options: { persist?: boolean } = {},
): Promise<void> => {
  const { persist = true } = options;
  const normalizedLng = normalizeLanguageCode(lng);

  if (!i18n.hasResourceBundle(normalizedLng, 'translation')) {
    await loadLanguageAsync(normalizedLng);
  }

  if (persist) {
    storage.setLanguage(normalizedLng);
  }

  updateDocumentLocale(normalizedLng);

  await i18n.changeLanguage(normalizedLng);
};

export const initLanguage = async (): Promise<void> => {
  const currentLng = normalizeLanguageCode(
    storage.getLanguage() || DEFAULT_LANGUAGE_CODE,
  );

  await changeLanguageAsync(currentLng);
};

export default i18n;
