/**
 * Horizontal locale tab bar — shown above the editor when a file
 * has translations in multiple locales.
 */
export function LocaleTabs({ locales, activeLocale, onSwitch }) {
  if (!locales || locales.length < 2) return null;
  return (
    <div class="locale-tabs">
      {locales.map((locale) => (
        <button
          key={locale}
          class={`locale-tab${locale === activeLocale ? " active" : ""}`}
          onClick={() => onSwitch(locale)}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
