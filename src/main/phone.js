'use strict';
// 手机提醒：待办到点（和提前提醒）的那一刻，把这条提醒也发到你的手机上。
//
// 默认关着。你在「待办」页最下面选了一家推送服务、照着设置好以后才会联网，而且只在提醒的那一刻
// （和你点"发一条试试"的时候）连那一家，只发这一条提醒。我们自己没有服务器，所以要借这些推送服务：
//
//   - ntfy（https://ntfy.sh，开源、免费、不用注册）：手机装 ntfy 这个 App，订阅一个"频道"。
//     没有注册，频道名就是密码（谁知道频道名谁就能收到），所以由我们随机生成一长串。
//     到点的那条优先级 4（手机屏幕顶上弹下来、长震动），提前的那条优先级 3（普通的声音和震动）。
//     发的格式见 ntfy 文档的 "Publish as JSON"：往 https://ntfy.sh/ 发一段 JSON。ntfy.sh 会把消息留 12 小时、每天最多 250 条。
//   - Server酱（https://sct.ftqq.com）：发到微信。你在它的网站上用微信扫码登录，复制一串 SendKey 填进来。
//     免费版每天最多 5 条，微信里的卡片只显示标题。新版 Server酱³ 的 key 以 sctp 开头，发送地址不一样
//     （照它官方 SDK serverchan-sdk 的写法）。
//
// 频道名、SendKey 存进存档前先用 Windows 自带的加密（Electron 的 safeStorage，换一台电脑或换一个 Windows 账户就解不开），
// 只在要发的时候解开、只发给那一家；日志里只写"发了一条 / 没发出去（原因）"，不写 key、不写网址、不写内容。

const crypto = require('node:crypto');

const SERVICES = ['off', 'ntfy', 'serverchan'];
const NTFY = 'https://ntfy.sh';
const TOPIC_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'; // 去掉了容易看错的 l、o、0、1（手机上要照着输入时不容易错）
const TOPIC = /^pawmail-[a-z0-9]{16}$/;
const SCT_KEY = /^(SCT[A-Za-z0-9]{8,80}|sctp\d{1,20}t[A-Za-z0-9]{8,80})$/;
const TIMEOUT = 15000; // 一次最多等 15 秒
const RETRY = [60 * 1000, 3 * 60 * 1000]; // 没连上网：过 1 分钟、再过 3 分钟各再试一次

/** 存档里的手机提醒设置：每一项都检查，不认识的丢掉（store.js 读存档时用） */
function sanitizePhone(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const secret = (v) => (typeof v === 'string' && v.length > 0 && v.length < 4096 && /^[A-Za-z0-9+/=]+$/.test(v) ? v : null);
  return {
    service: SERVICES.includes(r.service) ? r.service : 'off',
    ntfy: secret(r.ntfy), // 加密过的频道名（base64）
    sct: secret(r.sct), // 加密过的 SendKey（base64）
    hideText: r.hideText === true, // 不发具体内容：手机上只显示"有一件待办到点了"
    skipPresent: r.skipPresent === true, // 你在电脑前时不发到手机
  };
}

/** 新的 ntfy 频道名：pawmail- 加 16 个随机字母数字（约 80 位随机数，猜不到） */
function newTopic() {
  let s = 'pawmail-';
  for (let i = 0; i < 16; i++) s += TOPIC_CHARS[crypto.randomInt(TOPIC_CHARS.length)];
  return s;
}

/** Server酱的发送地址：sctp 开头的是 Server酱³（照它官方 SDK），其余的是 Turbo 版 */
function serverchanUrl(key) {
  const m = /^sctp(\d+)t/.exec(key);
  return m ? `https://${m[1]}.push.ft07.com/send/${key}.send` : `https://sctapi.ftqq.com/${key}.send`;
}

class PhonePush {
  /**
   * @param store       存档（store.data.phone）
   * @param fetch       (url, options) => Promise<Response>  发请求（平时是 Electron 的 net.fetch，自检时换成假的）
   * @param safeStorage Electron 的 safeStorage：加密 / 解密
   * @param texts       (kind, todos, hide) => { title, body }  发出去的字（main.js 按现在的语言拼）。kind：'due' | 'soon' | 'test'
   * @param onChange    设置变了（存档、让信纸窗口刷新）
   * @param log         (message) => void
   */
  constructor({ store, fetch, safeStorage, texts, onChange = () => {}, log = () => {} }) {
    this.store = store;
    this.fetch = fetch;
    this.safe = safeStorage;
    this.texts = texts;
    this.onChange = onChange;
    this.log = log;
  }

  get config() {
    if (!this.store.data.phone) this.store.data.phone = sanitizePhone(null);
    return this.store.data.phone;
  }

  /** 能不能加密保存（不能的话就不让用：频道名、key 不能明文存在存档里） */
  get canSave() {
    try {
      return this.safe.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  #encrypt(text) {
    return this.canSave ? this.safe.encryptString(text).toString('base64') : null;
  }

  #decrypt(b64) {
    if (!b64) return null;
    try {
      return this.safe.decryptString(Buffer.from(b64, 'base64'));
    } catch {
      return null; // 换了电脑、换了 Windows 账户：解不开，当作没填
    }
  }

  topic() {
    const t = this.#decrypt(this.config.ntfy);
    return t && TOPIC.test(t) ? t : null;
  }

  sctKey() {
    const k = this.#decrypt(this.config.sct);
    return k && SCT_KEY.test(k) ? k : null;
  }

  /** 选哪一家：'off' | 'ntfy' | 'serverchan'。第一次选 ntfy 时生成一个频道名 */
  setService(service) {
    if (!SERVICES.includes(service)) return false;
    if (service !== 'off' && !this.canSave) return false;
    if (service === 'ntfy' && !this.topic()) this.config.ntfy = this.#encrypt(newTopic());
    this.config.service = service;
    this.log(`[手机提醒] ${service === 'off' ? '关掉了' : `选了 ${service}`}`);
    this.onChange();
    return true;
  }

  /** 换一个新的频道名（原来的作废：手机上要重新订阅） */
  newTopic() {
    if (!this.canSave) return false;
    this.config.ntfy = this.#encrypt(newTopic());
    this.onChange();
    return true;
  }

  /** 填 Server酱 的 SendKey。返回 false = 看起来不像 SendKey */
  setSctKey(raw) {
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!SCT_KEY.test(key) || !this.canSave) return false;
    this.config.sct = this.#encrypt(key);
    this.onChange();
    return true;
  }

  setOptions({ hideText, skipPresent } = {}) {
    if (typeof hideText === 'boolean') this.config.hideText = hideText;
    if (typeof skipPresent === 'boolean') this.config.skipPresent = skipPresent;
    this.onChange();
    return true;
  }

  /** 给信纸窗口看的（频道名要给你看、要做成二维码；SendKey 只露头尾几个字） */
  view() {
    const c = this.config;
    const topic = this.topic();
    const key = this.sctKey();
    return {
      service: c.service,
      topic: c.service === 'ntfy' ? topic : null,
      link: c.service === 'ntfy' && topic ? `ntfy://ntfy.sh/${topic}?display=Pawmail` : null, // ntfy 安卓版认得这种链接：扫码直接订阅
      sctHint: key ? `${key.slice(0, 6)}…${key.slice(-3)}` : null,
      hideText: c.hideText,
      skipPresent: c.skipPresent,
      canSave: this.canSave,
    };
  }

  /**
   * 待办该提醒了（todos.js 的 onNotify 调过来）：发到手机。present = 你在电脑前（而且没在全屏打游戏）。
   * 没开、或者开了"我在电脑前时不发"而你正在，就不发
   */
  send(kind, todos, { present = false } = {}) {
    const c = this.config;
    if (c.service === 'off' || !todos.length || (c.skipPresent && present)) return Promise.resolve({ ok: true, skipped: true });
    return this.#deliver(this.texts(kind, todos, c.hideText), kind, true);
  }

  /** 「发一条试试」：马上发一条，告诉你结果（不重试，让你马上知道哪儿不对） */
  test() {
    if (this.config.service === 'off') return Promise.resolve({ ok: false, error: 'off' });
    return this.#deliver(this.texts('test', [], false), 'test', false);
  }

  async #deliver(message, kind, retry) {
    const service = this.config.service;
    for (let attempt = 0; ; attempt++) {
      const result = await this.#once(service, message, kind);
      if (result.ok) {
        this.log(`[手机提醒] 发了一条（${service}）`);
        return result;
      }
      this.log(`[手机提醒] 没发出去（${service}）：${result.error}${result.code !== undefined ? ` ${result.code}` : ''}`);
      // 只有没连上网、对方服务器临时出错才再试；key 不对、超过次数，再试也没用
      if (!retry || attempt >= RETRY.length || !['network', 'server'].includes(result.error)) return result;
      await new Promise((resolve) => setTimeout(resolve, RETRY[attempt]));
      if (this.config.service !== service) return result; // 等的时候你换了一家或者关掉了
    }
  }

  /** kind：'due' 到点（优先级 4，⏰）| 'soon' 提前（优先级 3，⏳）| 'test' 试发（优先级 3，🐾） */
  async #once(service, { title, body }, kind) {
    let url;
    let data;
    if (service === 'ntfy') {
      const topic = this.topic();
      if (!topic) return { ok: false, error: 'noTopic' };
      url = `${NTFY}/`;
      const tag = { due: 'alarm_clock', soon: 'hourglass_flowing_sand', test: 'paw_prints' }[kind];
      data = { topic, title, message: body, priority: kind === 'due' ? 4 : 3, tags: [tag] };
    } else if (service === 'serverchan') {
      const key = this.sctKey();
      if (!key) return { ok: false, error: 'noKey' };
      url = serverchanUrl(key);
      // 免费版的微信卡片只显示标题（最长 32 个字），所以把要紧的都放进标题
      data = { title: `${title} · ${body}`.slice(0, 32), desp: body, short: body.slice(0, 64) };
      if (!key.startsWith('sctp')) data.noip = 1; // 不在消息里显示是从哪个 IP 发的
    } else {
      return { ok: false, error: 'off' };
    }
    let res;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT);
    try {
      res = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify(data),
        signal: abort.signal,
      });
    } catch {
      return { ok: false, error: 'network' }; // 出错信息里可能带着网址（Server酱的网址里有 key），所以不往外传
    } finally {
      clearTimeout(timer);
    }
    if (service === 'ntfy') {
      if (res.ok) return { ok: true };
      return { ok: false, error: res.status === 429 ? 'limit' : res.status >= 500 ? 'server' : 'rejected', code: res.status };
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      // 不是 JSON：多半是对方服务器出错了
    }
    if (json && json.code === 0) return { ok: true };
    if (!json) return { ok: false, error: res.status >= 500 ? 'server' : 'rejected', code: res.status };
    return { ok: false, error: res.status >= 500 ? 'server' : 'rejected', code: Number(json.code) || res.status };
  }
}

module.exports = { PhonePush, sanitizePhone, serverchanUrl, SCT_KEY, TOPIC };
