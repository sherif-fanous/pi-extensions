/** The setup notices Theme Sync records, as the specs spell them. */

/** The deprecation notice for the default `light` and `dark` mapping. */
export const DEFAULT_DEPRECATION_NOTICE = deprecationNotice("light", "dark");

/** The deferral notice naming Pi's `themeSetting`. */
export function deferralNotice(themeSetting: string): string {
  return `Theme Sync is deprecated and is not changing themes because Pi's theme setting "${themeSetting}" already follows the terminal. Run pi remove npm:@sherif-fanous/pi-theme-sync to uninstall it.`;
}

/** The deprecation notice naming the `light` and `dark` theme mapping. */
export function deprecationNotice(light: string, dark: string): string {
  return `Theme Sync is deprecated because Pi now switches themes itself. Set "theme": "${light}/${dark}" in Pi's settings.json, then run pi remove npm:@sherif-fanous/pi-theme-sync.`;
}
