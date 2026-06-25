/** Curated dial-code list for the account phone selector (India-first). */
export interface Country {
  code: string; // ISO-2
  name: string;
  dial: string; // E.164 dial prefix without '+'
  flag: string; // emoji
  /** Acceptable national-number length range (digits, excluding dial code). */
  min: number;
  max: number;
}

export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India', dial: '91', flag: '🇮🇳', min: 10, max: 10 },
  { code: 'US', name: 'United States', dial: '1', flag: '🇺🇸', min: 10, max: 10 },
  { code: 'GB', name: 'United Kingdom', dial: '44', flag: '🇬🇧', min: 10, max: 10 },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', flag: '🇦🇪', min: 8, max: 9 },
  { code: 'SG', name: 'Singapore', dial: '65', flag: '🇸🇬', min: 8, max: 8 },
  { code: 'AU', name: 'Australia', dial: '61', flag: '🇦🇺', min: 9, max: 9 },
  { code: 'CA', name: 'Canada', dial: '1', flag: '🇨🇦', min: 10, max: 10 },
  { code: 'DE', name: 'Germany', dial: '49', flag: '🇩🇪', min: 10, max: 11 },
  { code: 'FR', name: 'France', dial: '33', flag: '🇫🇷', min: 9, max: 9 },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', flag: '🇸🇦', min: 9, max: 9 },
  { code: 'MY', name: 'Malaysia', dial: '60', flag: '🇲🇾', min: 9, max: 10 },
  { code: 'ID', name: 'Indonesia', dial: '62', flag: '🇮🇩', min: 9, max: 12 },
  { code: 'PH', name: 'Philippines', dial: '63', flag: '🇵🇭', min: 10, max: 10 },
  { code: 'BD', name: 'Bangladesh', dial: '880', flag: '🇧🇩', min: 10, max: 10 },
  { code: 'LK', name: 'Sri Lanka', dial: '94', flag: '🇱🇰', min: 9, max: 9 },
  { code: 'NP', name: 'Nepal', dial: '977', flag: '🇳🇵', min: 10, max: 10 },
  { code: 'PK', name: 'Pakistan', dial: '92', flag: '🇵🇰', min: 10, max: 10 },
  { code: 'ZA', name: 'South Africa', dial: '27', flag: '🇿🇦', min: 9, max: 9 },
  { code: 'NG', name: 'Nigeria', dial: '234', flag: '🇳🇬', min: 10, max: 10 },
  { code: 'KE', name: 'Kenya', dial: '254', flag: '🇰🇪', min: 9, max: 9 },
  { code: 'BR', name: 'Brazil', dial: '55', flag: '🇧🇷', min: 10, max: 11 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

export function countryByCode(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;
}

/** Validate a national number (digits only) against the country's length range. */
export function isValidNationalNumber(country: Country, digits: string): boolean {
  return /^\d+$/.test(digits) && digits.length >= country.min && digits.length <= country.max;
}
