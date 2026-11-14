import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';

import { resources } from './resources';

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: 'en',
        fallbackLng: 'en',
        defaultNS: 'common',
        interpolation: {
            escapeValue: false,
        },
    });

z.config(z.locales.en());

export default i18n;
