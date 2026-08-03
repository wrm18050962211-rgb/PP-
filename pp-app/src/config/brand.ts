import brandConfig from '../../brand.config.json';

export type BrandPresentation = (typeof brandConfig)[keyof typeof brandConfig];

const simplifiedChineseLocales = ['zh-cn', 'zh-hans', 'zh-sg'];

export function resolveBrandPresentation(locales: readonly string[]): BrandPresentation {
  const useSimplifiedChinese = locales.some((locale) => {
    const normalized = locale.trim().toLowerCase();
    if (normalized === 'zh') {
      return true;
    }

    return simplifiedChineseLocales.some(
      (candidate) => normalized === candidate || normalized.startsWith(`${candidate}-`),
    );
  });

  return useSimplifiedChinese ? brandConfig.simplifiedChinese : brandConfig.default;
}

export function applyBrandPresentation(locales: readonly string[]): BrandPresentation {
  const presentation = resolveBrandPresentation(locales);
  document.documentElement.lang = presentation.htmlLang;
  document.title = presentation.name;

  for (const metaName of ['application-name', 'apple-mobile-web-app-title']) {
    document.querySelector<HTMLMetaElement>(`meta[name="${metaName}"]`)?.setAttribute('content', presentation.name);
  }

  return presentation;
}
