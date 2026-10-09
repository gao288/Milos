import { messages, englishMessages } from './catalog.js';

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compile(pairs) {
  const map = new Map(pairs);
  const pattern = new RegExp([...map.keys()].sort((a, b) => b.length - a.length).map(escape).join('|'), 'gu');
  return text => text.replace(pattern, match => map.get(match));
}
const toEnglish = compile(messages), toChinese = compile(englishMessages);
export function translate(text, locale = 'en') {
  return locale === 'zh' ? toChinese(String(text)) : toEnglish(String(text));
}

// This imperative UI updates textContent in many independent animation/voice
// panels. Bind text nodes, not panel rerenders: changing language must not tear
// down Rive, audio, focus, form values or an active conversation.
export function installLanguageSwitch(root = document.querySelector('#app')) {
  let locale = 'en';
  try { if (localStorage.getItem('realpet.locale') === 'zh') locale = 'zh'; } catch {}
  const sources = new WeakMap(), attributes = new WeakMap();
  const ignored = 'script,style,textarea,code,[data-i18n-ignore]';
  const cache = new Map();
  const render = text => {
    const key = locale + ':' + text;
    if (!cache.has(key)) {
      if (cache.size > 2000) cache.clear();
      cache.set(key, translate(text, locale));
    }
    return cache.get(key);
  };
  function textNode(node) {
    if (!node.parentElement || node.parentElement.closest(ignored)) return;
    const current = node.nodeValue;
    if (!current.trim()) return;
    let record = sources.get(node);
    if (!record || (current !== record.rendered && current !== record.source)) record = { source: current };
    record.rendered = render(record.source);
    sources.set(node, record);
    if (current !== record.rendered) node.nodeValue = record.rendered;
  }
  function element(node) {
    if (node.closest('[data-i18n-ignore]')) return;
    let records = attributes.get(node);
    if (!records) { records = new Map(); attributes.set(node, records); }
    for (const name of ['aria-label', 'title', 'placeholder']) {
      const current = node.getAttribute(name);
      if (current === null) continue;
      let record = records.get(name);
      if (!record || (current !== record.rendered && current !== record.source)) record = { source: current };
      record.rendered = render(record.source); records.set(name, record);
      if (current !== record.rendered) node.setAttribute(name, record.rendered);
    }
  }
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) { textNode(node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    element(node);
    if (node.matches(ignored)) return;
    for (const child of node.childNodes) walk(child);
  }
  const button = document.createElement('button');
  button.id = 'ui-language'; button.className = 'btn language-toggle'; button.type = 'button';
  button.dataset.i18nIgnore = '';
  root.querySelector('.top-right').prepend(button);
  function apply() {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    button.textContent = locale === 'en' ? '中文' : 'English';
    button.setAttribute('aria-label', locale === 'en' ? 'Switch interface to Chinese' : '切换界面到英文');
    walk(root);
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') textNode(record.target);
      else if (record.type === 'attributes') element(record.target);
      else for (const node of record.addedNodes) walk(node);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['aria-label', 'title', 'placeholder'] });
  button.onclick = () => {
    locale = locale === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('realpet.locale', locale); } catch {}
    apply();
  };
  apply();
  return { disconnect: () => observer.disconnect() };
}
