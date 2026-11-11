// 多语言：所有显示给用户看的文字都放在 src/shared/locales/ 里的 zh.json / en.json。
// 想加一种语言：复制一份 en.json，翻译，然后在主进程的语言列表里登记。

import { pick } from './util/math.js';

const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function createI18n(strings, language) {
  let lang = strings[language] ? language : 'en';

  return {
    get lang() {
      return lang;
    },
    setLanguage(next) {
      if (strings[next]) lang = next;
    },
    /** 取一段界面文字，比如 t('menu.quit') */
    t(key) {
      const value = dig(strings[lang], key) ?? dig(strings.en, key);
      return value == null ? key : value;
    },
    /**
     * 取一句台词，比如 line('hello', 'cat')。
     * 先找这种动物专属的（say.cat.hello），没有再用通用的（say.hello）；有好几句就随机挑一句。
     */
    line(key, speciesId) {
      let value = dig(strings[lang], `say.${speciesId}.${key}`) ?? dig(strings[lang], `say.${key}`) ?? dig(strings.en, `say.${key}`);
      if (Array.isArray(value)) value = pick(value);
      return typeof value === 'string' ? value : '';
    },
  };
}
