import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en.json';
import zhTranslation from './locales/zh.json';

i18n
  .use(initReactI18next) // 绑定 react-i18next
  .init({
    resources: {
      en: { translation: enTranslation },
      zh: { translation: zhTranslation }
    },
    lng: 'en', // 默认语言
    fallbackLng: 'en', // 如果找不到对应的翻译，默认退回到英文
    interpolation: {
      escapeValue: false // React 已经自带防 XSS 注入了，这里关掉
    }
  });

export default i18n;