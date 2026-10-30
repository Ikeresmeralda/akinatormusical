import { COUNTRY_BY_CODE } from '@am/engine';

/** Nombres de país en inglés (tal y como vienen en los datasets) → código ISO. */
const NAME_TO_CODE: Record<string, string> = {
  'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  'northern ireland': 'GB', canada: 'CA', spain: 'ES', mexico: 'MX', colombia: 'CO', 'puerto rico': 'PR',
  argentina: 'AR', 'south korea': 'KR', korea: 'KR', ireland: 'IE', australia: 'AU', 'new zealand': 'NZ',
  sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', iceland: 'IS', france: 'FR', germany: 'DE',
  'west germany': 'DE', italy: 'IT', netherlands: 'NL', 'the netherlands': 'NL', belgium: 'BE', austria: 'AT',
  switzerland: 'CH', portugal: 'PT', greece: 'GR', luxembourg: 'LU', monaco: 'MC', malta: 'MT', cyprus: 'CY',
  'san marino': 'SM', andorra: 'AD', poland: 'PL', 'czech republic': 'CZ', czechia: 'CZ', slovakia: 'SK',
  hungary: 'HU', romania: 'RO', bulgaria: 'BG', croatia: 'HR', slovenia: 'SI', serbia: 'RS',
  'serbia & montenegro': 'RS', 'serbia and montenegro': 'RS', 'bosnia & herzegovina': 'BA',
  'bosnia and herzegovina': 'BA', montenegro: 'ME', 'north macedonia': 'MK', macedonia: 'MK', albania: 'AL',
  yugoslavia: 'YU', ukraine: 'UA', russia: 'RU', belarus: 'BY', moldova: 'MD', lithuania: 'LT', latvia: 'LV',
  estonia: 'EE', turkey: 'TR', armenia: 'AM', georgia: 'GE', azerbaijan: 'AZ', israel: 'IL', chile: 'CL',
  venezuela: 'VE', 'dominican republic': 'DO', cuba: 'CU', panama: 'PA', ecuador: 'EC', peru: 'PE',
  uruguay: 'UY', guatemala: 'GT', honduras: 'HN', 'el salvador': 'SV', nicaragua: 'NI', 'costa rica': 'CR',
  bolivia: 'BO', paraguay: 'PY', brazil: 'BR', jamaica: 'JM', barbados: 'BB', bahamas: 'BS', 'the bahamas': 'BS',
  'trinidad and tobago': 'TT', 'trinidad & tobago': 'TT', haiti: 'HT', 'u.s. virgin islands': 'VI', japan: 'JP',
  china: 'CN', taiwan: 'TW', 'hong kong': 'HK', india: 'IN', philippines: 'PH', thailand: 'TH', singapore: 'SG',
  indonesia: 'ID', nigeria: 'NG', 'south africa': 'ZA', ghana: 'GH', senegal: 'SN', cameroon: 'CM',
  'democratic republic of the congo': 'CD', ethiopia: 'ET', morocco: 'MA', 'cape verde': 'CV',
};

export function countryCode(name: string): string | null {
  const code = NAME_TO_CODE[name.trim().toLowerCase()];
  return code && COUNTRY_BY_CODE.has(code) ? code : null;
}

/** "United States;United Kingdom" → reparto de peso entre países. */
export function parseCountryList(value: string): Map<string, number> {
  const parts = value.split(/[;/]/).map((p) => countryCode(p)).filter((c): c is string => c !== null);
  const out = new Map<string, number>();
  for (const code of parts) out.set(code, (out.get(code) ?? 0) + 1 / parts.length);
  return out;
}

/** Hechos de región a partir de un reparto por países (suma de pesos). */
export function regionsOf(countries: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [code, w] of countries) {
    for (const region of COUNTRY_BY_CODE.get(code)?.regions ?? []) out.set(region, (out.get(region) ?? 0) + w);
  }
  return out;
}
