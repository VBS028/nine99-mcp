import type { Intent } from "./types.js";

/**
 * Every pattern is paired across Romanian and Russian. A miss in one language
 * silently returns services as items for sale.
 *
 * Order matters: wanted beats parts beats service beats sale, because a
 * "Куплю на запчасти" ad is first and foremost a wanted-ad.
 *
 * Romanian verb stems use word boundaries to distinguish from noun inflections
 * (e.g., \bcump[ăa]r\b avoids matching "cumpărare"). Russian uses suffix-
 * inflection so stems remain unanchored to match inflected forms.
 */
const WANTED = /(\bcump[ăa]r\b|caut\s+s[ăa]\s+cump[ăa]r|куплю|скупк|покупаю|выкуп)/i;

const PARTS = /(pentru\s+piese|pe\s+piese|\bpiese\b|dezmembr|ecran\s+spart|display\s+spart|запчаст|на\s+запчас|плат[аы]\s+для|матриц|нерабоч|не\s+работает)/i;

const SERVICE = /(repara[țt]|deservire|instalare|montaj|configurare|deblocare|ремонт|установк|монтаж|настройк|разблокировк|прошивк|iptv|abonament|подписк|servicii|услуг|la\s+domiciliu|на\s+дому|выезд)/i;

const SALE = /(v[âa]nd|se\s+vinde|de\s+v[âa]nzare|ofer\s+spre\s+v[âa]nzare|прода[юме]|продаётся|продается|продам)/i;

export function classifyIntent(title: string, description = ""): Intent {
  const hay = `${title} || ${description}`;

  if (WANTED.test(hay)) return "wanted";
  if (PARTS.test(hay)) return "parts";
  if (SERVICE.test(hay)) return "service";
  if (SALE.test(hay)) return "sale";

  // No strong signal. Return unknown rather than guessing: the `sale` filter
  // keeps unknowns, because a false negative is invisible to the caller
  // while a false positive is merely noise they can dismiss.
  return "unknown";
}
