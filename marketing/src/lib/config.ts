// Central place for build-time configuration sourced from Vite env vars.

/** Target of the "Login / Go to Console" button. Defaults to the production console. */
export const CONSOLE_URL: string =
  import.meta.env.VITE_CONSOLE_URL ?? 'https://console.thinkaisolutions.com';

/** Sign-up entry point for new clients (the primary marketing CTA). */
export const CONSOLE_SIGNUP_URL: string = `${CONSOLE_URL}/signup`;

/** Public contact email shown across the site. */
export const CONTACT_EMAIL = 'admin@thinkaisolutions.com';

/** Public contact phone — display form + tel: form (digits only, with country code). */
export const CONTACT_PHONE = '+91 93917 14623';
export const CONTACT_PHONE_TEL = '+919391714623';

/** Registered business identity (shown for legitimacy / Meta verification). */
export const BUSINESS = {
  name: 'ThinkAiSolutions',
  type: 'Proprietorship',
  registration: 'Udyam Registered (MSME)',
  addressLine: 'Chinnapulleru, West Godavari District',
  region: 'Andhra Pradesh',
  postalCode: '534237',
  country: 'India',
  /** Single-line address for compact display. */
  fullAddress:
    'Chinnapulleru, West Godavari District, Andhra Pradesh 534237, India',
} as const;
