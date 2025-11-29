const ACCESS_CODE = 'zjj123456';
const ACCESS_STORAGE_KEY = 'listing_access_granted';

const KEYWORD_TYPES = [
  { value: 'core', label: '核心词' },
  { value: 'feature', label: '特征词' },
  { value: 'scene', label: '场景词' },
  { value: 'minor', label: '小语种词' },
];

const TYPE_ALIASES = {
  core: 'core',
  核心: 'core',
  核心词: 'core',
  feature: 'feature',
  特征: 'feature',
  特征词: 'feature',
  scene: 'scene',
  场景: 'scene',
  场景词: 'scene',
  minor: 'minor',
  小语种: 'minor',
  小语种词: 'minor',
};

const DEFAULT_TYPE_COLORS = {
  core: '#FA5252',
  feature: '#4C6EF5',
  scene: '#12B886',
  minor: '#845EF7',
};

const DEFAULT_SKU_TITLE_LIMIT = 200;
const DEFAULT_SUBTITLE_LIMIT = 125;
const DEFAULT_SEARCH_TERM_LIMIT = 250;
const DEFAULT_API_KEY = 'sk-fae9b9725466489fad43c0589e6841cf';

const COLOR_CODE_MAP = {
  RD: 'Red',
  BK: 'Black',
  YH: 'Leopard Print',
  GR: 'Green',
  PK: 'Pink',
  BN: 'Brown',
  WH: 'White',
  SK: 'Skin',
};

const KNOWN_SIZE_CODES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const SIZE_CODE_SET = new Set(KNOWN_SIZE_CODES);

const COLOR_KEY_ALIASES = {
  red: ['red', 'scarlet', 'crimson'],
  black: ['black', 'jet'],
  green: ['green', 'emerald'],
  pink: ['pink', 'rose'],
  brown: ['brown', 'chocolate'],
  white: ['white'],
  'leopard print': ['leopard print', 'leopard'],
  skin: ['skin'],
};

const COLOR_LABEL_TO_KEY = Object.entries(COLOR_KEY_ALIASES).reduce((map, [key, aliases]) => {
  for (const alias of aliases) {
    map.set(alias, key);
  }
  return map;
}, new Map());

const BASE_COLOR_WORDS = Array.from(
  new Set(Object.values(COLOR_CODE_MAP).map((value) => value.toLowerCase())),
);

const WORD_REPEAT_LIMIT = 2;

const BANNED_AMAZON_WORDS = new Set(['best', 'sexy', 'deal', 'sell', 'cheapest', 'free']);
const BANNED_AMAZON_WATCHLIST = new Set([
  'discount',
  'promotion',
  'promo',
  'clearance',
  'sale',
  'coupon',
  'voucher',
  'giveaway',
  'bonus',
  'guarantee',
  'warranty',
]);
const BRAND_WHITELIST = new Set(['popilush']);
const BRAND_BLACKLIST = new Set(['oeak', 'spanx', 'skims', 'shapermint', 'yummie', 'hanes', 'maidenform', 'success']);

const TITLE_PREPOSITIONS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'up',
  'upon',
  'via',
  'with',
]);

const SEARCH_TYPE_PERCENTAGES = {
  core: 0.2,
  feature: 0.2,
  scene: 0.4,
  minor: 0.2,
};

const AI_ISSUE_CODE_ALIASES = {
  LENGTH: 'LENGTH',
  LENGTH_EXCEEDED: 'LENGTH',
  OVER_LIMIT: 'LENGTH',
  CHAR_LIMIT: 'LENGTH',
  BRAND: 'BRAND',
  TRADEMARK: 'BRAND',
  BRAND_WORD: 'BRAND',
  BANNED: 'BANNED_WORD',
  BANNED_WORD: 'BANNED_WORD',
  PROHIBITED: 'BANNED_WORD',
  WORD_REPEAT: 'WORD_REPEAT',
  REPEAT: 'WORD_REPEAT',
  DUPLICATE: 'WORD_REPEAT',
  CASE: 'CASE',
  LOWERCASE: 'CASE',
  UPPERCASE: 'CASE',
  FORMAT: 'CASE',
  OTHER: 'OTHER',
  MISC: 'OTHER',
};

const FIXED_KEYWORDS = {
  brand: {
    id: '__fixed_brand',
    text: 'Popilush',
    type: 'core',
    color: '#FA5252',
    virtual: true,
    fixed: true,
  },
  size: {
    id: '__fixed_size',
    text: 'Color Size',
    type: 'feature',
    color: '#4C6EF5',
    virtual: true,
    fixed: true,
  },
};

function sanitizeKeywordIdSegment(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseSkuComponents(raw) {
  const value = (raw || '').toString().trim();
  if (!value) {
    return { colorCode: null, featureCode: null, sizeCode: null, segments: [] };
  }
  const cleaned = value.replace(/\s+/g, '');
  const segments = cleaned
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.toUpperCase());

  let colorCode = null;
  let featureCode = null;
  let sizeCode = null;

  if (segments.length >= 2) {
    const colorSegment = segments[1];
    const match = colorSegment.match(/^([A-Z]{2,3})([A-Z0-9]*)$/);
    if (match) {
      colorCode = match[1];
      featureCode = match[2] ? match[2].replace(/[^A-Z0-9]/g, '') || null : null;
    } else {
      const letters = colorSegment.replace(/[^A-Z]/g, '');
      if (letters.length >= 2) {
        colorCode = letters.slice(0, Math.min(3, letters.length));
      }
    }
  }

  for (let i = 2; i < segments.length; i += 1) {
    const normalized = segments[i].replace(/[^A-Z0-9]/g, '');
    if (SIZE_CODE_SET.has(normalized)) {
      sizeCode = normalized;
      break;
    }
  }

  if (!sizeCode) {
    const fallbackSize = cleaned.toUpperCase().match(/(?:-|_)(XS|S|M|L|XL|XXL|3XL)(?:-|_|$)/);
    if (fallbackSize) {
      sizeCode = fallbackSize[1];
    }
  }

  return { colorCode, featureCode, sizeCode, segments };
}

function getCanonicalColorKey(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  if (!lower) return null;
  if (COLOR_LABEL_TO_KEY.has(lower)) {
    return COLOR_LABEL_TO_KEY.get(lower);
  }
  for (const [key, aliases] of Object.entries(COLOR_KEY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) {
      return key;
    }
  }
  return lower;
}

function detectColorMentions(text) {
  const mentions = new Set();
  if (!text) return mentions;
  const lower = text.toLowerCase();
  for (const [key, aliases] of Object.entries(COLOR_KEY_ALIASES)) {
    for (const alias of aliases) {
      const pattern = new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(lower)) {
        mentions.add(key);
        break;
      }
    }
  }
  return mentions;
}

function keywordConflictsWithColor(keyword, colorText) {
  if (!keyword || !colorText) return false;
  const mentions = detectColorMentions(keyword.text);
  if (!mentions.size) {
    return false;
  }
  const targetKey = getCanonicalColorKey(colorText);
  if (!targetKey) {
    return false;
  }
  for (const mention of mentions) {
    if (mention !== targetKey) {
      return true;
    }
  }
  return false;
}

function normalizeWordToken(word) {
  return (word || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function getKeywordWordTokens(keyword) {
  if (!keyword) return [];
  const text = keyword.text || '';
  return text
    .split(/\s+/)
    .map((part) => normalizeWordToken(part))
    .filter(Boolean);
}

function splitKeywordIntoWords(text) {
  return (text || '')
    .toString()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeWordForMatch(word) {
  return (word || '')
    .toString()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function exceedsWordLimitForKeywords(keywords, trailingKeywords = [], limit = WORD_REPEAT_LIMIT) {
  const counts = new Map();
  const addKeyword = (keyword) => {
    for (const token of getKeywordWordTokens(keyword)) {
      const next = (counts.get(token) || 0) + 1;
      if (next > limit) {
        return true;
      }
      counts.set(token, next);
    }
    return false;
  };
  for (const keyword of keywords || []) {
    if (addKeyword(keyword)) {
      return true;
    }
  }
  for (const keyword of trailingKeywords || []) {
    if (addKeyword(keyword)) {
      return true;
    }
  }
  return false;
}

function keywordWouldExceedWordLimit(keyword, counts, limit = WORD_REPEAT_LIMIT) {
  if (!keyword) return false;
  for (const token of getKeywordWordTokens(keyword)) {
    if ((counts.get(token) || 0) >= limit) {
      return true;
    }
  }
  return false;
}

function applyKeywordWordCount(keyword, counts) {
  if (!keyword) return counts;
  for (const token of getKeywordWordTokens(keyword)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function getContainerKey(spuId, containerType, containerId) {
  return [spuId || 'spu', containerType || 'title', containerId || 'default'].join('::');
}

function getContainerLockTarget(spuId, containerType, containerId) {
  const spu = state.spus.get(spuId);
  if (!spu) {
    return { spu: null, sku: null };
  }
  if (containerType === 'subtitle') {
    return { spu, sku: null };
  }
  const skuId = containerId || null;
  if (!skuId) {
    return { spu, sku: null };
  }
  const sku = spu.skus?.find((item) => item.id === skuId) || null;
  return { spu, sku };
}

function isContainerLocked(spuId, containerType, containerId) {
  const { spu, sku } = getContainerLockTarget(spuId, containerType, containerId);
  if (!spu) return false;
  if (containerType === 'subtitle') {
    return Boolean(spu.subtitleLocked);
  }
  if (!sku) return false;
  if (containerType === 'sku') {
    return Boolean(sku.titleLocked);
  }
  if (containerType === 'search') {
    return Boolean(sku.searchLocked);
  }
  return false;
}

function setContainerLocked(spuId, containerType, containerId, locked) {
  const { spu, sku } = getContainerLockTarget(spuId, containerType, containerId);
  if (!spu) return;
  if (containerType === 'subtitle') {
    spu.subtitleLocked = Boolean(locked);
    return;
  }
  if (!sku) return;
  if (containerType === 'sku') {
    sku.titleLocked = Boolean(locked);
  } else if (containerType === 'search') {
    sku.searchLocked = Boolean(locked);
  }
}

function updateLockButtonVisual(button, locked) {
  if (!button) return;
  button.dataset.locked = locked ? 'true' : 'false';
  button.setAttribute('aria-pressed', locked ? 'true' : 'false');
  button.classList.toggle('is-locked', locked);
  button.textContent = locked ? '🔒' : '🔓';
  const action = locked ? '点击解锁' : '点击锁定';
  button.title = `${locked ? '已锁定' : '未锁定'}，${action}`;
  button.setAttribute('aria-label', button.title);
}

function setButtonLoading(button, loading, text = '生成中...') {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = text;
  } else {
    const original = button.dataset.originalText;
    if (original) {
      button.textContent = original;
    }
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}

function tokenizeRequiredWords(text) {
  return splitKeywordIntoWords(text)
    .map((word) => normalizeWordForMatch(word))
    .filter((token) => token && !TITLE_LOWER_WORDS.has(token));
}

function getTokenVariants(token) {
  const variants = new Set([token]);
  if (token.endsWith('s') && token.length > 3) {
    variants.add(token.slice(0, -1));
  } else {
    variants.add(`${token}s`);
  }
  return variants;
}

function ensureRequiredTokens(originalText, candidateText) {
  const required = tokenizeRequiredWords(originalText);
  if (!required.length) return candidateText;

  const candidateWords = splitKeywordIntoWords(candidateText);
  const candidateTokens = candidateWords.map((word) => normalizeWordForMatch(word)).filter(Boolean);

  const missing = [];
  for (const token of required) {
    const variants = getTokenVariants(token);
    const exists = candidateTokens.some((cand) => variants.has(cand));
    if (!exists) {
      missing.push(token);
    }
  }

  if (!missing.length) {
    return candidateWords.join(' ');
  }

  const appended = candidateWords.concat(missing.map((token) => token));
  return appended.join(' ');
}

function collectKeywordMetaFromCollection(collection) {
  return (collection || [])
    .map((id) => state.keywords.get(id))
    .map((keyword) => {
      if (!keyword) return null;
      if (keyword.sourceKeywordId) {
        return state.keywords.get(keyword.sourceKeywordId) || keyword;
      }
      return keyword;
    })
    .filter((item) => item && item.text);
}

function buildTopCoreAndSceneContext(collection) {
  const metas = collectKeywordMetaFromCollection(collection);
  let topCore = null;
  const sceneWords = new Set();
  metas.forEach((meta) => {
    if (meta.type === 'core') {
      const heat = Number(meta.heat || meta.searchVolume || 0);
      if (!topCore || heat > (Number(topCore.heat || topCore.searchVolume || 0) || 0)) {
        topCore = meta;
      }
    }
    if (meta.type === 'scene') {
      splitKeywordIntoWords(meta.text).forEach((w) => {
        const norm = normalizeWordForMatch(w);
        if (norm) sceneWords.add(norm);
      });
    }
  });
  return { topCore, sceneWords };
}

function sanitizeOptimizedText({
  text,
  prefixText = '',
  suffixText = '',
  topCoreText = '',
  sceneWords = new Set(),
  includePrefix = false,
}) {
  const prefixWords = splitKeywordIntoWords(prefixText).map((w) => normalizeWordForMatch(w)).filter(Boolean);
  const suffixWords = splitKeywordIntoWords(suffixText).map((w) => normalizeWordForMatch(w)).filter(Boolean);
  const reserved = new Set([...prefixWords, ...suffixWords]);
  const sceneSet = new Set(sceneWords || []);
  const topCoreWords = splitKeywordIntoWords(topCoreText).filter(Boolean);
  const topCoreNorm = topCoreWords.map((w) => normalizeWordForMatch(w)).filter(Boolean);

  const middleWords = splitKeywordIntoWords(text).filter(Boolean);
  const filtered = middleWords.filter((word) => {
    const norm = normalizeWordForMatch(word);
    if (!norm) return false;
    if (reserved.has(norm)) return false;
    return true;
  });

  const withoutTopCore = filtered.filter((word) => {
    const norm = normalizeWordForMatch(word);
    return !topCoreNorm.includes(norm);
  });

  const reordered = [];
  if (topCoreWords.length) {
    reordered.push(...topCoreWords);
  }

  const sceneTail = [];
  const nonScene = [];
  withoutTopCore.forEach((word) => {
    const norm = normalizeWordForMatch(word);
    if (sceneSet.has(norm)) {
      sceneTail.push(word);
    } else {
      nonScene.push(word);
    }
  });

  reordered.push(...nonScene, ...sceneTail);
  const transformed = transformTitleText(reordered.join(' '));
  if (includePrefix && prefixWords.length) {
    return [prefixText, transformed, suffixText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  return transformed;
}

function trimTextToLimit(text, limit) {
  const words = splitKeywordIntoWords(text);
  const kept = [];
  for (const word of words) {
    const candidate = kept.concat(word).join(' ');
    if (candidate.length > limit && kept.length) {
      break;
    }
    kept.push(word);
  }
  return kept.join(' ');
}

function toggleContainerLock(spuId, containerType, containerId) {
  const locked = isContainerLocked(spuId, containerType, containerId);
  const next = !locked;
  setContainerLocked(spuId, containerType, containerId, next);
  const { spu, sku } = getContainerLockTarget(spuId, containerType, containerId);
  renderSpu(spuId);
  let label = '标题';
  if (containerType === 'subtitle') {
    label = '父标题';
  } else if (containerType === 'sku') {
    const name = sku?.name || sku?.id || '';
    label = name ? `SKU ${name} 标题` : 'SKU 标题';
  } else if (containerType === 'search') {
    const name = sku?.name || sku?.id || '';
    label = name ? `SKU ${name} Search Term` : 'Search Term';
  }
  const statusText = next ? '已锁定' : '已解锁';
  showToast(label ? `${label} ${statusText}` : statusText);
}

function registerTokenKeyword(token, ownerKey) {
  if (!token || !ownerKey) return;
  token.ownerKey = ownerKey;
  let set = state.containerTokens.get(ownerKey);
  if (!set) {
    set = new Set();
    state.containerTokens.set(ownerKey, set);
  }
  set.add(token.id);
}

function unregisterTokenKeyword(tokenId) {
  const keyword = state.keywords.get(tokenId);
  if (!keyword || !keyword.token) return;
  const ownerKey = keyword.ownerKey;
  if (ownerKey && state.containerTokens.has(ownerKey)) {
    const set = state.containerTokens.get(ownerKey);
    set.delete(tokenId);
    if (!set.size) {
      state.containerTokens.delete(ownerKey);
    }
  }
  state.keywords.delete(tokenId);
}

function cleanupTokensForOwner(ownerKey) {
  if (!ownerKey) return;
  const set = state.containerTokens.get(ownerKey);
  if (!set) return;
  for (const tokenId of set) {
    const keyword = state.keywords.get(tokenId);
    if (keyword && keyword.token) {
      state.keywords.delete(tokenId);
    }
  }
  state.containerTokens.delete(ownerKey);
}

function cleanupTokensForSpu(spuId) {
  if (!spuId) return;
  const prefix = `${spuId}::`;
  for (const key of Array.from(state.containerTokens.keys())) {
    if (key.startsWith(prefix)) {
      cleanupTokensForOwner(key);
    }
  }
}

function getReadableTextColor(background) {
  const hex = (background || '').toString().trim();
  if (!/^#?[0-9a-f]{6}$/i.test(hex)) {
    return '#1f2933';
  }
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2933' : '#ffffff';
}

function createTokenFromWord(word, { ownerKey, sourceId, color, textColor }) {
  const text = (word || '').trim();
  if (!text) return null;
  const resolvedColor = color || '#ffffff';
  const resolvedTextColor = textColor || getReadableTextColor(resolvedColor);
  const token = {
    id: `__token_${++tokenCounter}`,
    text,
    type: 'token',
    token: true,
    virtual: true,
    color: resolvedColor,
    textColor: resolvedTextColor,
    sourceKeywordId: sourceId,
    ownerKey,
  };
  state.keywords.set(token.id, token);
  registerTokenKeyword(token, ownerKey);
  return token.id;
}

function assignTokensToContainer(spuId, containerType, containerId, keywordIds) {
  const ownerKey = getContainerKey(spuId, containerType, containerId);
  const preservedTokens = new Set();
  for (const keywordId of keywordIds || []) {
    const keyword = state.keywords.get(keywordId);
    if (keyword && keyword.token) {
      preservedTokens.add(keyword.id);
    }
  }
  if (state.containerTokens.has(ownerKey)) {
    for (const tokenId of Array.from(state.containerTokens.get(ownerKey))) {
      if (!preservedTokens.has(tokenId)) {
        unregisterTokenKeyword(tokenId);
      }
    }
  }
  const tokenIds = [];
  for (const keywordId of keywordIds || []) {
    const keyword = state.keywords.get(keywordId);
    if (!keyword) continue;
    if (keyword.token) {
      transferTokenOwnership(keyword, ownerKey);
      tokenIds.push(keyword.id);
      continue;
    }
    const words = splitKeywordIntoWords(keyword.text);
    if (!words.length) continue;
    for (const word of words) {
      const tokenId = createTokenFromWord(word, {
        ownerKey,
        sourceId: keyword.id,
        color: keyword.color,
        textColor: keyword.textColor,
      });
      if (tokenId) {
        tokenIds.push(tokenId);
      }
    }
  }
  return tokenIds;
}

function splitContainerIntoTokens(spuId, containerType, containerId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const collection = getKeywordCollection(spu, containerType, containerId);
  const label = getContainerLabel(containerType);
  const labelMid = /[A-Za-z]/.test(label) ? ` ${label} ` : label;
  if (!collection || !collection.length) {
    showToast(`当前${labelMid}为空，无法细分`, true);
    return;
  }
  const tokenIds = assignTokensToContainer(spuId, containerType, containerId, collection);
  if (!tokenIds.length) {
    showToast('未能拆分出有效的单词', true);
    return;
  }
  const target = getKeywordCollection(spu, containerType, containerId);
  if (!target) return;
  target.splice(0, target.length, ...tokenIds);
  renderSpu(spuId);
  showToast(`已将${labelMid}拆分为单词，可继续微调`);
}

function trimDuplicateTokens(spuId, containerType, containerId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const collection = getKeywordCollection(spu, containerType, containerId);
  const label = getContainerLabel(containerType);
  const labelMid = /[A-Za-z]/.test(label) ? ` ${label} ` : label;
  if (!collection || !collection.length) {
    showToast(`当前${labelMid}为空，暂无可处理的词`, true);
    return;
  }
  const tokenKeywords = collection
    .map((keywordId) => state.keywords.get(keywordId))
    .filter((keyword) => keyword?.token);
  if (!tokenKeywords.length) {
    showToast(`请先对${labelMid}执行逐词细分`, true);
    return;
  }
  const limit = Math.max(WORD_REPEAT_LIMIT, 1);
  const totals = new Map();
  for (const keyword of tokenKeywords) {
    const key = (keyword.text || '').trim().toLowerCase();
    if (!key) continue;
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  const extras = new Map();
  let expectedRemovals = 0;
  for (const [key, count] of totals.entries()) {
    if (!key) continue;
    if (count > limit) {
      const extra = count - limit;
      extras.set(key, extra);
      expectedRemovals += extra;
    }
  }
  if (!expectedRemovals) {
    showToast('未检测到需要删除的重复词');
    return;
  }
  let removed = 0;
  for (let index = collection.length - 1; index >= 0; index -= 1) {
    const keywordId = collection[index];
    const keyword = state.keywords.get(keywordId);
    if (!keyword?.token) continue;
    const key = (keyword.text || '').trim().toLowerCase();
    if (!key) continue;
    const remaining = extras.get(key) || 0;
    if (!remaining) continue;
    collection.splice(index, 1);
    unregisterTokenKeyword(keyword.id);
    removed += 1;
    if (remaining === 1) {
      extras.delete(key);
    } else {
      extras.set(key, remaining - 1);
    }
  }
  if (!removed) {
    showToast('未检测到需要删除的重复词');
    return;
  }
  renderSpu(spuId);
  showToast(`已删除${removed}个重复词`);
}

function clearContainerKeywords(spuId, containerType, containerId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const collection = getKeywordCollection(spu, containerType, containerId);
  const label = getContainerLabel(containerType);
  const labelMid = /[A-Za-z]/.test(label) ? ` ${label} ` : label;
  if (!Array.isArray(collection) || !collection.length) {
    showToast(`当前${labelMid}已为空`, true);
    return;
  }
  const ownerKey = getContainerKey(spuId, containerType, containerId);
  cleanupTokensForOwner(ownerKey);
  collection.splice(0, collection.length);
  renderSpu(spuId);
  showToast(`已清空${labelMid}`);
}

function transferTokenOwnership(keyword, newOwnerKey) {
  if (!keyword || !keyword.token) return;
  const oldOwner = keyword.ownerKey;
  if (oldOwner && state.containerTokens.has(oldOwner)) {
    const set = state.containerTokens.get(oldOwner);
    set.delete(keyword.id);
    if (!set.size) {
      state.containerTokens.delete(oldOwner);
    }
  }
  keyword.ownerKey = newOwnerKey;
  if (!newOwnerKey) return;
  let set = state.containerTokens.get(newOwnerKey);
  if (!set) {
    set = new Set();
    state.containerTokens.set(newOwnerKey, set);
  }
  set.add(keyword.id);
}

function getSourceKeywordSet(keywordIds) {
  const set = new Set();
  for (const keywordId of keywordIds || []) {
    const keyword = state.keywords.get(keywordId);
    if (!keyword) continue;
    if (keyword.token && keyword.sourceKeywordId) {
      set.add(keyword.sourceKeywordId);
    } else if (keyword.id) {
      set.add(keyword.id);
    }
  }
  return set;
}

function extractKeywordTokens(text) {
  const rawTokens = (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && token.length > 2);
  const tokens = new Set();
  for (const token of rawTokens) {
    tokens.add(token);
    if (token.endsWith('ies') && token.length > 3) {
      tokens.add(`${token.slice(0, -3)}y`);
    } else if (token.endsWith('es') && token.length > 3 && !token.endsWith('ses')) {
      const base = token.slice(0, -2);
      tokens.add(base);
      tokens.add(`${base}e`);
    } else if (token.endsWith('s') && token.length > 3 && !token.endsWith('ss')) {
      tokens.add(token.slice(0, -1));
    }
  }
  return Array.from(tokens);
}

function keywordsShareCoreRoot(keywordA, keywordB) {
  if (!keywordA || !keywordB) return false;
  const tokensA = new Set(extractKeywordTokens(keywordA.text));
  const tokensB = new Set(extractKeywordTokens(keywordB.text));
  if (!tokensA.size || !tokensB.size) return false;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      return true;
    }
  }
  return false;
}

const TITLE_LOWER_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'on',
  'at',
  'to',
  'from',
  'by',
  'of',
  'in',
  'with',
  'over',
  'into',
  'onto',
  'per',
  'via',
  'vs',
  'as',
  'up',
  'off',
]);

function extractEdgeToken(keyword, position) {
  if (!keyword?.text) return '';
  const tokens = keyword.text
    .toLowerCase()
    .match(/\p{L}[\p{L}\p{N}'-]*/gu);
  if (!tokens || !tokens.length) return '';
  return position === 'first' ? tokens[0] : tokens[tokens.length - 1];
}

function keywordsCauseBoundaryDuplicate(prevKeyword, nextKeyword) {
  if (!prevKeyword || !nextKeyword) return false;
  const tail = extractEdgeToken(prevKeyword, 'last');
  const head = extractEdgeToken(nextKeyword, 'first');
  if (!tail || !head) return false;
  return tail === head;
}

function hasEdgeDuplicates(keywords) {
  if (!Array.isArray(keywords)) return false;
  for (let i = 0; i < keywords.length - 1; i += 1) {
    if (keywordsCauseBoundaryDuplicate(keywords[i], keywords[i + 1])) {
      return true;
    }
  }
  return false;
}

function keywordSharesRootWithList(keyword, list) {
  if (!keyword || !Array.isArray(list)) return false;
  return list.some((item) => keywordsShareCoreRoot(keyword, item));
}

function hasRootOverlap(list) {
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (keywordsShareCoreRoot(list[i], list[j])) {
        return true;
      }
    }
  }
  return false;
}

function canAppendKeyword(currentWords, keyword, { enforceEdges = false, enforceRoots = false } = {}) {
  if (!keyword) return false;
  if (!Array.isArray(currentWords) || !currentWords.length) {
    return true;
  }
  const options = { enforceEdges, enforceRoots };
  if (options.enforceEdges && keywordsCauseBoundaryDuplicate(currentWords[currentWords.length - 1], keyword)) {
    return false;
  }
  if (options.enforceRoots && keywordSharesRootWithList(keyword, currentWords)) {
    return false;
  }
  return true;
}

function transformTitleText(text) {
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const transformed = words.map((word, index) => {
    const hasDigit = /\d/.test(word);
    const isUpper = !hasDigit && /[A-Z]/.test(word) && word === word.toUpperCase();
    if (hasDigit || isUpper) {
      return word;
    }
    const lower = word.toLowerCase();
    if (index > 0 && TITLE_LOWER_WORDS.has(lower)) {
      return lower;
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
  return transformed.join(' ');
}

function transformSearchText(text) {
  return (text || '').toLowerCase();
}

function reviewEntryText(text, { kind }) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (!words.length) {
    return kind === 'search' ? transformSearchText('') : transformTitleText('');
  }
  const normalized = words.map((word) => normalizeWordToken(word));
  const counts = new Map();
  for (const token of normalized) {
    if (!token) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const remove = new Array(words.length).fill(false);
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const token = normalized[index];
    if (!token) continue;
    let current = counts.get(token) || 0;
    if (BRAND_BLACKLIST.has(token) && !BRAND_WHITELIST.has(token)) {
      remove[index] = true;
      counts.set(token, current - 1);
      continue;
    }
    if (BANNED_AMAZON_WORDS.has(token)) {
      remove[index] = true;
      counts.set(token, current - 1);
      continue;
    }
    if (current > WORD_REPEAT_LIMIT) {
      remove[index] = true;
      counts.set(token, current - 1);
    }
  }
  const filteredWords = words.filter((_, index) => !remove[index]);
  const result = filteredWords.join(' ').trim();
  if (kind === 'search') {
    return transformSearchText(result);
  }
  return transformTitleText(result);
}

function getTotalSkuCount() {
  let count = 0;
  for (const spu of state.spus.values()) {
    count += Array.isArray(spu.skus) ? spu.skus.length : 0;
  }
  return count;
}

function computeFrequencyDenominator() {
  return Math.max(1, getTotalSkuCount() + 1);
}

function formatFrequencyRatio(ratio) {
  if (!Number.isFinite(ratio)) {
    return '0%';
  }
  const value = Math.max(0, ratio);
  return `${Math.round(value * 1000) / 10}%`;
}

function createPreviewBucket({ enableFrequency = false } = {}) {
  return {
    items: [],
    enableFrequency,
    frequencies: enableFrequency ? null : undefined,
    analysis: enableFrequency ? '' : undefined,
    reviews: new Map(),
  };
}

const SEARCH_TYPE_PATTERN = createSearchPattern();

const DEFAULT_FIVE_POINT_PROMPT =
  'You are an Amazon listing expert. Analyze the product information and write five concise Amazon bullet points in English, following marketplace rules.';

const state = {
  keywords: new Map(), // id -> keyword object
  spus: new Map(), // id -> { id, name, info, subtitleKeywords: [], skus: [] }
  keywordTypeColors: { ...DEFAULT_TYPE_COLORS },
  pendingKeywords: [],
  containerTokens: new Map(),
  settings: {
    skuTitleLimit: DEFAULT_SKU_TITLE_LIMIT,
    subtitleLimit: DEFAULT_SUBTITLE_LIMIT,
    searchTermLimit: DEFAULT_SEARCH_TERM_LIMIT,
  },
  preview: {
    titles: createPreviewBucket({ enableFrequency: true }),
    search: createPreviewBucket({ enableFrequency: true }),
  },
  previewFormats: {
    titles: 'simple',
    search: 'simple',
  },
  previewColorWords: new Set(),
  libraryCollapsed: false,
  librarySearchTerm: '',
};

function normalizeRank(value) {
  return (value || '').toString().trim().toUpperCase();
}

function enforceCoreRankRequirement(keyword) {
  if (!keyword) {
    return { changed: false, rank: '' };
  }
  const normalizedRank = normalizeRank(keyword.rank);
  const isRankA = normalizedRank.startsWith('A') && normalizedRank.length >= 1;
  if (keyword.type === 'core' && !isRankA) {
    keyword.type = 'feature';
    keyword.color =
      state.keywordTypeColors.feature || DEFAULT_TYPE_COLORS.feature || keyword.color;
    return { changed: true, rank: normalizedRank };
  }
  return { changed: false, rank: normalizedRank };
}

async function ensureSkuColorSize(sku) {
  if (!sku) return null;
  const parsed = parseSkuComponents(sku.name);
  let colorText = parsed.colorCode ? COLOR_CODE_MAP[parsed.colorCode] : null;
  if (!colorText && parsed.colorCode && parsed.colorCode.length > 2) {
    colorText = transformTitleText(parsed.colorCode.toLowerCase());
  }

  let sizeText = parsed.sizeCode && SIZE_CODE_SET.has(parsed.sizeCode) ? parsed.sizeCode : null;
  if (!sizeText) {
    const fallback = (sku.name || '').toUpperCase().match(/(?:-|_)(XS|S|M|L|XL|XXL|3XL)(?:-|_|$)/);
    if (fallback) {
      sizeText = fallback[1];
    }
  }

  let aiAttempted = false;
  let aiDeclined = false;
  let colorResolved = Boolean(colorText);
  let sizeResolved = Boolean(sizeText);

  if (!colorResolved || !sizeResolved) {
    const missingDesc = !colorResolved && !sizeResolved ? '颜色和尺码' : !colorResolved ? '颜色' : '尺码';
    const useAi = confirm(
      `未能识别 SKU ${sku.name || ''} 的${missingDesc}，是否调用 AI 协助识别？`,
    );
    if (useAi) {
      aiAttempted = true;
      const aiResult = await requestSkuColorSizeViaAI(sku.name, {
        size: sizeText || parsed.sizeCode || '',
        colorCode: parsed.colorCode || '',
      });
      if (aiResult) {
        if (!colorResolved && aiResult.color) {
          colorText = transformTitleText(aiResult.color.trim());
          colorResolved = Boolean(colorText);
        }
        if (!sizeResolved && aiResult.size) {
          const normalized = aiResult.size.trim().toUpperCase();
          if (SIZE_CODE_SET.has(normalized)) {
            sizeText = normalized;
            sizeResolved = true;
          }
        }
      }
    } else {
      aiDeclined = true;
    }
  }

  if ((!colorResolved || !sizeResolved) && (aiDeclined || !aiAttempted)) {
    if (!colorResolved) {
      const manualColor = prompt(`请输入 SKU ${sku.name || ''} 的颜色（英文）`);
      if (!manualColor) {
        return null;
      }
      colorText = transformTitleText(manualColor.trim());
      colorResolved = Boolean(colorText);
    }
    if (!sizeResolved) {
      const manualSize = prompt(
        `请输入 SKU ${sku.name || ''} 的尺码（可选：${KNOWN_SIZE_CODES.join('/')})`,
      );
      if (!manualSize) {
        return null;
      }
      const normalized = manualSize.trim().toUpperCase();
      if (!SIZE_CODE_SET.has(normalized)) {
        showToast('输入的尺码不在允许范围内', true);
        return null;
      }
      sizeText = normalized;
      sizeResolved = true;
    }
  }

  if ((!colorResolved || !sizeResolved) && aiAttempted) {
    if (!colorResolved) {
      const manualColor = prompt(`AI 未能识别 SKU ${sku.name || ''} 的颜色，请手动输入（英文）`);
      if (!manualColor) {
        return null;
      }
      colorText = transformTitleText(manualColor.trim());
      colorResolved = Boolean(colorText);
    }
    if (!sizeResolved) {
      const manualSize = prompt(
        `AI 未能识别 SKU ${sku.name || ''} 的尺码，请手动输入（可选：${KNOWN_SIZE_CODES.join('/')})`,
      );
      if (!manualSize) {
        return null;
      }
      const normalized = manualSize.trim().toUpperCase();
      if (!SIZE_CODE_SET.has(normalized)) {
        showToast('输入的尺码不在允许范围内', true);
        return null;
      }
      sizeText = normalized;
      sizeResolved = true;
    }
  }

  if (!colorResolved || !sizeResolved) {
    return null;
  }

  sku.colorText = colorText;
  sku.sizeText = sizeText;

  return { color: colorText, size: sizeText };
}

async function requestSkuColorSizeViaAI(rawSku, context = {}) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast('请先输入有效的 DeepSeek API Key', true);
    return null;
  }
  try {
    const detailParts = [];
    if (context.colorCode) {
      detailParts.push(`颜色代号：${context.colorCode}`);
    }
    if (context.size) {
      detailParts.push(`已识别尺码：${context.size}`);
    }
    const detail = detailParts.length ? `（${detailParts.join('，')}）` : '';
    const prompt =
      `${schemaInstruction}\n审核规则：\n- ${rules.join('\n- ')}\n\n待审查列表（JSON）：\n${payload}`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'You analyze SKU codes for apparel products. Respond with JSON like {"color":"Red","size":"M"}. Size must be one of XS,S,M,L,XL,XXL,3XL or empty.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
      }),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || '请求失败');
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('未获取到有效的返回内容');
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const match = content.match(/```json([\s\S]*?)```/i);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw error;
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('返回格式无法解析');
    }
    const color = typeof parsed.color === 'string' ? parsed.color.trim() : '';
    const size = typeof parsed.size === 'string' ? parsed.size.trim().toUpperCase() : '';
    return { color, size };
  } catch (error) {
    console.error(error);
    showToast(`AI 识别失败：${error.message}`, true);
    return null;
  }
}

async function ensureColorSizeKeywordsForSku(sku) {
  const resolved = await ensureSkuColorSize(sku);
  if (!resolved) return null;
  const { color, size } = resolved;
  if (!color || !size) return null;

  const featureColor = state.keywordTypeColors.feature || DEFAULT_TYPE_COLORS.feature;
  const colorId = `__color_${sanitizeKeywordIdSegment(color)}`;
  const sizeId = `__size_${sanitizeKeywordIdSegment(size)}`;

  const colorKeyword = {
    id: colorId,
    text: `Color ${color}`,
    type: 'feature',
    color: featureColor,
    virtual: true,
    heatValue: Number.NEGATIVE_INFINITY,
  };

  const sizeKeyword = {
    id: sizeId,
    text: `Size ${size}`,
    type: 'feature',
    color: featureColor,
    virtual: true,
    heatValue: Number.NEGATIVE_INFINITY,
  };

  const ensureKeyword = (keyword) => {
    const existing = state.keywords.get(keyword.id);
    if (existing) {
      Object.assign(existing, keyword);
      return existing;
    }
    state.keywords.set(keyword.id, keyword);
    return keyword;
  };

  return {
    color: ensureKeyword(colorKeyword),
    size: ensureKeyword(sizeKeyword),
  };
}

let keywordCounter = 0;
let spuCounter = 0;
let skuCounter = 0;
let pendingKeywordCounter = 0;
let tokenCounter = 0;

const topNav = document.querySelector('.top-nav');
const annotationTooltip = document.createElement('div');
annotationTooltip.className = 'annotation-tooltip';
document.body.appendChild(annotationTooltip);

function selectElementContents(element) {
  if (!element) return;
  const selection = window.getSelection?.();
  if (!selection) return;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.addRange(range);
}
const libraryPanel = document.getElementById('library-section');
const libraryBody = document.getElementById('library-body');
const toggleLibraryBtn = document.getElementById('toggle-library');
const librarySearchInput = document.getElementById('library-search');

const keywordCategoryEls = {
  core: document.getElementById('keyword-list-core'),
  feature: document.getElementById('keyword-list-feature'),
  scene: document.getElementById('keyword-list-scene'),
  minor: document.getElementById('keyword-list-minor'),
};
const keywordCategoryCountEls = {
  core: document.querySelector('[data-count-type="core"]'),
  feature: document.querySelector('[data-count-type="feature"]'),
  scene: document.querySelector('[data-count-type="scene"]'),
  minor: document.querySelector('[data-count-type="minor"]'),
};
const keywordForm = document.getElementById('keyword-form');
const clearLibraryBtn = document.getElementById('clear-library');
const exportKeywordsBtn = document.getElementById('export-keywords');
const keywordTypeSelect = document.getElementById('keyword-type');
const keywordColorInput = document.getElementById('keyword-color');
const typeColorGrid = document.getElementById('type-color-grid');
const libraryTypeLegend = document.getElementById('library-type-legend');
const spuForm = document.getElementById('spu-form');
const spuContainer = document.getElementById('spu-container');
const apiKeyInput = document.getElementById('api-key');
const apiKeyEditBtn = document.getElementById('api-key-edit');
const skuTitleLimitInput = document.getElementById('sku-title-limit');
const subtitleLimitInput = document.getElementById('subtitle-limit');
const searchLimitInput = document.getElementById('search-limit');
const bulkKeywordTextarea = document.getElementById('bulk-keyword-text');
const bulkKeywordSubmit = document.getElementById('bulk-keyword-submit');
const bulkKeywordClear = document.getElementById('bulk-keyword-clear');
const pendingKeywordPanel = document.getElementById('pending-keyword-panel');
const pendingKeywordList = document.getElementById('pending-keyword-list');
const pendingBulkActions = document.getElementById('pending-bulk-actions');
const pendingRetryAllBtn = document.getElementById('pending-retry-all');
const spuSummaryList = document.getElementById('spu-summary-list');
const spuSummaryEmpty = document.getElementById('spu-summary-empty');

const previewElements = {
  container: document.getElementById('preview-list'),
  empty: document.getElementById('preview-empty'),
  exportBtn: document.getElementById('preview-export'),
  colorSwapBtn: document.getElementById('preview-color-swap'),
  copyTitlesBtn: document.getElementById('preview-copy-titles'),
  copySearchBtn: document.getElementById('preview-copy-search'),
};

const titlePreviewElements = {
  frequencyBlock: document.getElementById('title-frequency-block'),
  frequencyList: document.getElementById('title-preview-frequency-list'),
  frequencyBtn: document.getElementById('title-preview-frequency'),
  frequencyClear: document.getElementById('title-preview-frequency-clear'),
};

const searchPreviewElements = {
  frequencyBlock: document.getElementById('search-frequency-block'),
  frequencyList: document.getElementById('search-preview-frequency-list'),
  frequencyBtn: document.getElementById('search-preview-frequency'),
  frequencyClear: document.getElementById('search-preview-frequency-clear'),
};

const fivePointContainer = document.getElementById('five-point-container');
const fivePointTemplate = document.getElementById('five-point-template');

const accessGate = document.getElementById('access-gate');
const accessForm = document.getElementById('access-form');
const accessCodeInput = document.getElementById('access-code-input');
const accessErrorEl = document.getElementById('access-error');

const keywordPillTemplate = document.getElementById('keyword-pill-template');
const keywordEditTemplate = document.getElementById('keyword-edit-template');
const spuTemplate = document.getElementById('spu-template');
const skuTemplate = document.getElementById('sku-template');

ensureFixedKeywords();
initializeApiKeyField();

function updateSearchShortageMessage(spuId, skuId, message) {
  const skuEl = spuContainer.querySelector(`.sku-card[data-sku-id="${skuId}"][data-spu-id="${spuId}"]`);
  const shortage = skuEl?.querySelector('.search-shortage');
  if (!shortage) return;
  if (message) {
    shortage.textContent = message;
    shortage.hidden = false;
  } else {
    shortage.textContent = '';
    shortage.hidden = true;
  }
}

function setLibraryCollapsed(collapsed) {
  state.libraryCollapsed = Boolean(collapsed);
  if (libraryPanel) {
    libraryPanel.classList.toggle('collapsed', state.libraryCollapsed);
  }
  if (libraryBody) {
    libraryBody.hidden = state.libraryCollapsed;
  }
  if (toggleLibraryBtn) {
    toggleLibraryBtn.textContent = state.libraryCollapsed ? '打开面板' : '收起面板';
    toggleLibraryBtn.setAttribute('aria-expanded', (!state.libraryCollapsed).toString());
  }
}

setLibraryCollapsed(state.libraryCollapsed);

if (toggleLibraryBtn) {
  toggleLibraryBtn.addEventListener('click', () => {
    setLibraryCollapsed(!state.libraryCollapsed);
  });
}

if (exportKeywordsBtn) {
  exportKeywordsBtn.addEventListener('click', exportLibraryKeywords);
}

if (librarySearchInput) {
  librarySearchInput.value = state.librarySearchTerm || '';
  const handleLibrarySearch = (event) => {
    const value = event?.target?.value ?? '';
    if (state.librarySearchTerm === value) {
      return;
    }
    state.librarySearchTerm = value;
    renderKeywordLibrary();
  };
  librarySearchInput.addEventListener('input', handleLibrarySearch);
  librarySearchInput.addEventListener('search', handleLibrarySearch);
}

function updateNavMetrics() {
  if (!topNav) return;
  const navHeight = topNav.offsetHeight;
  if (!navHeight) return;
  const value = `${navHeight}px`;
  const root = document.documentElement;
  root.style.setProperty('--nav-height', value);
  root.style.setProperty('--nav-offset', value);
}

let navMetricsRaf = null;
if (topNav) {
  const scheduleNavUpdate = () => {
    if (navMetricsRaf) {
      cancelAnimationFrame(navMetricsRaf);
    }
    navMetricsRaf = requestAnimationFrame(updateNavMetrics);
  };
  window.addEventListener('resize', scheduleNavUpdate);
  window.addEventListener('load', updateNavMetrics);
  updateNavMetrics();
}

function getKeywordTypeLabel(type) {
  return KEYWORD_TYPES.find((item) => item.value === type)?.label || '未分类';
}

function getKeywordCollection(spu, containerType, containerId) {
  if (containerType === 'subtitle') {
    if (!Array.isArray(spu.subtitleKeywords)) {
      spu.subtitleKeywords = [];
    }
    return spu.subtitleKeywords;
  }
  if (containerType === 'search') {
    const skuSearch = spu.skus.find((item) => item.id === containerId);
    if (!skuSearch) return null;
    if (!Array.isArray(skuSearch.searchKeywords)) {
      skuSearch.searchKeywords = [];
    }
    return skuSearch.searchKeywords;
  }
  const sku = spu.skus.find((item) => item.id === containerId);
  return sku?.titleKeywords ?? null;
}

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createSearchPattern() {
  const buckets = Object.entries(SEARCH_TYPE_PERCENTAGES).map(([type, ratio]) => ({
    type,
    remaining: Math.max(1, Math.round(ratio * 10)),
  }));
  const pattern = [];
  let added = true;
  while (added) {
    added = false;
    for (const bucket of buckets) {
      if (bucket.remaining > 0) {
        pattern.push(bucket.type);
        bucket.remaining -= 1;
        added = true;
      }
    }
  }
  return pattern;
}

function parseHeatValue(raw) {
  if (raw == null) return Number.NEGATIVE_INFINITY;
  const text = String(raw).trim();
  if (!text) return Number.NEGATIVE_INFINITY;
  const normalized = text.replace(/[^0-9+\-.]/g, '');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function getKeywordHeatValue(keyword) {
  if (!keyword) return Number.NEGATIVE_INFINITY;
  return Number.isFinite(keyword.heatValue) ? keyword.heatValue : Number.NEGATIVE_INFINITY;
}

function getKeywordSortableHeat(keyword) {
  if (!keyword) return Number.NEGATIVE_INFINITY;
  const base = getKeywordHeatValue(keyword);
  if (keyword.token && keyword.sourceKeywordId) {
    const source = state.keywords.get(keyword.sourceKeywordId);
    const sourceHeat = getKeywordHeatValue(source);
    return Math.max(base, sourceHeat);
  }
  return base;
}

function compareKeywordsForLibrary(a, b) {
  const heatDiff = getKeywordHeatValue(b) - getKeywordHeatValue(a);
  if (heatDiff !== 0) return heatDiff;
  return a.text.localeCompare(b.text, 'zh-Hans-CN');
}

function ensureFixedKeywords() {
  for (const keyword of Object.values(FIXED_KEYWORDS)) {
    if (!state.keywords.has(keyword.id)) {
      state.keywords.set(keyword.id, { ...keyword, heatValue: parseHeatValue(keyword.heat) });
    }
  }
}

function initializeApiKeyField() {
  if (!apiKeyInput) return;
  if (!(apiKeyInput.value || '').trim()) {
    apiKeyInput.value = DEFAULT_API_KEY;
  }
  if (apiKeyEditBtn) {
    apiKeyEditBtn.addEventListener('click', () => {
      const nextKey = window.prompt('请输入新的 DeepSeek API Key');
      if (nextKey == null) return;
      const trimmed = nextKey.trim();
      if (!trimmed) {
        showToast('已保留当前 API Key');
        return;
      }
      apiKeyInput.value = trimmed;
      showToast('API Key 已更新');
    });
  }
}

function getSearchLimit() {
  const limit = Number(state.settings.searchTermLimit);
  if (Number.isFinite(limit) && limit > 0) {
    return limit;
  }
  return DEFAULT_SEARCH_TERM_LIMIT;
}

function updateKeywordColorInput(selectedType = keywordTypeSelect.value) {
  const color = state.keywordTypeColors[selectedType] || DEFAULT_TYPE_COLORS[selectedType] || '#4C6EF5';
  if (keywordColorInput) {
    keywordColorInput.value = color;
  }
}

function renderLibraryTypeLegend() {
  if (!libraryTypeLegend) return;
  const items = libraryTypeLegend.querySelectorAll('[data-type]');
  items.forEach((item) => {
    const type = item.dataset.type;
    if (!type) return;
    const color = state.keywordTypeColors[type] || DEFAULT_TYPE_COLORS[type];
    const swatch = item.querySelector('i');
    if (swatch) {
      swatch.style.setProperty('--legend-color', color || '#4C6EF5');
    }
  });
}

function createKeyword({ text, heat, rank, color, type }) {
  const id = `kw_${++keywordCounter}`;
  const finalType = KEYWORD_TYPES.some((item) => item.value === type) ? type : 'core';
  const keyword = {
    id,
    text,
    heat,
    rank,
    type: finalType,
    color: color || state.keywordTypeColors[finalType] || DEFAULT_TYPE_COLORS[finalType] || DEFAULT_TYPE_COLORS.core,
    heatValue: parseHeatValue(heat),
  };
  const enforcement = enforceCoreRankRequirement(keyword);
  if (enforcement.changed) {
    keyword.color =
      state.keywordTypeColors[keyword.type] || DEFAULT_TYPE_COLORS[keyword.type] || keyword.color;
  }
  state.keywords.set(id, keyword);
  renderKeywordLibrary();
  renderSpuList();
  return keyword;
}

function renderKeywordLibrary() {
  const searchTerm = (state.librarySearchTerm || '').toString();
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const hasSearch = Boolean(normalizedSearch);
  if (librarySearchInput && librarySearchInput.value !== searchTerm) {
    librarySearchInput.value = searchTerm;
  }
  const groups = {};
  for (const { value } of KEYWORD_TYPES) {
    groups[value] = [];
    const container = keywordCategoryEls[value];
    if (container) {
      container.innerHTML = '';
    }
    const countEl = keywordCategoryCountEls[value];
    if (countEl) {
      countEl.textContent = '';
    }
  }

  for (const keyword of state.keywords.values()) {
    if (keyword.virtual) continue;
    const type = KEYWORD_TYPES.some((item) => item.value === keyword.type) ? keyword.type : 'core';
    if (hasSearch) {
      const haystack = [keyword.text, keyword.rank, keyword.heat]
        .filter((value) => value != null && value !== '')
        .map((value) => value.toString().toLowerCase());
      if (!haystack.some((value) => value.includes(normalizedSearch))) {
        continue;
      }
    }
    if (!groups[type]) {
      groups[type] = [];
    }
    if (!Number.isFinite(keyword.heatValue)) {
      keyword.heatValue = parseHeatValue(keyword.heat);
    }
    groups[type].push(keyword);
  }

  for (const { value, label } of KEYWORD_TYPES) {
    const container = keywordCategoryEls[value];
    const countEl = keywordCategoryCountEls[value];
    const list = groups[value] || [];
    if (countEl) {
      if (list.length) {
        countEl.textContent = `${list.length} 个词`;
      } else if (hasSearch) {
        countEl.textContent = '无匹配';
      } else {
        countEl.textContent = '';
      }
    }
    if (!container) continue;
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'hint empty-hint';
      empty.textContent = hasSearch ? '未找到匹配的关键词' : `暂无${label}`;
      container.appendChild(empty);
      continue;
    }
    const fragment = document.createDocumentFragment();
    const sorted = list.slice().sort(compareKeywordsForLibrary);
    for (const keyword of sorted) {
      fragment.appendChild(
        createKeywordPill(keyword, {
          allowRemove: !keyword.fixed,
          context: { scope: 'library' },
        }),
      );
    }
    container.appendChild(fragment);
  }
}

function createKeywordPill(keyword, { allowRemove, context } = {}) {
  const pill = keywordPillTemplate.content.firstElementChild.cloneNode(true);
  pill.dataset.keywordId = keyword.id;
  pill.dataset.keywordType = keyword.type || 'core';
  const isToken = Boolean(keyword.token);
  if (isToken) {
    pill.classList.add('token-pill');
  }
  const defaultColor = state.keywordTypeColors[keyword.type] || '#4c6ef5';
  const background = keyword.color || defaultColor;
  pill.style.background = background;
  if (isToken) {
    const foreground = keyword.textColor || getReadableTextColor(background);
    pill.style.setProperty('--token-background', background);
    pill.style.setProperty('--token-foreground', foreground);
    pill.style.color = foreground;
  } else if (keyword.textColor) {
    pill.style.color = keyword.textColor;
  }
  pill.querySelector('.keyword-label').textContent = keyword.text;
  const metaParts = [];
  if (keyword.heat) metaParts.push(`热度: ${keyword.heat}`);
  if (keyword.rank) metaParts.push(`排名: ${keyword.rank}`);
  const metaEl = pill.querySelector('.keyword-meta');
  if (metaEl) {
    if (isToken) {
      metaEl.textContent = '';
      metaEl.hidden = true;
    } else if (metaParts.length) {
      metaEl.textContent = metaParts.join(' | ');
      metaEl.hidden = false;
    } else {
      metaEl.textContent = '';
      metaEl.hidden = true;
    }
  }
  const isLibrary = context?.scope === 'library';
  const removeBtn = pill.querySelector('.pill-remove');
  if (removeBtn) {
    if (allowRemove && (!keyword.fixed || isLibrary)) {
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isLibrary) {
          deleteKeywordFromLibrary(keyword.id);
        } else if (context) {
          const { spuId, containerId, containerType, keywordId } = context;
          const spu = state.spus.get(spuId);
          if (!spu) return;
          const collection = getKeywordCollection(spu, containerType, containerId);
          if (!collection) return;
          const index = collection.indexOf(keywordId);
          if (index < 0) return;
          collection.splice(index, 1);
          if (keyword.token) {
            unregisterTokenKeyword(keyword.id);
          }
          renderSpu(spuId);
        }
      });
    } else {
      removeBtn.remove();
    }
  }

  const editBtn = pill.querySelector('.pill-edit');
  if (editBtn) {
    if (isToken) {
      editBtn.remove();
    } else if (isLibrary && !keyword.fixed) {
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openKeywordEditor(keyword.id);
      });
    } else {
      editBtn.remove();
    }
  }

  pill.addEventListener('dragstart', (event) => handleDragStart(event, { context }));
  pill.addEventListener('click', () => copyKeyword(keyword));
  return pill;
}

function deleteKeywordFromLibrary(keywordId) {
  const keyword = state.keywords.get(keywordId);
  if (!keyword || keyword.fixed) return;
  state.keywords.delete(keywordId);
  for (const spu of state.spus.values()) {
    if (Array.isArray(spu.subtitleKeywords)) {
      spu.subtitleKeywords = spu.subtitleKeywords.filter((id) => id !== keywordId);
    }
    for (const sku of spu.skus) {
      if (Array.isArray(sku.titleKeywords)) {
        sku.titleKeywords = sku.titleKeywords.filter((id) => id !== keywordId);
      }
      if (Array.isArray(sku.searchKeywords)) {
        sku.searchKeywords = sku.searchKeywords.filter((id) => id !== keywordId);
      }
    }
  }
  renderKeywordLibrary();
  renderSpuList();
  showToast(`已从关键词库移除“${keyword.text}”`);
}

function openKeywordEditor(keywordId) {
  const keyword = state.keywords.get(keywordId);
  if (!keyword || keyword.fixed || !keywordEditTemplate) return;
  const overlay = keywordEditTemplate.content.firstElementChild.cloneNode(true);
  const textEl = overlay.querySelector('.keyword-edit-text');
  const typeSelect = overlay.querySelector('.keyword-edit-type');
  const heatInput = overlay.querySelector('.keyword-edit-heat');
  const rankInput = overlay.querySelector('.keyword-edit-rank');
  const cancelBtn = overlay.querySelector('.keyword-edit-cancel');
  const form = overlay.querySelector('.keyword-edit-form');

  if (textEl) textEl.textContent = keyword.text;
  if (typeSelect) {
    typeSelect.value = KEYWORD_TYPES.some((item) => item.value === keyword.type) ? keyword.type : 'core';
  }
  if (heatInput) heatInput.value = keyword.heat || '';
  if (rankInput) rankInput.value = keyword.rank || '';

  const close = () => {
    overlay.remove();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', (event) => {
      event.preventDefault();
      close();
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const newType = typeSelect?.value && KEYWORD_TYPES.some((item) => item.value === typeSelect.value)
        ? typeSelect.value
        : 'core';
      const newHeat = heatInput?.value?.trim() || '';
      const newRank = rankInput?.value?.trim() || '';
      keyword.type = newType;
      keyword.heat = newHeat;
      keyword.rank = newRank;
      keyword.heatValue = parseHeatValue(newHeat);
      keyword.color =
        state.keywordTypeColors[newType] ||
        DEFAULT_TYPE_COLORS[newType] ||
        keyword.color;
      const enforcement = enforceCoreRankRequirement(keyword);
      if (enforcement.changed) {
        keyword.color =
          state.keywordTypeColors[keyword.type] ||
          DEFAULT_TYPE_COLORS[keyword.type] ||
          keyword.color;
      }
      close();
      renderKeywordLibrary();
      renderSpuList();
      showToast(
        enforcement.changed ? '排名非 A 的词已自动归类为特征词' : '关键词信息已更新',
      );
    });
  }

  document.body.appendChild(overlay);
}

function renderDropzoneKeywords(dropzone, keywords, optionsFactory) {
  dropzone.querySelectorAll('.keyword-pill').forEach((pill) => pill.remove());
  const placeholder = dropzone.querySelector('.placeholder');
  const annotationContainer = dropzone.parentElement?.querySelector('.title-annotation');
  const shouldAnnotate = Boolean(annotationContainer);
  const keywordIds = Array.isArray(keywords) ? keywords : [];
  const hasTokens = keywordIds.some((keywordId) => state.keywords.get(keywordId)?.token);
  const aiButton = dropzone.querySelector('.ai-refine');
  const splitButton = dropzone.querySelector('.split-words');
  if (splitButton) {
    splitButton.disabled = !keywordIds.length;
  }
  const trimButton = dropzone.querySelector('.trim-duplicates');
  if (trimButton) {
    trimButton.hidden = !hasTokens;
    trimButton.disabled = !hasTokens;
  }
  const clearButton = dropzone.querySelector('.clear-dropzone');
  if (clearButton) {
    clearButton.disabled = !keywordIds.length;
  }
  const lockButton = dropzone.querySelector('.lock-dropzone');
  const containerType = dropzone.dataset.containerType || 'sku';
  const containerId = dropzone.dataset.containerId || dropzone.dataset.skuId;
  const spuId = dropzone.dataset.spuId || dropzone.closest('[data-spu-id]')?.dataset.spuId;
  const locked = spuId ? isContainerLocked(spuId, containerType, containerId) : false;
  if (lockButton && spuId) {
    lockButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleContainerLock(spuId, containerType, containerId);
    };
    updateLockButtonVisual(lockButton, locked);
  }
  if (typeof locked === 'boolean') {
    dropzone.dataset.locked = locked ? 'true' : 'false';
    dropzone.classList.toggle('is-locked', locked);
  }
  if (aiButton) {
    aiButton.disabled = locked || !keywordIds.length;
  }
  if (!keywordIds.length) {
    if (placeholder) placeholder.hidden = false;
    if (shouldAnnotate) {
      renderTitleAnnotations(dropzone, []);
    }
    updateDropzoneMeta(dropzone, keywordIds);
    return;
  }
  if (placeholder) placeholder.hidden = true;
  for (const keywordId of keywordIds) {
    const keyword = state.keywords.get(keywordId);
    if (!keyword) continue;
    let options = optionsFactory ? optionsFactory(keywordId, keyword) : {};
    if (keyword.fixed) {
      options = { ...options, allowRemove: false };
    }
    const pill = createKeywordPill(keyword, options);
    dropzone.appendChild(pill);
  }
  if (shouldAnnotate) {
    renderTitleAnnotations(dropzone, keywordIds);
  }
  updateDropzoneMeta(dropzone, keywordIds);
}

function buildWordEntriesFromKeywordIds(keywordIds) {
  const entries = [];
  for (const keywordId of keywordIds || []) {
    const keyword = state.keywords.get(keywordId);
    if (!keyword) continue;
    const words = splitKeywordIntoWords(keyword.text);
    if (!words.length) continue;
    for (const word of words) {
      const normalized = normalizeWordForMatch(word);
      if (!normalized) continue;
      entries.push({
        text: word,
        normalized,
        keywordId,
      });
    }
  }
  return entries;
}

function findKeywordMatches(wordEntries) {
  if (!wordEntries.length) return [];
  const normalizedWords = wordEntries.map((entry) => entry.normalized);
  const matches = [];
  for (const keyword of state.keywords.values()) {
    if (!keyword || keyword.virtual || keyword.token) continue;
    const words = splitKeywordIntoWords(keyword.text);
    const normalized = words.map((word) => normalizeWordForMatch(word)).filter(Boolean);
    if (!normalized.length || normalized.length > normalizedWords.length) continue;
    for (let i = 0; i <= normalizedWords.length - normalized.length; i += 1) {
      let matched = true;
      for (let j = 0; j < normalized.length; j += 1) {
        if (normalizedWords[i + j] !== normalized[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        matches.push({
          keyword,
          start: i,
          end: i + normalized.length - 1,
          length: normalized.length,
          wordIndices: normalized.map((_, index) => i + index),
        });
      }
    }
  }
  return matches;
}

function formatWordForDisplay(word, index, { isSearch = false } = {}) {
  const raw = (word || '').trim();
  if (!raw) return '';
  if (isSearch) {
    return raw;
  }
  const upper = raw.toUpperCase();
  if (SIZE_CODE_SET.has(upper) || /^[A-Z0-9]+$/.test(raw)) {
    return upper;
  }
  const lower = raw.toLowerCase();
  if (index > 0 && TITLE_PREPOSITIONS.has(lower)) {
    return lower;
  }
  return raw
    .split('-')
    .map((segment) => {
      if (!segment) return segment;
      const first = segment.charAt(0);
      return first.toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join('-');
}

function hideAnnotationTooltip() {
  if (!annotationTooltip) return;
  annotationTooltip.classList.remove('visible');
}

function buildAnnotationTooltip(matches) {
  if (!annotationTooltip) return;
  annotationTooltip.innerHTML = '';
  for (const match of matches) {
    const item = document.createElement('div');
    item.className = 'annotation-tooltip-item';
    const title = document.createElement('strong');
    title.textContent = match.keyword?.text || '未命名关键词';
    const meta = document.createElement('span');
    const rankText = match.keyword?.rank ? `排名: ${match.keyword.rank}` : '排名: --';
    const heatText = match.keyword?.heat ? `热度: ${match.keyword.heat}` : '热度: --';
    meta.textContent = `${rankText} | ${heatText}`;
    item.appendChild(title);
    item.appendChild(meta);
    annotationTooltip.appendChild(item);
  }
}

function positionAnnotationTooltip(event) {
  if (!annotationTooltip) return;
  const padding = 14;
  const rect = annotationTooltip.getBoundingClientRect();
  let left = event.clientX + padding;
  let top = event.clientY + padding;
  if (left + rect.width > window.innerWidth - padding) {
    left = Math.max(padding, event.clientX - rect.width - padding);
  }
  if (top + rect.height > window.innerHeight - padding) {
    top = Math.max(padding, event.clientY - rect.height - padding);
  }
  annotationTooltip.style.left = `${left}px`;
  annotationTooltip.style.top = `${top}px`;
}

function showAnnotationTooltip(event, matches) {
  if (!annotationTooltip || !matches?.length) return;
  buildAnnotationTooltip(matches);
  annotationTooltip.classList.add('visible');
  positionAnnotationTooltip(event);
}

function handleAnnotationWordEnter(event) {
  const target = event.currentTarget;
  const matches = target?._matchData;
  if (!matches || !matches.length) return;
  showAnnotationTooltip(event, matches);
}

function handleAnnotationWordMove(event) {
  if (!annotationTooltip || !annotationTooltip.classList.contains('visible')) return;
  positionAnnotationTooltip(event);
}

function handleAnnotationWordLeave() {
  hideAnnotationTooltip();
}

function renderTitleAnnotations(dropzone, keywordIds) {
  if (!dropzone) return;
  const container = dropzone.parentElement?.querySelector('.title-annotation');
  if (!container) return;
  const textEl = container.querySelector('.annotation-text');
  const rowsEl = container.querySelector('.annotation-rows');
  hideAnnotationTooltip();
  if (rowsEl) {
    rowsEl.innerHTML = '';
    rowsEl.hidden = true;
  }
  if (!textEl) return;
  textEl.innerHTML = '';

  const entries = buildWordEntriesFromKeywordIds(keywordIds);
  if (!entries.length) {
    container.hidden = true;
    return;
  }

  const isSearch = dropzone.dataset.containerType === 'search';
  const matches = findKeywordMatches(entries);
  const matchesByWord = new Map();
  for (const match of matches) {
    for (const index of match.wordIndices) {
      if (!matchesByWord.has(index)) {
        matchesByWord.set(index, []);
      }
      matchesByWord.get(index).push(match);
    }
  }

  entries.forEach((entry, index) => {
    const span = document.createElement('span');
    span.className = 'annotation-word';
    span.textContent = formatWordForDisplay(entry.text, index, { isSearch });
    const matchList = matchesByWord.get(index) || [];
    if (matchList.length) {
      span.dataset.highlightLevel = String(Math.min(matchList.length, 5));
      span.classList.add('has-highlight');
      span._matchData = matchList;
      span.addEventListener('mouseenter', handleAnnotationWordEnter);
      span.addEventListener('mousemove', handleAnnotationWordMove);
      span.addEventListener('mouseleave', handleAnnotationWordLeave);
    } else {
      span.dataset.highlightLevel = '0';
    }
    textEl.appendChild(span);
  });

  container.hidden = false;
}

function getCharacterLimit(containerType) {
  if (containerType === 'subtitle') {
    return state.settings.subtitleLimit || DEFAULT_SUBTITLE_LIMIT;
  }
  if (containerType === 'search') {
    return getSearchLimit();
  }
  return state.settings.skuTitleLimit || DEFAULT_SKU_TITLE_LIMIT;
}

function getContainerLabel(containerType) {
  if (containerType === 'subtitle') {
    return '父标题';
  }
  if (containerType === 'search') {
    return 'Search Term';
  }
  return '标题';
}

function buildTextFromKeywordIds(keywordIds) {
  return (keywordIds || [])
    .map((keywordId) => {
      const keyword = state.keywords.get(keywordId);
      if (!keyword) return '';
      return (keyword.text || '').trim();
    })
    .filter(Boolean)
    .join(' ');
}

function getBaseKeywordId(keyword) {
  if (!keyword) return '';
  return keyword.sourceKeywordId || keyword.id || '';
}

function splitSkuSegmentsForOptimization(collection) {
  const keywords = (collection || [])
    .map((id) => state.keywords.get(id))
    .filter(Boolean);

  const prefix = [];
  const suffix = [];

  let start = 0;
  if (keywords.length && getBaseKeywordId(keywords[0]) === FIXED_KEYWORDS.brand.id) {
    prefix.push(keywords[0]);
    start = 1;
  }

  let end = keywords.length;
  while (end > start) {
    const baseId = getBaseKeywordId(keywords[end - 1]);
    if (baseId.startsWith('__color_') || baseId.startsWith('__size_')) {
      suffix.unshift(keywords[end - 1]);
      end -= 1;
    } else {
      break;
    }
  }

  return {
    prefix,
    middle: keywords.slice(start, end),
    suffix,
  };
}

function measureKeywordIdsLength(keywordIds) {
  if (!Array.isArray(keywordIds) || !keywordIds.length) {
    return 0;
  }
  let length = 0;
  let hasPrevious = false;
  for (const keywordId of keywordIds) {
    const keyword = state.keywords.get(keywordId);
    if (!keyword) continue;
    const text = (keyword.text || '').trim();
    if (!text) continue;
    if (hasPrevious) {
      length += 1;
    }
    length += text.length;
    hasPrevious = true;
  }
  return length;
}

function computeTitleCandidateLength(ids, { isSubtitle, colorKeywordIds } = {}) {
  const trailingIds = !isSubtitle && Array.isArray(colorKeywordIds) ? colorKeywordIds : [];
  const finalIds = trailingIds.length ? ids.concat(trailingIds) : ids;
  return measureKeywordIdsLength(finalIds);
}

function updateDropzoneMeta(dropzone, keywordIds) {
  if (!dropzone) return;
  const containerType = dropzone.dataset.containerType || 'sku';
  const limit = getCharacterLimit(containerType);
  const spuId = dropzone.closest('[data-spu-id]')?.dataset.spuId;
  let keywords = keywordIds;
  if (!keywords && spuId) {
    const containerId = dropzone.dataset.containerId || dropzone.dataset.skuId;
    const spu = state.spus.get(spuId);
    const collection = spu ? getKeywordCollection(spu, containerType, containerId) : [];
    keywords = collection ? collection.slice() : [];
  }
  const length = measureKeywordIdsLength(keywords);
  const counter = dropzone.querySelector('.char-counter');
  if (counter) {
    counter.textContent = `${length} / ${limit}`;
    counter.classList.toggle('over', length > limit);
  }
}

function refreshAllDropzoneMetas() {
  document.querySelectorAll('.title-dropzone').forEach((dropzone) => {
    updateDropzoneMeta(dropzone);
  });
}

function clampLimitValue(value, fallback, { min = 20, max = 400 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeTypeAlias(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  return TYPE_ALIASES[lower] || TYPE_ALIASES[text] || null;
}

function parseBulkKeywordInput(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const hasDelimiter = /[|,\t]/.test(line);
      const segments = hasDelimiter
        ? line.split(/\s*[|,\t]\s*/).filter(Boolean)
        : [line];
      if (!segments.length) return null;
      const keyword = (segments.shift() || '').trim();
      if (!keyword) return null;

      let providedType = null;
      if (segments.length) {
        const last = segments[segments.length - 1];
        const normalized = normalizeTypeAlias(last);
        if (normalized) {
          providedType = normalized;
          segments.pop();
        }
      }

      const heat = (segments.shift() || '').trim();
      const rank = segments.map((part) => part.trim()).filter(Boolean).join(' ');

      return { text: keyword, heat, rank, type: providedType };
    })
    .filter(Boolean);
}

function renderPendingKeywords() {
  if (!pendingKeywordPanel || !pendingKeywordList) return;
  pendingKeywordList.innerHTML = '';
  if (pendingBulkActions) {
    pendingBulkActions.hidden = true;
  }
  if (pendingRetryAllBtn) {
    pendingRetryAllBtn.hidden = true;
    pendingRetryAllBtn.disabled = true;
  }
  if (!state.pendingKeywords.length) {
    pendingKeywordPanel.hidden = true;
    return;
  }
  pendingKeywordPanel.hidden = false;
  const statusText = {
    waiting: '待分类',
    classifying: '识别中…',
    error: '分类失败',
  };
  for (const item of state.pendingKeywords) {
    const li = document.createElement('li');
    li.className = `pending-item status-${item.status || 'waiting'}`;
    li.dataset.id = item.id;

    const main = document.createElement('div');
    main.className = 'pending-main';
    const title = document.createElement('strong');
    title.textContent = item.text;
    main.appendChild(title);
    if (item.heat || item.rank) {
      const meta = document.createElement('small');
      const segments = [];
      if (item.heat) segments.push(`热度: ${item.heat}`);
      if (item.rank) segments.push(`排名: ${item.rank}`);
      meta.textContent = segments.join(' | ');
      main.appendChild(meta);
    }
    li.appendChild(main);

    const controls = document.createElement('div');
    controls.className = 'pending-controls';
    const status = document.createElement('span');
    status.className = 'pending-status';
    status.textContent = statusText[item.status] || statusText.waiting;
    controls.appendChild(status);
    if (item.errorMessage) {
      const error = document.createElement('small');
      error.className = 'pending-error';
      error.textContent = item.errorMessage;
      controls.appendChild(error);
    }
    if (item.status === 'error') {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'secondary';
      retryBtn.textContent = '重新识别';
      retryBtn.dataset.action = 'retry';
      retryBtn.dataset.id = item.id;
      controls.appendChild(retryBtn);
    }
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text';
    removeBtn.textContent = '移除';
    removeBtn.dataset.action = 'remove';
    removeBtn.dataset.id = item.id;
    controls.appendChild(removeBtn);
    li.appendChild(controls);

    pendingKeywordList.appendChild(li);
  }

  const hasFailures = state.pendingKeywords.some((item) => item.status === 'error');
  if (pendingBulkActions) {
    pendingBulkActions.hidden = !hasFailures;
  }
  if (pendingRetryAllBtn) {
    pendingRetryAllBtn.hidden = !hasFailures;
    pendingRetryAllBtn.disabled = !hasFailures;
  }
}

function retryFailedPendingKeywords() {
  const failed = state.pendingKeywords.filter((item) => item.status === 'error');
  if (!failed.length) return;
  for (const item of failed) {
    item.status = 'waiting';
    item.errorMessage = '';
  }
  renderPendingKeywords();
  classifyPendingKeywords(failed);
}

async function classifyPendingKeywords(items) {
  if (!items?.length) return;
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    for (const item of items) {
      item.status = 'error';
      item.errorMessage = '缺少 API Key';
    }
    renderPendingKeywords();
    showToast('请先输入有效的 DeepSeek API Key', true);
    return;
  }

  for (const item of items) {
    item.status = 'classifying';
    item.errorMessage = '';
  }
  renderPendingKeywords();

  const listText = items
    .map((item, index) => {
      const extras = [];
      if (item.heat) extras.push(`热度: ${item.heat}`);
      if (item.rank) extras.push(`排名: ${item.rank}`);
      const extraText = extras.length ? `（${extras.join('，')}）` : '';
      return `${index + 1}. id=${item.id}，关键词=${item.text}${extraText}`;
    })
    .join('\n');

  const prompt =
    `请根据以下规则将关键词归类为核心词(core)、特征词(feature)、场景词(scene)或小语种词(minor)：\n` +
    `- 核心词(core)：能够直接描述产品品类的关键词或短语，通常较短，不含颜色、材质、功能等额外修饰，如 "bodysuit for women"。\n` +
    `- 核心词必须满足搜索排名为 A，若排名不是 A（包括缺失）请归类为特征词(feature)。\n` +
    `- 特征词(feature)：描述功能、材质、颜色或卖点的长尾词，可能包含核心词，如 "long sleeve bodysuits"；只要出现额外的修饰信息，即使包含核心词也判定为特征词。\n` +
    `- 场景词(scene)：描绘使用场景、对象、节日或搭配场景的词语。\n` +
    `- 小语种词(minor)：除中文和英文外的其他语言词汇。\n` +
    `请仅返回 JSON 数组，格式如 [{"id":"pending_1","type":"core"}]，type 字段只能是 core、feature、scene、minor 之一。\n\n${listText}`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'You classify Amazon listing keywords. Reply with JSON only using type fields: core, feature, scene, or minor.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text() || '请求失败');
    }

    const result = await response.json();
    const rawContent = result.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      throw new Error('未获取到有效的返回内容');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      const match = rawContent.match(/```json([\s\S]*?)```/i);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw error;
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error('返回内容格式不正确');
    }

    const successEntries = [];
    const handledIds = new Set();

    for (const entry of parsed) {
      const entryId = entry?.id;
      const entryType = normalizeTypeAlias(entry?.type);
      if (!entryId) continue;
      const pendingItem = state.pendingKeywords.find((item) => item.id === entryId);
      if (!pendingItem) continue;
      handledIds.add(entryId);
      if (!entryType) {
        pendingItem.status = 'error';
        pendingItem.errorMessage = '返回的类型无法识别';
        continue;
      }
      successEntries.push({ item: pendingItem, type: entryType });
    }

    for (const pendingItem of items) {
      if (!handledIds.has(pendingItem.id) && pendingItem.status !== 'error') {
        pendingItem.status = 'error';
        pendingItem.errorMessage = '未收到对应的分类结果';
      }
    }

    if (successEntries.length) {
      for (const { item, type } of successEntries) {
        createKeyword({
          text: item.text,
          heat: item.heat,
          rank: item.rank,
          type,
        });
      }
      const successIds = new Set(successEntries.map((entry) => entry.item.id));
      state.pendingKeywords = state.pendingKeywords.filter((item) => !successIds.has(item.id));
      showToast(`已新增 ${successEntries.length} 个关键词`);
    }
    renderPendingKeywords();
  } catch (error) {
    console.error(error);
    for (const item of items) {
      item.status = 'error';
      item.errorMessage = error.message || '请求失败';
    }
    renderPendingKeywords();
    showToast('批量分类失败，请稍后重试', true);
  }
}

function handleDragStart(event, { context }) {
  const keywordId = event.currentTarget.dataset.keywordId;
  const payload = !context || context.scope === 'library'
    ? { type: 'library', keywordId }
    : {
        type: 'title',
        keywordId,
        containerId: context.containerId,
        containerType: context.containerType,
        spuId: context.spuId,
      };
  event.dataTransfer.setData('application/json', JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('active');
  event.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove('active');
}

function handleDrop(event) {
  event.preventDefault();
  const dropzone = event.currentTarget;
  dropzone.classList.remove('active');
  const payload = event.dataTransfer.getData('application/json');
  if (!payload) return;
  const { type, keywordId, containerId, containerType, spuId } = JSON.parse(payload);
  const targetContainerType = dropzone.dataset.containerType || 'sku';
  const targetContainerId = dropzone.dataset.containerId || dropzone.dataset.skuId;
  const targetSpuId = dropzone.closest('[data-spu-id]').dataset.spuId;
  const spu = state.spus.get(targetSpuId);
  if (!spu) return;
  const targetCollection = getKeywordCollection(spu, targetContainerType, targetContainerId);
  if (!targetCollection) return;

  const dropPositionKeywordId = event.target.closest('.keyword-pill')?.dataset.keywordId;

  if (type === 'library') {
    insertKeywordIntoContainer(targetSpuId, targetContainerType, targetContainerId, keywordId, dropPositionKeywordId);
  } else if (type === 'title') {
    if (
      spuId === targetSpuId &&
      containerType === targetContainerType &&
      containerId === targetContainerId
    ) {
      reorderKeywordWithinContainer(
        targetSpuId,
        targetContainerType,
        targetContainerId,
        keywordId,
        dropPositionKeywordId,
      );
    } else {
      moveKeywordBetweenContainers(
        spuId,
        containerType,
        containerId,
        targetSpuId,
        targetContainerType,
        targetContainerId,
        keywordId,
        dropPositionKeywordId,
      );
    }
  }
}

function handleDropzonePaste(event) {
  const text = event.clipboardData?.getData('text');
  if (!text) return;
  event.preventDefault();

  const dropzone = event.currentTarget;
  const spuId = dropzone.closest('[data-spu-id]')?.dataset.spuId;
  const containerType = dropzone.dataset.containerType || 'sku';
  const containerId = dropzone.dataset.containerId || dropzone.dataset.skuId;
  if (!spuId) return;
  if (isContainerLocked(spuId, containerType, containerId)) {
    showToast('该区域已锁定，无法粘贴', true);
    return;
  }
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const limit = getCharacterLimit(containerType);
  applyFreeTextToContainer(spu, containerType, containerId, text, limit);
  renderSpu(spuId);
  showToast('已粘贴文本并拆分为可编辑词块');
}

function insertKeywordIntoContainer(spuId, containerType, containerId, keywordId, beforeKeywordId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  if (!state.keywords.has(keywordId)) return;
  const collection = getKeywordCollection(spu, containerType, containerId);
  if (!collection) return;

  if (collection.includes(keywordId)) {
    showToast('该关键词已在当前标题中', true);
    return;
  }

  const insertIndex = beforeKeywordId ? collection.indexOf(beforeKeywordId) : -1;
  if (insertIndex >= 0) {
    collection.splice(insertIndex, 0, keywordId);
  } else {
    collection.push(keywordId);
  }

  renderSpu(spuId);
}

function reorderKeywordWithinContainer(spuId, containerType, containerId, keywordId, beforeKeywordId) {
  if (keywordId === beforeKeywordId) return;
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const collection = getKeywordCollection(spu, containerType, containerId);
  if (!collection) return;
  const currentIndex = collection.indexOf(keywordId);
  if (currentIndex < 0) return;
  collection.splice(currentIndex, 1);
  if (beforeKeywordId) {
    const insertIndex = collection.indexOf(beforeKeywordId);
    if (insertIndex >= 0) {
      collection.splice(insertIndex, 0, keywordId);
    } else {
      collection.push(keywordId);
    }
  } else {
    collection.push(keywordId);
  }
  renderSpu(spuId);
}

function moveKeywordBetweenContainers(
  fromSpuId,
  fromContainerType,
  fromContainerId,
  toSpuId,
  toContainerType,
  toContainerId,
  keywordId,
  beforeKeywordId,
) {
  const fromSpu = state.spus.get(fromSpuId);
  const toSpu = state.spus.get(toSpuId);
  if (!fromSpu || !toSpu) return;
  const fromCollection = getKeywordCollection(fromSpu, fromContainerType, fromContainerId);
  const toCollection = getKeywordCollection(toSpu, toContainerType, toContainerId);
  if (!fromCollection || !toCollection) return;
  const index = fromCollection.indexOf(keywordId);
  if (index < 0) return;

  if (toCollection.includes(keywordId)) {
    showToast('该关键词已在目标标题中', true);
    return;
  }

  const snapshot = toCollection.slice();
  fromCollection.splice(index, 1);
  const insertIndex = beforeKeywordId ? snapshot.indexOf(beforeKeywordId) : -1;
  const newIndex = insertIndex >= 0 ? insertIndex : snapshot.length;
  snapshot.splice(newIndex, 0, keywordId);

  toCollection.splice(0, toCollection.length, ...snapshot);
  const keywordObj = state.keywords.get(keywordId);
  if (keywordObj?.token) {
    transferTokenOwnership(keywordObj, getContainerKey(toSpuId, toContainerType, toContainerId));
  }
  renderSpu(fromSpuId);
  if (fromSpuId !== toSpuId) {
    renderSpu(toSpuId);
  }
}

function copyKeyword(keyword) {
  const meta = [];
  if (keyword.type) meta.push(`类型: ${getKeywordTypeLabel(keyword.type)}`);
  if (keyword.heat) meta.push(`热度: ${keyword.heat}`);
  if (keyword.rank) meta.push(`排名: ${keyword.rank}`);
  const text = [keyword.text, ...meta].join(' | ');
  navigator.clipboard?.writeText(text).then(() => {
    showToast('关键词信息已复制');
  }).catch(() => {
    showToast('复制失败，请手动复制', true);
  });
}

function exportLibraryKeywords() {
  const keywords = Array.from(state.keywords.values()).filter(
    (keyword) => keyword && !keyword.virtual && !keyword.token,
  );
  if (!keywords.length) {
    showToast('关键词库为空，无法导出', true);
    return;
  }
  const ordered = keywords.slice().sort(compareKeywordsForLibrary);
  const rows = [
    ['关键词', '周搜索量', '排名', '类型'],
    ...ordered.map((keyword) => [
      keyword.text,
      keyword.heat || keyword.searchVolume || '',
      keyword.rank || '',
      getKeywordTypeLabel(keyword.type),
    ]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'keywords.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('关键词库已导出为 CSV 文件');
}

function showToast(message, isError = false) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2200);
}

function grantAccess() {
  document.body.classList.remove('access-locked');
  if (accessGate) {
    accessGate.hidden = true;
  }
  if (accessErrorEl) {
    accessErrorEl.hidden = true;
  }
  try {
    sessionStorage.setItem(ACCESS_STORAGE_KEY, '1');
  } catch (error) {
    // Ignore storage errors in environments where sessionStorage is unavailable.
  }
}

function initAccessGate() {
  if (!accessGate || !accessForm) return;
  let unlocked = false;
  try {
    unlocked = sessionStorage.getItem(ACCESS_STORAGE_KEY) === '1';
  } catch (error) {
    unlocked = false;
  }
  if (unlocked) {
    grantAccess();
    return;
  }
  document.body.classList.add('access-locked');
  accessGate.hidden = false;
  if (accessCodeInput) {
    accessCodeInput.value = '';
    setTimeout(() => accessCodeInput.focus(), 0);
  }
  if (accessErrorEl) {
    accessErrorEl.hidden = true;
  }
  accessForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = accessCodeInput?.value?.trim();
    if (value === ACCESS_CODE) {
      grantAccess();
    } else {
      if (accessErrorEl) {
        accessErrorEl.hidden = false;
      }
      if (accessCodeInput) {
        accessCodeInput.value = '';
        accessCodeInput.focus();
      }
    }
  });
}

function addSpu({ name, info }) {
  const id = `spu_${++spuCounter}`;
  const spu = {
    id,
    name,
    info,
    subtitleKeywords: [],
    subtitleLocked: false,
    fivePointPrompt: DEFAULT_FIVE_POINT_PROMPT,
    fivePointPanelOpen: false,
    skus: [],
  };
  state.spus.set(id, spu);
  renderSpuList();
}

function addSku(spuId, { name }) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const sku = {
    id: `sku_${++skuCounter}`,
    name,
    titleKeywords: [],
    searchKeywords: [],
    titleLocked: false,
    searchLocked: false,
  };
  spu.skus.push(sku);
  renderSpu(spuId);
}

function removeSku(spuId, skuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  cleanupTokensForOwner(getContainerKey(spuId, 'sku', skuId));
  spu.skus = spu.skus.filter((sku) => sku.id !== skuId);
  renderSpu(spuId);
}

function deleteSpu(spuId) {
  cleanupTokensForSpu(spuId);
  state.spus.delete(spuId);
  renderSpuList();
}

function renderSpuSummary() {
  if (!spuSummaryList) return;
  const existingItems = Array.from(spuSummaryList.querySelectorAll('.spu-summary-item'));
  for (const item of existingItems) {
    item.remove();
  }
  const hasSpu = state.spus.size > 0;
  if (spuSummaryEmpty) {
    spuSummaryEmpty.hidden = hasSpu;
  }
  if (!hasSpu) {
    return;
  }
  for (const spu of state.spus.values()) {
    const li = document.createElement('li');
    li.className = 'spu-summary-item';
    const title = document.createElement('strong');
    title.textContent = spu.name || '未命名 SPU';
    li.appendChild(title);
    const infoText = (spu.info || '').trim();
    const infoLine = document.createElement('p');
    infoLine.className = 'spu-summary-info';
    if (!infoText) {
      infoLine.textContent = '（产品信息待完善，详见左侧面板）';
    } else {
      const textSpan = document.createElement('span');
      const truncated = infoText.length > 100 ? `${infoText.slice(0, 100)}…` : infoText;
      textSpan.textContent = truncated;
      textSpan.title = infoText;
      infoLine.appendChild(textSpan);
      if (infoText.length > 100) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'text link spu-info-toggle';
        toggleBtn.textContent = '展开';
        toggleBtn.addEventListener('click', () => {
          const expanded = toggleBtn.dataset.expanded === 'true';
          if (expanded) {
            textSpan.textContent = `${infoText.slice(0, 100)}…`;
            toggleBtn.textContent = '展开';
            toggleBtn.dataset.expanded = 'false';
          } else {
            textSpan.textContent = infoText;
            toggleBtn.textContent = '收起';
            toggleBtn.dataset.expanded = 'true';
          }
        });
        infoLine.appendChild(toggleBtn);
      }
    }
    li.appendChild(infoLine);
    spuSummaryList.appendChild(li);
  }
}

function renderSpuList() {
  spuContainer.innerHTML = '';
  if (!state.spus.size) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '还没有创建任何 SPU，请先在上方添加。';
    spuContainer.appendChild(empty);
    renderFivePointSection();
    renderSpuSummary();
    return;
  }
  for (const [spuId] of state.spus) {
    renderSpu(spuId, { append: true });
  }
  renderFivePointSection();
  renderSpuSummary();
}

function renderSpu(spuId, { append = false } = {}) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  if (!Array.isArray(spu.subtitleKeywords)) {
    spu.subtitleKeywords = [];
  }
  if (typeof spu.subtitleLocked !== 'boolean') {
    spu.subtitleLocked = false;
  }
  if (!spu.fivePointPrompt) {
    spu.fivePointPrompt = DEFAULT_FIVE_POINT_PROMPT;
  }
  let card = spuContainer.querySelector(`[data-spu-id="${spuId}"]`);
  if (!append && card) {
    card.remove();
    card = null;
  }
  if (!card) {
    card = spuTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.spuId = spuId;
  }

  card.querySelector('.spu-name').textContent = spu.name;
  const subtitleDropzone = card.querySelector('.subtitle-dropzone');
  subtitleDropzone.dataset.containerType = 'subtitle';
  subtitleDropzone.dataset.containerId = 'subtitle';
  bindDropzoneEvents(subtitleDropzone);
  renderDropzoneKeywords(subtitleDropzone, spu.subtitleKeywords, (keywordId) => ({
    allowRemove: true,
    context: { spuId: spu.id, containerType: 'subtitle', containerId: 'subtitle', keywordId },
  }));
  updateDropzoneMeta(subtitleDropzone, spu.subtitleKeywords);
  const subtitleSplitBtn = subtitleDropzone.querySelector('.split-words');
  if (subtitleSplitBtn) {
    subtitleSplitBtn.addEventListener('click', () =>
      splitContainerIntoTokens(spu.id, 'subtitle', 'subtitle'),
    );
  }
  const subtitleAiBtn = subtitleDropzone.querySelector('.ai-refine');
  if (subtitleAiBtn) {
    subtitleAiBtn.addEventListener('click', () =>
      optimizeSingleTitle(spu.id, 'subtitle', 'subtitle', subtitleAiBtn),
    );
  }
  const subtitleTrimBtn = subtitleDropzone.querySelector('.trim-duplicates');
  if (subtitleTrimBtn) {
    subtitleTrimBtn.addEventListener('click', () =>
      trimDuplicateTokens(spu.id, 'subtitle', 'subtitle'),
    );
  }
  const subtitleClearBtn = subtitleDropzone.querySelector('.clear-dropzone');
  if (subtitleClearBtn) {
    subtitleClearBtn.addEventListener('click', () =>
      clearContainerKeywords(spu.id, 'subtitle', 'subtitle'),
    );
  }
  const skuList = card.querySelector('.sku-list');
  skuList.innerHTML = '';

  if (!spu.skus.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '暂无 SKU，请点击「新增 SKU」。';
    skuList.appendChild(empty);
  } else {
    for (const sku of spu.skus) {
      skuList.appendChild(renderSku(spu.id, sku));
    }
  }

  bindSpuEvents(card, spu.id);
  if (append) {
    spuContainer.appendChild(card);
  } else {
    const nextSibling = Array.from(spuContainer.children).find((child) => child.dataset?.spuId === spuId);
    if (nextSibling) {
      spuContainer.insertBefore(card, nextSibling);
    } else {
      spuContainer.appendChild(card);
    }
  }

  renderFivePointSection();
  renderSpuSummary();
}

function renderFivePointSection() {
  if (!fivePointContainer || !fivePointTemplate) return;
  fivePointContainer.innerHTML = '';
  if (!state.spus.size) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '创建 SPU 后可在此生成五点描述。';
    fivePointContainer.appendChild(empty);
    return;
  }

  for (const spu of state.spus.values()) {
    if (!spu.fivePointPrompt) {
      spu.fivePointPrompt = DEFAULT_FIVE_POINT_PROMPT;
    }
    const details = fivePointTemplate.content.firstElementChild.cloneNode(true);
    details.dataset.spuId = spu.id;
    const titleEl = details.querySelector('.five-point-title');
    if (titleEl) {
      titleEl.textContent = `${spu.name || '未命名 SPU'} · 五点描述`;
    }
    const promptTextarea = details.querySelector('.five-point-prompt');
    if (promptTextarea) {
      promptTextarea.value = (spu.fivePointPrompt || '').trim() || DEFAULT_FIVE_POINT_PROMPT;
      promptTextarea.addEventListener('input', () => {
        const current = state.spus.get(spu.id);
        if (!current) return;
        current.fivePointPrompt = promptTextarea.value;
      });
    }
    const output = details.querySelector('.five-point-output');
    const textEl = output?.querySelector('.five-point-text');
    if (output && textEl) {
      if (spu.fivePoints) {
        output.hidden = false;
        textEl.textContent = spu.fivePoints;
      } else {
        output.hidden = true;
        textEl.textContent = '';
      }
    }
    if (typeof spu.fivePointPanelOpen === 'boolean') {
      details.open = spu.fivePointPanelOpen;
    } else if (spu.fivePoints) {
      details.open = true;
    }
    details.addEventListener('toggle', () => {
      const current = state.spus.get(spu.id);
      if (!current) return;
      current.fivePointPanelOpen = details.open;
    });
    const generateBtn = details.querySelector('.generate-five');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        if (!details.open) {
          details.open = true;
        }
        generateFivePoints(spu.id);
      });
    }
    fivePointContainer.appendChild(details);
  }
}

function renderSku(spuId, sku) {
  const skuElement = skuTemplate.content.firstElementChild.cloneNode(true);
  skuElement.dataset.skuId = sku.id;
  skuElement.dataset.spuId = spuId;
  skuElement.querySelector('.sku-title').textContent = sku.name || '未命名 SKU';
  if (typeof sku.titleLocked !== 'boolean') {
    sku.titleLocked = false;
  }
  if (typeof sku.searchLocked !== 'boolean') {
    sku.searchLocked = false;
  }
  const dropzone = skuElement.querySelector('.title-dropzone');
  dropzone.dataset.skuId = sku.id;
  dropzone.dataset.containerType = 'sku';
  dropzone.dataset.containerId = sku.id;
  dropzone.dataset.spuId = spuId;
  bindDropzoneEvents(dropzone);

  renderDropzoneKeywords(dropzone, sku.titleKeywords, (keywordId) => ({
    allowRemove: true,
    context: { spuId, containerType: 'sku', containerId: sku.id, keywordId },
  }));
  const splitBtn = dropzone.querySelector('.split-words');
  if (splitBtn) {
    splitBtn.addEventListener('click', () => splitContainerIntoTokens(spuId, 'sku', sku.id));
  }
  const aiBtn = dropzone.querySelector('.ai-refine');
  if (aiBtn) {
    aiBtn.addEventListener('click', () => optimizeSingleTitle(spuId, 'sku', sku.id, aiBtn));
  }
  const trimBtn = dropzone.querySelector('.trim-duplicates');
  if (trimBtn) {
    trimBtn.addEventListener('click', () => trimDuplicateTokens(spuId, 'sku', sku.id));
  }
  const clearBtn = dropzone.querySelector('.clear-dropzone');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => clearContainerKeywords(spuId, 'sku', sku.id));
  }

  if (!Array.isArray(sku.searchKeywords)) {
    sku.searchKeywords = Array.isArray(sku.searchKeywords) ? sku.searchKeywords.slice() : [];
  }

  const shortageEl = skuElement.querySelector('.search-shortage');
  if (shortageEl) {
    shortageEl.hidden = true;
    shortageEl.textContent = '';
  }

  const searchDropzone = skuElement.querySelector('.search-dropzone');
  const searchGenerateBtn = skuElement.querySelector('.search-generate');
  const searchExportBtn = skuElement.querySelector('.search-export');
  const searchSortBtn = skuElement.querySelector('.search-sort');

  if (searchDropzone) {
    searchDropzone.dataset.skuId = sku.id;
    searchDropzone.dataset.containerType = 'search';
    searchDropzone.dataset.containerId = sku.id;
    searchDropzone.dataset.spuId = spuId;
    bindDropzoneEvents(searchDropzone);
    renderDropzoneKeywords(searchDropzone, sku.searchKeywords, (keywordId) => ({
      allowRemove: true,
      context: { spuId, containerType: 'search', containerId: sku.id, keywordId },
    }));
    const searchSplitBtn = searchDropzone.querySelector('.split-words');
    if (searchSplitBtn) {
      searchSplitBtn.addEventListener('click', () => splitContainerIntoTokens(spuId, 'search', sku.id));
    }
    const searchTrimBtn = searchDropzone.querySelector('.trim-duplicates');
    if (searchTrimBtn) {
      searchTrimBtn.addEventListener('click', () =>
        trimDuplicateTokens(spuId, 'search', sku.id),
      );
    }
    const searchClearBtn = searchDropzone.querySelector('.clear-dropzone');
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () =>
        clearContainerKeywords(spuId, 'search', sku.id),
      );
    }
  }

  if (searchSortBtn) {
    searchSortBtn.addEventListener('click', () => sortSearchTermsByHeat(spuId, sku.id));
    const locked = isContainerLocked(spuId, 'search', sku.id);
    const hasKeywords = Array.isArray(sku.searchKeywords) && sku.searchKeywords.length > 0;
    searchSortBtn.disabled = locked || !hasKeywords;
    searchSortBtn.setAttribute('aria-disabled', searchSortBtn.disabled ? 'true' : 'false');
    if (locked) {
      searchSortBtn.title = 'Search Term 已锁定，无法重新排序';
    } else if (!hasKeywords) {
      searchSortBtn.title = '暂无关键词可排序';
    } else {
      searchSortBtn.title = '按热度重新排序 Search Term';
    }
  }

  if (searchGenerateBtn) {
    searchGenerateBtn.addEventListener('click', () => generateSearchTerms(spuId, sku.id));
  }

  if (searchExportBtn) {
    searchExportBtn.addEventListener('click', () => exportSearchTerms(spuId, sku.id));
  }

  skuElement.querySelector('.sku-export').addEventListener('click', () => exportTitle(spuId, sku.id));
  skuElement.querySelector('.sku-delete').addEventListener('click', () => removeSku(spuId, sku.id));
  return skuElement;
}

function bindDropzoneEvents(dropzone) {
  if (!dropzone.hasAttribute('tabindex')) {
    dropzone.setAttribute('tabindex', '0');
  }
  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('dragleave', handleDragLeave);
  dropzone.addEventListener('drop', handleDrop);
  dropzone.addEventListener('paste', handleDropzonePaste);
}

function bindSpuEvents(card, spuId) {
  const addSkuBtn = card.querySelector('.add-sku');
  const autoGenerateBtn = card.querySelector('.auto-generate');
  const childGenerateBtn = card.querySelector('.generate-children');
  const subtitleExportBtn = card.querySelector('.subtitle-export');
  const bulkGenerateSearchBtn = card.querySelector('.bulk-generate-search');
  const deleteSpuBtn = card.querySelector('.delete-spu');
  const bulkTextarea = card.querySelector('.bulk-sku-text');
  const bulkAddBtn = card.querySelector('.bulk-add-sku');
  const bulkClearBtn = card.querySelector('.bulk-clear');

  addSkuBtn.onclick = () => {
    const name = prompt('请输入 SKU 名称');
    if (!name) return;
    addSku(spuId, { name });
  };

  if (bulkAddBtn && bulkTextarea) {
    bulkAddBtn.onclick = () => {
      const names = bulkTextarea.value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (!names.length) {
        showToast('请先输入至少一个 SKU 名称', true);
        return;
      }
      for (const name of names) {
        addSku(spuId, { name });
      }
      bulkTextarea.value = '';
      showToast('已批量添加 SKU');
    };
  }

  if (bulkClearBtn && bulkTextarea) {
    bulkClearBtn.onclick = () => {
      bulkTextarea.value = '';
    };
  }

  if (autoGenerateBtn) {
    autoGenerateBtn.dataset.parentGenerate = spuId;
    autoGenerateBtn.onclick = () => autoGenerateTitles(spuId);
  }

  if (childGenerateBtn) {
    childGenerateBtn.dataset.childGenerate = spuId;
    childGenerateBtn.onclick = () => generateChildTitles(spuId);
  }

  if (subtitleExportBtn) {
    subtitleExportBtn.onclick = () => exportSubtitle(spuId);
  }

  if (bulkGenerateSearchBtn) {
    bulkGenerateSearchBtn.onclick = () => generateAllSearchTerms(spuId);
  }

  deleteSpuBtn.onclick = () => {
    if (confirm('确定要删除该 SPU 及其所有 SKU 吗？')) {
      deleteSpu(spuId);
    }
  };
}


async function extractImportantFeatures(spu) {
  const info = (spu?.info || '').trim();
  if (!info) {
    showToast('请先填写商品信息（支持中英文）', true);
    return { features: [], englishInfo: '' };
  }

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast('请先输入有效的 DeepSeek API Key', true);
    return { features: [], englishInfo: info };
  }

  const prompt =
    '请阅读以下商品信息，若不是英文请翻译成英文；提取 3-6 个能精准描述产品特征的英文短语（2-4 个词），如 long sleeve、square neck。' +
    '\n返回 JSON，格式为 {"englishInfo":"英文描述","features":["特征短语1","特征短语2"]}，仅输出 JSON。' +
    `\n商品信息：${info}`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You extract key feature phrases for Amazon apparel listings and respond with JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || '请求失败');
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('未获取到有效的返回内容');
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const match = content.match(/```json([\s\S]*?)```/i);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw error;
      }
    }
    const englishInfo = typeof parsed?.englishInfo === 'string' ? parsed.englishInfo.trim() : info;
    const features = Array.isArray(parsed?.features)
      ? parsed.features.map((item) => item && item.toString().trim()).filter(Boolean)
      : [];
    return { features, englishInfo };
  } catch (error) {
    console.error(error);
    showToast(`提取特征词失败：${error.message}`, true);
    return { features: [], englishInfo: info };
  }
}

function pickByHeat(pool, count, usedIds = new Set()) {
  const sorted = (pool || [])
    .filter((item) => item && item.id)
    .sort((a, b) => getKeywordHeatValue(b) - getKeywordHeatValue(a));
  const result = [];
  if (!sorted.length) return result;
  let index = 0;
  while (result.length < count && index < sorted.length * 3) {
    const keyword = sorted[index % sorted.length];
    if (!usedIds.has(keyword.id)) {
      result.push(keyword);
      usedIds.add(keyword.id);
    }
    index += 1;
  }
  if (!result.length) {
    result.push(sorted[0]);
    usedIds.add(sorted[0].id);
  }
  return result;
}

function findImportantKeywords(phrases, pools, usedIds = new Set()) {
  if (!Array.isArray(phrases) || !phrases.length) return [];
  const lowered = phrases.map((item) => item.toLowerCase()).filter(Boolean);
  const candidates = [...(pools.core || []), ...(pools.feature || [])];
  const matches = candidates.filter((keyword) => {
    const text = (keyword.text || '').toLowerCase();
    return lowered.some((phrase) => phrase && text.includes(phrase));
  });
  const ranked = matches
    .filter((item) => !usedIds.has(item.id))
    .sort((a, b) => getKeywordHeatValue(b) - getKeywordHeatValue(a));
  return ranked.slice(0, 3);
}

function applyKeywordsToContainer(
  spu,
  containerType,
  containerId,
  keywords,
  limit,
  { splitIntoTokens = false } = {},
) {
  const ownerKey = getContainerKey(spu.id, containerType, containerId);
  cleanupTokensForOwner(ownerKey);
  const keywordIds = (keywords || []).map((item) => item.id).filter(Boolean);
  let finalIds = [];

  if (splitIntoTokens) {
    finalIds = assignTokensToContainer(spu.id, containerType, containerId, keywordIds);
  } else {
    for (const keywordId of keywordIds) {
      const keyword = state.keywords.get(keywordId);
      if (!keyword) continue;
      if (keyword.token) {
        transferTokenOwnership(keyword, ownerKey);
      }
      finalIds.push(keyword.id);
    }
  }

  while (finalIds.length > 1 && measureKeywordIdsLength(finalIds) > limit) {
    const removed = finalIds.pop();
    const removedKeyword = state.keywords.get(removed);
    if (removedKeyword?.token) {
      unregisterTokenKeyword(removed);
    }
  }
  const collection = getKeywordCollection(spu, containerType, containerId);
  if (collection) {
    collection.splice(0, collection.length, ...finalIds);
  }
}

function applyFreeTextToContainer(spu, containerType, containerId, text, limit) {
  const ownerKey = getContainerKey(spu.id, containerType, containerId);
  cleanupTokensForOwner(ownerKey);
  const words = splitKeywordIntoWords(text);
  const tokenIds = [];
  const baseColor = '#ffffff';
  const defaultTextColor = getReadableTextColor(baseColor);
  const wordKeywordMap = new Map();
  state.keywords.forEach((keyword) => {
    if (!keyword || !keyword.text) return;
    const tokens = getKeywordWordTokens(keyword);
    if (tokens.length === 1) {
      const norm = tokens[0];
      if (!wordKeywordMap.has(norm)) {
        wordKeywordMap.set(norm, keyword);
      }
    }
  });
  for (const word of words) {
    const norm = normalizeWordForMatch(word);
    const keyword = norm ? wordKeywordMap.get(norm) : null;
    const color = keyword?.color || baseColor;
    const textColor = keyword?.textColor || getReadableTextColor(color) || defaultTextColor;
    const tokenId = createTokenFromWord(word, {
      ownerKey,
      sourceId: keyword?.id || null,
      color,
      textColor,
    });
    if (tokenId) tokenIds.push(tokenId);
  }
  while (tokenIds.length > 1 && measureKeywordIdsLength(tokenIds) > limit) {
    const removed = tokenIds.pop();
    unregisterTokenKeyword(removed);
  }
  const collection = getKeywordCollection(spu, containerType, containerId);
  if (collection) {
    collection.splice(0, collection.length, ...tokenIds);
  }
}

async function refineChildTitleWithAI({
  baseMiddleText,
  prefixText,
  suffixText,
  limit,
  variantHint = 0,
  sceneWords = new Set(),
  topCoreText = '',
}) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    throw new Error('请先输入有效的 DeepSeek API Key。');
  }

  const prompt =
    `请基于下方父标题的中间部分，为第 ${variantHint + 1} 个 SKU 调整中间词序以提升可读性，` +
    '品牌前缀 Popilush 保持最前，颜色与尺码结尾保持不变，不要拆开原有关键词内部的词序，' +
    '仅在中间部分做轻微顺序调整，避免出现重复单词，保持亚马逊 A9 抓取友好。' +
    (topCoreText ? `\n请确保搜索量最高的核心词靠前：${topCoreText}` : '') +
    (sceneWords.size ? '\n请将场景词尽量放在末尾附近。' : '') +
    `\n中间部分：${baseMiddleText}\n颜色尺码：${suffixText || ''}`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You reorder Amazon listing titles without dropping keywords. Reply with the reordered middle part only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.35,
    }),
  });

  if (!response.ok) {
    throw new Error((await response.text()) || '请求失败');
  }
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('未获取到有效的返回内容');
  }

  const sanitized = sanitizeOptimizedText({
    text: content,
    prefixText,
    suffixText,
    topCoreText,
    sceneWords,
  });

  const combined = [prefixText || 'Popilush', sanitized, suffixText]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return transformTitleText(trimTextToLimit(combined, limit));
}

function buildTitleCombination({
  pools,
  limit,
  isSubtitle,
  colorKeywords,
  colorText,
}) {
  const brandKeyword = state.keywords.get(FIXED_KEYWORDS.brand.id) || FIXED_KEYWORDS.brand;
  const requiredCounts = {
    core: 2,
    feature: 3,
    scene: 2,
  };

  const slotPlan = [
    { type: 'core' },
    { type: 'feature' },
    { type: 'core' },
    { type: 'feature' },
    { type: 'feature' },
    { type: 'scene' },
    { type: 'scene' },
  ];

    const brandTokens = new Set(getKeywordWordTokens(brandKeyword));
    const trailingTokens = new Set();
  for (const trailing of colorKeywords || []) {
    for (const token of getKeywordWordTokens(trailing)) {
      trailingTokens.add(token);
    }
  }

  const MAX_ATTEMPTS = 24;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const selections = [];
    const usedWords = new Set([...brandTokens, ...trailingTokens]);

    let failed = false;

    for (const slot of slotPlan) {
      const pool = pools[slot.type];
      if (!Array.isArray(pool) || !pool.length) {
        failed = true;
        break;
      }

      const rankPool = (sourcePool) =>
        sourcePool
          .map((keyword) => {
            const tokens = getKeywordWordTokens(keyword);
            const newTokens = tokens.filter((token) => !usedWords.has(token));
            return {
              keyword,
              newCount: newTokens.length,
              heat: getKeywordHeatValue(keyword),
              tokens,
            };
          })
          .sort((a, b) => {
            if (b.newCount !== a.newCount) return b.newCount - a.newCount;
            if (b.heat !== a.heat) return b.heat - a.heat;
            return Math.random() - 0.5;
          });

      let ranked = rankPool(
        pool.filter((keyword) => !(colorText && keywordConflictsWithColor(keyword, colorText))),
      );

      if (!ranked.length) {
        ranked = rankPool(pool);
      }

      const choice = ranked.find((item) => item.tokens.some((token) => !usedWords.has(token))) || ranked[0];
      if (!choice) {
        failed = true;
        break;
      }

      selections.push(choice.keyword);
      for (const token of choice.tokens) {
        usedWords.add(token);
      }
    }

    if (failed || selections.length !== slotPlan.length) {
      continue;
    }

    const segments = [];
    const usedWordsForTokens = new Set();
    const allKeywords = [brandKeyword, ...selections];
    if (!isSubtitle && Array.isArray(colorKeywords)) {
      allKeywords.push(...colorKeywords);
    }

    for (let i = 0; i < allKeywords.length; i += 1) {
      const keyword = allKeywords[i];
      const tokens = splitKeywordIntoWords(keyword.text);
      const keywordColor = keyword.color || '#ffffff';
      const keywordTextColor = keyword.textColor || getReadableTextColor(keywordColor);

      for (const word of tokens) {
        const norm = normalizeWordToken(word);
        if (!norm) continue;
        if (usedWordsForTokens.has(norm)) continue;
        segments.push({
          text: word,
          color: keywordColor,
          textColor: keywordTextColor,
          sourceId: keyword.id,
        });
        usedWordsForTokens.add(norm);
      }
    }

    if (!segments.length) {
      continue;
    }

    const length = segments.reduce((total, seg, index) => {
      const len = (seg.text || '').trim().length;
      if (!len) return total;
      if (index > 0) {
        return total + len + 1;
      }
      return total + len;
    }, 0);

    if (length > limit) {
      continue;
    }

    return {
      tokens: segments,
      length,
    };
  }

  return null;
}

function buildLooseTitleCombination({ pools, limit, isSubtitle, colorKeywords }) {
  const brandKeyword = state.keywords.get(FIXED_KEYWORDS.brand.id) || FIXED_KEYWORDS.brand;
  const slotPlan = [
    { type: 'core' },
    { type: 'feature' },
    { type: 'core' },
    { type: 'feature' },
    { type: 'feature' },
    { type: 'scene' },
    { type: 'scene' },
  ];

  const pickFromPool = (list = []) => {
    if (!list.length) return null;
    const sorted = list
      .slice()
      .sort((a, b) => getKeywordHeatValue(b) - getKeywordHeatValue(a));
    return sorted[Math.floor(Math.random() * sorted.length)] || sorted[0];
  };

  const selections = [];
  for (const slot of slotPlan) {
    const pool = pools[slot.type];
    if (!pool || !pool.length) {
      return null;
    }
    const choice = pickFromPool(pool);
    if (choice) {
      selections.push(choice);
    }
  }

  const segments = [];
  const wordCounts = new Map();
  const allKeywords = [brandKeyword, ...selections];
  if (!isSubtitle && Array.isArray(colorKeywords)) {
    allKeywords.push(...colorKeywords);
  }

  const addToken = (word, keyword) => {
    const norm = normalizeWordToken(word);
    if (!norm) return;
    const next = (wordCounts.get(norm) || 0) + 1;
    if (next > WORD_REPEAT_LIMIT) return;
    wordCounts.set(norm, next);
    const color = keyword.color || '#ffffff';
    const textColor = keyword.textColor || getReadableTextColor(color);
    segments.push({
      text: word,
      color,
      textColor,
      sourceId: keyword.id,
    });
  };

  for (let i = 0; i < allKeywords.length; i += 1) {
    const keyword = allKeywords[i];
    const tokens = splitKeywordIntoWords(keyword.text);
    for (const token of tokens) {
      addToken(token, keyword);
    }
  }

  if (!segments.length) return null;

  const measureLength = (list) =>
    list.reduce((total, seg, index) => {
      const len = (seg.text || '').trim().length;
      if (!len) return total;
      if (index > 0) return total + len + 1;
      return total + len;
    }, 0);

  let currentLength = measureLength(segments);
  if (currentLength > limit) {
    for (let i = segments.length - 1; i >= 0 && currentLength > limit; i -= 1) {
      const removed = segments.pop();
      currentLength = measureLength(segments);
      if (!removed) break;
    }
  }

  if (!segments.length) return null;

  return { tokens: segments, length: currentLength };
}

async function autoGenerateTitles(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  if (!state.keywords.size) {
    showToast('请先添加关键词', true);
    return;
  }
  if (!spu.skus.length) {
    showToast('请先为该 SPU 添加至少一个 SKU', true);
    return;
  }

  const card = spuContainer.querySelector(`[data-spu-id="${spuId}"]`);
  const autoBtn = card?.querySelector('.auto-generate');
  setButtonLoading(autoBtn, true, '生成中...');

  try {
    const pools = { core: [], feature: [], scene: [] };
    for (const keyword of state.keywords.values()) {
      if (keyword.virtual) continue;
      if (pools[keyword.type]) {
        pools[keyword.type].push(keyword);
      }
    }

    const brandKeyword = state.keywords.get(FIXED_KEYWORDS.brand.id) || FIXED_KEYWORDS.brand;
    if (!pools.core.length) {
      showToast('请至少添加 1 个核心词', true);
      return;
    }
    if (!pools.feature.length) {
      showToast('请至少添加 1 个特征词', true);
      return;
    }
    if (!pools.scene.length) {
      showToast('请至少添加 1 个场景词', true);
      return;
    }

    if (isContainerLocked(spu.id, 'subtitle', 'subtitle')) {
      showToast('父标题已锁定，未生成新标题');
      return;
    }

    const { features } = await extractImportantFeatures(spu);
    const usedIds = new Set();

    const coreKeyword = pickByHeat(pools.core, 1, usedIds)[0];
    const importantKeywords = findImportantKeywords(features, pools, usedIds);
    const featureTarget = Math.min(3, Math.max(2, pools.feature.length || 2));
    const featureKeywords = pickByHeat(pools.feature, featureTarget, usedIds);
    const sceneKeywords = pickByHeat(pools.scene, 2, usedIds);

    const sequence = [brandKeyword];
    if (coreKeyword) sequence.push(coreKeyword);
    sequence.push(...importantKeywords);
    sequence.push(...featureKeywords);
    sequence.push(...sceneKeywords);

    applyKeywordsToContainer(spu, 'subtitle', 'subtitle', sequence, getCharacterLimit('subtitle'));
    renderSpu(spuId);
    showToast('已生成父标题，可在此基础上生成子 SKU 标题');
  } finally {
    setButtonLoading(autoBtn, false);
  }
}
function rotateTokens(tokens, offset) {
  if (!tokens.length) return [];
  const shift = offset % tokens.length;
  if (shift === 0) return tokens.slice();
  return tokens.slice(shift).concat(tokens.slice(0, shift));
}

async function generateChildTitles(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  if (!Array.isArray(spu.subtitleKeywords) || !spu.subtitleKeywords.length) {
    showToast('请先生成或填写父标题', true);
    return;
  }
  const baseKeywords = spu.subtitleKeywords
    .map((id) => state.keywords.get(id))
    .filter((item) => item && item.text);
  if (!baseKeywords.length) {
    showToast('父标题为空，无法生成子 SKU 标题', true);
    return;
  }

  const normalizedTokens = baseKeywords
    .map((token) => {
      const source =
        token?.token && token.sourceKeywordId
          ? state.keywords.get(token.sourceKeywordId)
          : token;
      if (!source) return null;
      const color = token.color || source.color || '#ffffff';
      const textColor = token.textColor || source.textColor || getReadableTextColor(color);
      return {
        id: token.id,
        text: token.text || source.text || '',
        token: Boolean(token.token),
        color,
        textColor,
        sourceKeywordId: source.id,
        type: source.type,
        heat: source.heat || source.searchVolume || 0,
      };
    })
    .filter((item) => item && item.text);

  let skipped = 0;
  const updates = [];
  const brandId = FIXED_KEYWORDS.brand.id;

  const childButton = document.querySelector(`[data-child-generate="${spuId}"]`) || null;
  setButtonLoading(childButton, true, '生成中...');

  spu.skus.forEach((sku, index) => {
    if (isContainerLocked(spu.id, 'sku', sku.id)) {
      skipped += 1;
      return;
    }
    updates.push(async () => {
      const ensured = await ensureColorSizeKeywordsForSku(sku);
      if (!ensured) {
        showToast(`请补充 SKU ${sku.name || ''} 的颜色或尺码信息`, true);
        return false;
      }
      const limit = getCharacterLimit('sku');
      const ownerKey = getContainerKey(spu.id, 'sku', sku.id);
      cleanupTokensForOwner(ownerKey);

      const brandTokens = normalizedTokens.filter((token) => token.sourceKeywordId === brandId);
      const nonBrandTokens = normalizedTokens.filter((token) => token.sourceKeywordId !== brandId);

      const { sceneWords, topCore } = buildTopCoreAndSceneContext(spu.subtitleKeywords);

      const headTokens = nonBrandTokens.slice(0, Math.min(3, nonBrandTokens.length));
      const tailTokens = nonBrandTokens.slice(Math.min(3, nonBrandTokens.length));
      const variantHint = index;

      const baseMiddle = headTokens
        .concat(tailTokens)
        .map((token) => token.text)
        .filter(Boolean)
        .join(' ');

      const combinedSuffix = [ensured.color?.text, ensured.size?.text].filter(Boolean).join(' ');

      let optimizedText = baseMiddle;
      try {
        optimizedText = await refineChildTitleWithAI({
          baseMiddleText: baseMiddle,
          prefixText: brandTokens.map((b) => b.text).join(' ') || 'Popilush',
          suffixText: combinedSuffix,
          limit,
          variantHint,
          sceneWords,
          topCoreText: topCore?.text || '',
        });
      } catch (error) {
        console.error(error);
        showToast(`SKU ${sku.name || ''} 标题优化失败，使用基础顺序`, true);
        optimizedText = transformTitleText(
          [brandTokens.map((b) => b.text).join(' ') || 'Popilush', baseMiddle, combinedSuffix]
            .filter(Boolean)
            .join(' '),
        );
      }

      const tokenIds = [];
      const normalizedColor = ensured.color ? normalizeWordForMatch(ensured.color.text) : '';
      const normalizedSize = ensured.size ? normalizeWordForMatch(ensured.size.text) : '';
      let colorInText = false;
      let sizeInText = false;
      const words = splitKeywordIntoWords(optimizedText);
      words.forEach((word) => {
        const norm = normalizeWordForMatch(word);
        if (norm === normalizedColor) colorInText = true;
        if (norm === normalizedSize) sizeInText = true;
        const isBrand = norm === normalizeWordForMatch(FIXED_KEYWORDS.brand.text);
        const token = nonBrandTokens.find((item) => normalizeWordForMatch(item.text) === norm);
        const pink = DEFAULT_TYPE_COLORS.core;
        const color =
          norm === normalizedColor || norm === normalizedSize || isBrand
            ? pink
            : token?.color || '#ffffff';
        const textColor = (isBrand ? getReadableTextColor(pink) : token?.textColor) || getReadableTextColor(color);
        const tokenId = createTokenFromWord(word, {
          ownerKey,
          sourceId: isBrand ? FIXED_KEYWORDS.brand.id : token?.sourceKeywordId || token?.id,
          color,
          textColor,
        });
        if (tokenId) tokenIds.push(tokenId);
      });

      [
        { meta: ensured.color, present: colorInText },
        { meta: ensured.size, present: sizeInText },
      ]
        .filter((item) => item.meta && !item.present)
        .forEach(({ meta }) => {
          const pink = DEFAULT_TYPE_COLORS.core;
          const color = pink;
          const textColor = meta.textColor || getReadableTextColor(color);
          const tokenId = createTokenFromWord(meta.text, {
            ownerKey,
            sourceId: meta.id,
            color,
            textColor,
          });
          if (tokenId) tokenIds.push(tokenId);
        });

      while (tokenIds.length > 1 && measureKeywordIdsLength(tokenIds) > limit) {
        const removedId = tokenIds.pop();
        unregisterTokenKeyword(removedId);
      }

      sku.titleKeywords = tokenIds;
      return true;
    });
  });

  const results = await Promise.all(updates.map((fn) => fn()));
  renderSpu(spuId);
  const successCount = results.filter(Boolean).length;
  if (successCount) {
    if (skipped) {
      showToast(`已生成子 SKU 标题，跳过 ${skipped} 个锁定区域`);
    } else {
      showToast('已根据父标题生成子 SKU 标题，可继续微调顺序');
    }
  } else if (skipped) {
    showToast('所有子 SKU 标题均被锁定，未生成新内容', true);
  } else {
    showToast('未能生成子 SKU 标题，请检查父标题或颜色尺码信息', true);
  }
  setButtonLoading(childButton, false);
}

async function optimizeSingleTitle(spuId, containerType, containerId, sourceButton) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  if (isContainerLocked(spuId, containerType, containerId)) {
    showToast('该标题已锁定，未执行优化');
    return;
  }

  const collection = getKeywordCollection(spu, containerType, containerId);
  const label = getContainerLabel(containerType);
  const limit = getCharacterLimit(containerType === 'subtitle' ? 'subtitle' : 'sku');
  const originalText = buildTextFromKeywordIds(collection);
  if (!originalText) {
    showToast(`请先填写${label}`);
    return;
  }

  const { topCore, sceneWords } = buildTopCoreAndSceneContext(collection);
  const topCoreText = topCore?.text || '';

  const button = sourceButton;
  const startLoading = () => setButtonLoading(button, true, '优化中...');
  const stopLoading = () => setButtonLoading(button, false);

  let targetText = originalText;
  let prefixText = '';
  let suffixText = '';
  if (containerType === 'sku') {
    const segments = splitSkuSegmentsForOptimization(collection);
    prefixText = buildTextFromKeywordIds(segments.prefix.map((item) => item.id));
    suffixText = buildTextFromKeywordIds(segments.suffix.map((item) => item.id));
    targetText = buildTextFromKeywordIds(segments.middle.map((item) => item.id));
  }

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert('请先输入有效的 DeepSeek API Key。');
    return;
  }

  try {
    startLoading();
    const baseInstruction =
      `请在不超过 ${limit} 个字符的前提下优化英文标题，遵循亚马逊 A9 抓取逻辑并提升可读性，` +
      '保持既有词汇顺序为主，仅为可读性轻微调整，不要拆开原有词组，除去重复的单词外（单复数算同一个词），不要删去原有的实词，' +
      '可以在需要时调整单复数形式，移除竞品品牌词和亚马逊违禁词。';

    let prompt = baseInstruction;
    if (containerType === 'sku') {
      prompt +=
        '\n品牌前缀保持原样（Popilush），颜色与尺码结尾保持原样，不要改动前缀和结尾，只优化中间部分。' +
        '\n请确保场景词放在靠近结尾位置。' +
        (topCoreText ? `\n请将搜索量最高的核心词放在中间部分最前面：${topCoreText}` : '') +
        '\n品牌前缀：' +
        (prefixText || 'Popilush') +
        '\n中间部分：' +
        targetText +
        '\n颜色尺码：' +
        suffixText;
    } else {
      prompt +=
        (topCoreText ? `\n请将搜索量最高的核心词放在最前面：${topCoreText}` : '') +
        (sceneWords.size ? '\n请将场景词排列在标题靠后位置。' : '') +
        '\n请优化下方父标题并输出完整英文标题：\n' +
        originalText;
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You refine Amazon listing titles. Reply with the optimized title only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || '请求失败');
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('未获取到有效的返回内容');
    }
    if (containerType === 'sku') {
      const middleWithRequired = ensureRequiredTokens(targetText, content);
      const optimizedMiddle = sanitizeOptimizedText({
        text: middleWithRequired,
        prefixText: prefixText || 'Popilush',
        suffixText,
        topCoreText,
        sceneWords,
      });
      const combined = [prefixText || 'Popilush', optimizedMiddle, suffixText]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      applyFreeTextToContainer(spu, containerType, containerId, combined, limit);
    } else {
      const optimized = sanitizeOptimizedText({
        text: ensureRequiredTokens(originalText, content),
        prefixText: 'Popilush',
        topCoreText,
        sceneWords,
      });
      const combined = ['Popilush', optimized].filter(Boolean).join(' ');
      applyFreeTextToContainer(spu, containerType, containerId, combined, limit);
    }
    renderSpu(spuId);
    showToast('AI 已优化标题');
  } catch (error) {
    console.error(error);
    showToast(`AI 优化失败：${error.message}`, true);
  } finally {
    stopLoading();
  }
}

async function generateSearchTerms(spuId, skuId, options = {}) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const sku = spu.skus.find((item) => item.id === skuId);
  if (!sku) return;
  updateSearchShortageMessage(spuId, skuId, '');
  if (sku.searchLocked) {
    if (!options.silent) {
      showToast('该 Search Term 已锁定，未生成');
    }
    return 'locked';
  }
  if (!state.keywords.size) {
    if (!options.silent) {
      showToast('请先添加关键词', true);
    }
    return false;
  }
  const titleKeywordIds = Array.isArray(sku.titleKeywords)
    ? sku.titleKeywords.filter((id) => state.keywords.has(id))
    : [];
  if (!titleKeywordIds.length) {
    if (!options.silent) {
      showToast('请先生成标题', true);
    }
    return false;
  }
  const titleText = buildTextFromKeywordIds(titleKeywordIds);
  const titleWordSet = new Set(
    splitKeywordIntoWords(titleText)
      .map((word) => normalizeWordForMatch(word))
      .filter(Boolean),
  );
  if (!Array.isArray(sku.searchKeywords)) {
    sku.searchKeywords = [];
  }

  if (!sku.colorText || !sku.sizeText) {
    const ensured = await ensureSkuColorSize(sku);
    if (!ensured) {
      if (!options.silent) {
        showToast('请先识别 SKU 的颜色与尺码信息', true);
      }
      return false;
    }
  }

  const colorText = sku.colorText || '';

  const usedKeywordIds = getSourceKeywordSet(titleKeywordIds);
  const pools = {};
  for (const { value } of KEYWORD_TYPES) {
    pools[value] = [];
  }
  for (const keyword of state.keywords.values()) {
    if (keyword.virtual) continue;
    const type = KEYWORD_TYPES.some((item) => item.value === keyword.type) ? keyword.type : 'core';
    if (usedKeywordIds.has(keyword.id)) continue;
    if (colorText && keywordConflictsWithColor(keyword, colorText)) continue;
    const keywordTokens = getKeywordWordTokens(keyword);
    const overlapsTitle = keywordTokens.some((token) => titleWordSet.has(token));
    if (overlapsTitle) continue;
    if (!pools[type]) pools[type] = [];
    pools[type].push(keyword);
  }

  const requiredByPattern = SEARCH_TYPE_PATTERN.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const lackingTypes = Object.entries(requiredByPattern)
    .filter(([type, count]) => (pools[type]?.length || 0) < count)
    .map(([type]) => getKeywordTypeLabel(type));

  const availableCount = Object.values(pools).reduce((total, list) => total + list.length, 0);
  if (!availableCount) {
    if (!options.silent) {
      showToast('标题已覆盖全部可用关键词，请添加新词后再生成 Search Term', true);
    }
    if (lackingTypes.length) {
      updateSearchShortageMessage(spuId, skuId, `关键词过少，建议增加${lackingTypes.join('、')}。`);
    }
    return false;
  }

  const limit = getSearchLimit();
  const selected = [];
  const selectedKeywords = [];
  const selectedSet = new Set();
  const wordCounts = new Map();

  const heatComparator = (a, b) => {
    const heatDiff = getKeywordHeatValue(b) - getKeywordHeatValue(a);
    if (heatDiff !== 0) return heatDiff;
    return a.text.localeCompare(b.text, 'zh-Hans-CN');
  };

  const poolQueues = {};
  for (const [type, list] of Object.entries(pools)) {
    if (!Array.isArray(list) || !list.length) continue;
    poolQueues[type] = list.slice().sort(heatComparator);
  }

  const tryAddKeyword = (keyword, { allowEdgeRepeat = false } = {}) => {
    if (!keyword || selectedSet.has(keyword.id)) return false;
    if (colorText && keywordConflictsWithColor(keyword, colorText)) return false;
    if (keywordWouldExceedWordLimit(keyword, wordCounts, WORD_REPEAT_LIMIT)) return false;
    if (!allowEdgeRepeat && selectedKeywords.length) {
      const lastKeyword = selectedKeywords[selectedKeywords.length - 1];
      if (keywordsCauseBoundaryDuplicate(lastKeyword, keyword)) {
        return false;
      }
    }
    const tentative = selected.concat(keyword.id);
    if (measureKeywordIdsLength(tentative) > limit) return false;
    selected.push(keyword.id);
    selectedKeywords.push(keyword);
    selectedSet.add(keyword.id);
    applyKeywordWordCount(keyword, wordCounts);
    return true;
  };

  const pattern = (SEARCH_TYPE_PATTERN.length ? SEARCH_TYPE_PATTERN : Object.keys(poolQueues)).filter(
    (type) => poolQueues[type]?.length,
  );
  let patternIndex = 0;
  let idleSteps = 0;
  const maxIdle = Math.max(pattern.length * 3, 12);

  const hasRemainingPool = () => Object.values(poolQueues).some((pool) => pool && pool.length);

  while (pattern.length && hasRemainingPool() && idleSteps < maxIdle) {
    const type = pattern[patternIndex % pattern.length];
    patternIndex += 1;
    const pool = poolQueues[type];
    if (!pool || !pool.length) {
      idleSteps += 1;
      continue;
    }
    let added = false;
    for (let i = 0; i < pool.length; i += 1) {
      const keyword = pool[i];
      if (tryAddKeyword(keyword)) {
        pool.splice(i, 1);
        added = true;
        idleSteps = 0;
        break;
      }
    }
    if (!added) {
      for (let i = 0; i < pool.length; i += 1) {
        const keyword = pool[i];
        if (tryAddKeyword(keyword, { allowEdgeRepeat: true })) {
          pool.splice(i, 1);
          added = true;
          idleSteps = 0;
          break;
        }
      }
    }
    if (!added) {
      idleSteps += 1;
    }
  }

  if (!selected.length) {
    if (!options.silent) {
      showToast('未能在字符限制内生成 Search Term，请调整限制或关键词', true);
    }
    if (lackingTypes.length) {
      updateSearchShortageMessage(spuId, skuId, `关键词过少，建议增加${lackingTypes.join('、')}。`);
    }
    return false;
  }

  const remainingCandidates = Object.values(poolQueues)
    .flat()
    .sort(heatComparator);
  for (const keyword of remainingCandidates) {
    if (tryAddKeyword(keyword)) {
      continue;
    }
    tryAddKeyword(keyword, { allowEdgeRepeat: true });
  }

  let finalKeywords = selectedKeywords.slice().sort(heatComparator);

  const ensureMinorAtTail = () => {
    const hasMinor = finalKeywords.some((item) => item.type === 'minor');
    if (hasMinor) return;
    const minorPool = (poolQueues.minor || []).slice().sort(heatComparator);
    const candidate = minorPool.find((kw) => !selectedSet.has(kw.id));
    if (!candidate) return;
    let candidateIds = finalKeywords.map((item) => item.id).concat(candidate.id);
    let candidateText = buildTextFromKeywordIds(candidateIds);
    while (candidateText.length > limit && finalKeywords.length) {
      finalKeywords.pop();
      candidateIds = finalKeywords.map((item) => item.id).concat(candidate.id);
      candidateText = buildTextFromKeywordIds(candidateIds);
    }
    if (candidateText.length <= limit) {
      finalKeywords.push(candidate);
    }
  };

  ensureMinorAtTail();

  let finalIds = finalKeywords.map((item) => item.id);
  let finalText = buildTextFromKeywordIds(finalIds);

  while (finalKeywords.length && finalText.length > limit) {
    finalKeywords.pop();
    finalIds = finalKeywords.map((item) => item.id);
    finalText = buildTextFromKeywordIds(finalIds);
  }

  if (!finalKeywords.length) {
    if (!options.silent) {
      showToast('未能在字符限制内生成 Search Term，请调整限制或关键词', true);
    }
    if (lackingTypes.length) {
      updateSearchShortageMessage(spuId, skuId, `关键词过少，建议增加${lackingTypes.join('、')}。`);
    }
    return false;
  }

  sku.searchKeywords = finalIds;
  if (lackingTypes.length || finalKeywords.length < SEARCH_TYPE_PATTERN.length) {
    const text = lackingTypes.length
      ? `关键词过少，建议增加${lackingTypes.join('、')}。`
      : '关键词过少，建议补充更多 Search Term 词库。';
    updateSearchShortageMessage(spuId, skuId, text);
  } else {
    updateSearchShortageMessage(spuId, skuId, '');
  }
  if (!options.skipRender) {
    renderSpu(spuId);
  }
  if (!options.silent) {
    showToast('已生成 Search Term，可继续调整或导出');
  }
  return true;
}

async function generateFivePoints(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert('请先输入有效的 DeepSeek API Key。');
    return;
  }
  if (!spu.info) {
    alert('请先为该 SPU 输入产品信息。');
    return;
  }
  const panel = fivePointContainer?.querySelector(`[data-spu-id="${spuId}"]`);
  if (panel && !panel.open) {
    panel.open = true;
  }
  spu.fivePointPanelOpen = true;
  const generateBtn = panel?.querySelector('.generate-five');
  const promptTextarea = panel?.querySelector('.five-point-prompt');
  if (promptTextarea) {
    spu.fivePointPrompt = promptTextarea.value;
  }
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';
  }
  try {
    const promptBase = (spu.fivePointPrompt || '').trim() || DEFAULT_FIVE_POINT_PROMPT;
    const userPrompt = `${promptBase}\n\nProduct information:\n${spu.info}`;
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are an Amazon listing expert. Reply with five concise Amazon bullet points in English.' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || '请求失败');
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('未获取到有效的返回内容');
    }
    spu.fivePoints = content;
    renderFivePointSection();
    showToast('五点描述生成成功');
  } catch (error) {
    console.error(error);
    alert(`生成失败：${error.message}`);
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = '生成五点';
    }
  }
}

function collectTitlePreviewItems() {
  const items = [];
  for (const spu of state.spus.values()) {
    const spuLabel = spu.name || '未命名 SPU';
    const subtitleText = buildTextFromKeywordIds(spu.subtitleKeywords);
    if (subtitleText) {
      items.push({
        id: `${spu.id}_subtitle`,
        label: `${spuLabel}（父标题）`,
        text: subtitleText,
        type: 'subtitle',
        spuId: spu.id,
      });
    }
    for (const sku of spu.skus) {
      const titleText = buildTextFromKeywordIds(sku.titleKeywords);
      if (!titleText) continue;
      const skuLabel = sku.name || sku.id;
      items.push({
        id: `${spu.id}_${sku.id}`,
        label: `${spuLabel} - ${skuLabel}`,
        text: titleText,
        type: 'sku',
        spuId: spu.id,
        skuId: sku.id,
      });
    }
  }
  return items;
}

function collectSearchPreviewItems() {
  const items = [];
  for (const spu of state.spus.values()) {
    const spuLabel = spu.name || '未命名 SPU';
    for (const sku of spu.skus) {
      const text = buildTextFromKeywordIds(sku.searchKeywords);
      if (!text) continue;
      const skuLabel = sku.name || sku.id;
      items.push({
        id: `${spu.id}_${sku.id}_search`,
        label: `${spuLabel} - ${skuLabel}（Search Term）`,
        text,
        type: 'search',
        spuId: spu.id,
        skuId: sku.id,
      });
    }
  }
  return items;
}

function formatPreviewItems(items, format = 'simple', kind = 'titles') {
  if (!Array.isArray(items) || !items.length) return '';
  const transform = kind === 'search' ? transformSearchText : transformTitleText;
  if (format === 'detailed') {
    return items
      .map((item, index) => `${index + 1}. ${item.label}: ${transform(item.text || '')}`)
      .join('\n\n');
  }
  return items.map((item) => transform(item.text || '')).join('\n');
}

function getPreviewFormat(kind) {
  const format = state.previewFormats?.[kind];
  return format === 'detailed' ? 'detailed' : 'simple';
}

function getPreviewBucket(kind) {
  return state.preview[kind];
}

function setPreviewItems(kind, items) {
  const bucket = getPreviewBucket(kind);
  if (!bucket) return;
  bucket.items = Array.isArray(items) ? items : [];
  if (bucket.enableFrequency) {
    bucket.frequencies = null;
  }
  if (bucket.reviews) {
    bucket.reviews.clear();
  }
  renderPreview();
}

function getPreviewCopyPayload(kind) {
  const bucket = getPreviewBucket(kind);
  if (!bucket) return '';
  const format = getPreviewFormat(kind);
  if (!bucket.items?.length) {
    return '';
  }
  return formatPreviewItems(bucket.items, format, kind);
}

function getAllKnownColorWords() {
  const words = new Set(BASE_COLOR_WORDS);
  for (const spu of state.spus.values()) {
    for (const sku of spu.skus) {
      const color = (sku.colorText || '').trim().toLowerCase();
      if (color) {
        words.add(color);
      }
    }
  }
  if (state.previewColorWords) {
    for (const word of state.previewColorWords) {
      if (word) {
        words.add(word);
      }
    }
  }
  const previewBuckets = [state.preview?.titles, state.preview?.search];
  for (const bucket of previewBuckets) {
    if (!bucket?.items?.length) continue;
    for (const item of bucket.items) {
      const text = (item?.text || '').toLowerCase();
      if (!text) continue;
      const pattern = /color\s+([a-z][a-z\s]+)/gi;
      let match;
      while ((match = pattern.exec(text))) {
        const candidate = match[1]?.trim();
        if (candidate) {
          words.add(candidate);
        }
      }
    }
  }
  return Array.from(words).filter(Boolean);
}

function replaceColorWordsInText(text, replacement, colorWords) {
  if (!text) return text;
  const list = Array.isArray(colorWords) ? colorWords : getAllKnownColorWords();
  if (!list.length) return text;
  const lowerReplacement = replacement.toLowerCase();
  let result = text;
  for (const color of list) {
    if (!color) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(color)}\\b`, 'gi');
    result = result.replace(pattern, lowerReplacement);
  }
  return result;
}

function applyPreviewColorSwap(newColor) {
  const normalized = (newColor || '').trim();
  if (!normalized) return false;
  const lowerNormalized = normalized.toLowerCase();
  if (state.previewColorWords instanceof Set) {
    state.previewColorWords.add(lowerNormalized);
  } else {
    state.previewColorWords = new Set([lowerNormalized]);
  }
  const colorWords = getAllKnownColorWords();
  if (!colorWords.length) return false;
  let changed = false;
  for (const kind of ['titles', 'search']) {
    const bucket = getPreviewBucket(kind);
    if (!bucket?.items?.length) continue;
    let bucketChanged = false;
    for (const item of bucket.items) {
      if (!item || typeof item.text !== 'string') continue;
      const updated = replaceColorWordsInText(item.text, normalized, colorWords);
      if (updated !== item.text) {
        item.text = updated;
        changed = true;
        bucketChanged = true;
      }
    }
    if (bucketChanged) {
      if (bucket.enableFrequency) {
        bucket.frequencies = null;
      }
      if (bucket.reviews) {
        bucket.reviews.clear();
      }
    }
  }
  if (changed) {
    renderPreview();
  }
  return changed;
}

function renderPreview() {
  renderPreviewList();
  renderFrequencyBlock('titles', titlePreviewElements);
  renderFrequencyBlock('search', searchPreviewElements);
}

function renderPreviewList() {
  const container = previewElements.container;
  const emptyEl = previewElements.empty;
  if (!container || !emptyEl) return;
  container.innerHTML = '';
  const titleBucket = getPreviewBucket('titles');
  const searchBucket = getPreviewBucket('search');
  const titleItems = titleBucket?.items || [];
  const searchItems = searchBucket?.items || [];
  const hasContent = titleItems.length > 0 || searchItems.length > 0;
  emptyEl.hidden = hasContent;
  container.hidden = !hasContent;
  if (!hasContent) {
    return;
  }

  const entryMap = new Map();

  function ensureEntry(spuId) {
    if (!spuId) return null;
    if (entryMap.has(spuId)) return entryMap.get(spuId);
    const spu = state.spus.get(spuId);
    if (!spu) return null;
    const entry = {
      spuId,
      spuName: spu.name || '未命名 SPU',
      subtitle: null,
      skus: new Map(),
    };
    entryMap.set(spuId, entry);
    return entry;
  }

  function ensureSkuEntry(entry, skuId) {
    if (!entry || !skuId) return null;
    let skuEntry = entry.skus.get(skuId);
    if (!skuEntry) {
      const spu = state.spus.get(entry.spuId);
      const sku = spu?.skus?.find((item) => item.id === skuId);
      skuEntry = {
        skuId,
        skuName: sku?.name || skuId,
        title: null,
        search: null,
      };
      entry.skus.set(skuId, skuEntry);
    }
    return skuEntry;
  }

  for (const item of titleItems) {
    const entry = ensureEntry(item.spuId);
    if (!entry) continue;
    if (item.type === 'subtitle') {
      entry.subtitle = item;
    } else if (item.type === 'sku') {
      const skuEntry = ensureSkuEntry(entry, item.skuId);
      if (skuEntry) {
        skuEntry.title = item;
      }
    }
  }

  for (const item of searchItems) {
    const entry = ensureEntry(item.spuId);
    if (!entry) continue;
    const skuEntry = ensureSkuEntry(entry, item.skuId);
    if (skuEntry) {
      skuEntry.search = item;
    }
  }

  const fragment = document.createDocumentFragment();

  for (const [spuId, spu] of state.spus.entries()) {
    const entry = entryMap.get(spuId);
    if (!entry) continue;
    const group = document.createElement('div');
    group.className = 'preview-spu-group';

    const header = document.createElement('div');
    header.className = 'preview-spu-header';
    const spuNameEl = document.createElement('h3');
    spuNameEl.className = 'preview-spu-name';
    spuNameEl.textContent = entry.spuName;
    header.appendChild(spuNameEl);
    group.appendChild(header);

    if (entry.subtitle) {
      const subtitleCard = document.createElement('div');
      subtitleCard.className = 'preview-card subtitle-card';
      subtitleCard.appendChild(createPreviewItem(entry.subtitle, '父标题', 'titles'));
      group.appendChild(subtitleCard);
    }

    const spuData = state.spus.get(spuId);
    const skuList = Array.isArray(spuData?.skus) ? spuData.skus : [];
    for (const sku of skuList) {
      const skuEntry = entry.skus.get(sku.id);
      if (!skuEntry) continue;
      const skuCard = document.createElement('div');
      skuCard.className = 'preview-card preview-sku-card';
      const skuNameEl = document.createElement('h4');
      skuNameEl.className = 'preview-sku-name';
      skuNameEl.textContent = skuEntry.skuName;
      skuCard.appendChild(skuNameEl);

      if (skuEntry.title) {
        skuCard.appendChild(createPreviewItem(skuEntry.title, 'SKU 标题', 'titles'));
      }
      if (skuEntry.search) {
        skuCard.appendChild(createPreviewItem(skuEntry.search, 'Search Term', 'search'));
      }
      group.appendChild(skuCard);
    }

    fragment.appendChild(group);
  }

  container.appendChild(fragment);
}

function getPreviewReview(kind, itemId) {
  const bucket = getPreviewBucket(kind);
  if (!bucket || !bucket.reviews) return null;
  return bucket.reviews.get(itemId) || null;
}

function createPreviewItem(item, label, bucketKey) {
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-item';
  wrapper.dataset.itemId = item.id;
  wrapper.dataset.bucket = bucketKey;
  wrapper.dataset.type = item.type || '';

  const header = document.createElement('div');
  header.className = 'preview-item-header';

  const labelEl = document.createElement('span');
  labelEl.className = 'preview-item-label';
  labelEl.textContent = label;
  header.appendChild(labelEl);

  const editBtn = document.createElement('button');
  editBtn.className = 'text preview-edit';
  editBtn.type = 'button';
  editBtn.dataset.itemId = item.id;
  editBtn.dataset.bucket = bucketKey;
  editBtn.textContent = '编辑';
  header.appendChild(editBtn);

  wrapper.appendChild(header);

  const box = document.createElement('div');
  box.className = 'preview-item-box';
  box.dataset.itemId = item.id;

  const textEl = document.createElement('div');
  textEl.className = 'preview-item-text';
  const baseText = (item.text || '').toString();
  const displayText = bucketKey === 'search' ? transformSearchText(baseText) : transformTitleText(baseText);
  textEl.textContent = displayText;
  box.appendChild(textEl);

  const review = getPreviewReview(bucketKey === 'search' ? 'search' : 'titles', item.id);
  if (review) {
    if (review.status === 'ok') {
      box.classList.add('status-ok');
      const icon = document.createElement('span');
      icon.className = 'preview-status-icon success';
      icon.setAttribute('aria-label', '审查通过');
      icon.textContent = '✓';
      box.appendChild(icon);
    } else if (review.status === 'warn') {
      box.classList.add('status-warn');
      const icon = document.createElement('span');
      icon.className = 'preview-status-icon warn';
      icon.setAttribute('aria-label', '请注意');
      icon.textContent = '?';
      box.appendChild(icon);
      if (review.message) {
        box.dataset.issue = review.message;
        box.title = review.message;
      }
    } else if (review.status === 'error') {
      box.classList.add('status-error');
      const icon = document.createElement('span');
      icon.className = 'preview-status-icon error';
      icon.setAttribute('aria-label', '存在问题');
      icon.textContent = '!';
      box.appendChild(icon);
      if (review.message) {
        box.dataset.issue = review.message;
        box.title = review.message;
      }
    }
  }

  wrapper.appendChild(box);

  if (review && review.suggestion) {
    const suggestion = document.createElement('div');
    suggestion.className = 'preview-suggestion';
    suggestion.textContent = `可读性建议：${review.suggestion}`;
    wrapper.appendChild(suggestion);
  }
  return wrapper;
}

function handlePreviewEdit(button) {
  if (!button) return;
  const itemId = button.dataset.itemId;
  const bucketKey = button.dataset.bucket === 'search' ? 'search' : 'titles';
  if (!itemId || !bucketKey) return;
  const wrapper = button.closest('.preview-item');
  if (!wrapper) return;
  const textEl = wrapper.querySelector('.preview-item-text');
  if (!textEl) return;
  const isEditing = wrapper.dataset.editing === 'true';
  if (!isEditing) {
    wrapper.dataset.editing = 'true';
    textEl.contentEditable = 'true';
    textEl.spellcheck = false;
    requestAnimationFrame(() => {
      textEl.focus();
      selectElementContents(textEl);
    });
    button.textContent = '保存';
    return;
  }

  const bucket = getPreviewBucket(bucketKey);
  if (!bucket) return;
  const items = bucket.items || [];
  const target = items.find((entry) => entry.id === itemId);
  if (!target) {
    showToast('未找到可更新的内容', true);
    return;
  }
  const rawText = textEl.textContent.trim();
  const formatted = bucketKey === 'search' ? transformSearchText(rawText) : transformTitleText(rawText);
  target.text = formatted;
  if (bucket.reviews) {
    bucket.reviews.delete(itemId);
  }
  if (bucket.enableFrequency) {
    bucket.frequencies = null;
  }
  wrapper.dataset.editing = 'false';
  textEl.contentEditable = 'false';
  button.textContent = '编辑';
  renderPreview();
  showToast('内容已更新');
}

function renderFrequencyBlock(kind, elements) {
  if (!elements?.frequencyBlock) return;
  const bucket = getPreviewBucket(kind);
  if (!bucket) return;
  const hasItems = Boolean(bucket.items?.length);
  const freqVisible = Array.isArray(bucket.frequencies) && bucket.frequencies.length > 0;
  const shouldShow = bucket.enableFrequency && (hasItems || freqVisible);
  elements.frequencyBlock.hidden = !shouldShow;
  if (!shouldShow) {
    return;
  }
  const listEl = elements.frequencyList;
  if (!listEl) return;
  listEl.innerHTML = '';
  if (bucket.analysis) {
    const analysis = document.createElement('div');
    analysis.className = 'frequency-analysis';
    analysis.textContent = bucket.analysis;
    listEl.appendChild(analysis);
  }
  if (freqVisible) {
    const fragment = document.createDocumentFragment();
    for (const entry of bucket.frequencies) {
      const row = document.createElement('div');
      row.className = 'frequency-row';
      const wordEl = document.createElement('span');
      wordEl.className = 'frequency-word';
      wordEl.textContent = entry.word;
      const countEl = document.createElement('span');
      countEl.className = 'frequency-count';
      countEl.textContent = `${entry.count} 次`;
      const ratioEl = document.createElement('span');
      ratioEl.className = 'frequency-ratio';
      ratioEl.textContent = formatFrequencyRatio(entry.ratio);
      row.append(wordEl, countEl, ratioEl);
      fragment.appendChild(row);
    }
    listEl.appendChild(fragment);
  } else {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '暂无统计结果，请点击“生成词频统计”。';
    listEl.appendChild(hint);
  }
}

function computeWordFrequencies(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const counts = new Map();
  for (const item of items) {
    const text = (item?.text || '').toString();
    const matches = text.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]*/gu);
    if (!matches) continue;
    for (const word of matches) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  const denominator = computeFrequencyDenominator();
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count, ratio: count / denominator }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

async function runFrequencyAnalysis(kind) {
  const bucket = getPreviewBucket(kind);
  if (!bucket) return;
  const items = bucket.items;
  if (!items?.length) {
    showToast('暂无可统计的内容', true);
    return;
  }
  const frequencies = computeWordFrequencies(items);
  bucket.frequencies = frequencies;
  bucket.analysis = '';
  renderPreview();
  if (!frequencies.length) {
    showToast('未检测到可统计的单词', true);
    return;
  }

  const button = kind === 'titles' ? titlePreviewElements.frequencyBtn : searchPreviewElements.frequencyBtn;
  const startLoading = () => setButtonLoading(button, true, '分析中...');
  const stopLoading = () => setButtonLoading(button, false);
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast('请先输入有效的 DeepSeek API Key', true);
    return;
  }
  const productInfo = Array.from(state.spus.values())
    .map((spu) => spu.info)
    .filter(Boolean)
    .join('\n---\n');
  const contentList = items.map((item) => item.text).join('\n');
  startLoading();
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              '你是亚马逊 SEO 分析师，请基于给定词频与产品信息输出中文建议，避免返回 JSON。简述关键词覆盖度、缺口和可调整方向。',
          },
          {
            role: 'user',
            content:
              `产品信息：\n${productInfo || '无'}\n` +
              `当前文案（${kind === 'titles' ? '标题' : 'Search Term'}）：\n${contentList}\n` +
              '词频数据（word:count%ratio）：\n' +
              frequencies
                .slice(0, 60)
                .map((f) => `${f.word}:${f.count}(${formatFrequencyRatio(f.ratio)})`)
                .join(', '),
          },
        ],
        temperature: 0.3,
      }),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || '请求失败');
    }
    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content?.trim();
    if (analysis) {
      bucket.analysis = analysis;
      renderPreview();
      showToast('词频统计已生成');
    } else {
      showToast('AI 未返回词频建议', true);
    }
  } catch (error) {
    console.error(error);
    showToast('词频分析失败，请稍后重试', true);
  } finally {
    stopLoading();
  }
}

function showTitleFrequencies() {
  runFrequencyAnalysis('titles');
}

function clearTitleFrequencies() {
  const bucket = getPreviewBucket('titles');
  if (!bucket) return;
  bucket.frequencies = null;
  bucket.analysis = '';
  renderPreview();
}

function showSearchFrequencies() {
  runFrequencyAnalysis('search');
}

function clearSearchFrequencies() {
  const bucket = getPreviewBucket('search');
  if (!bucket) return;
  bucket.frequencies = null;
  bucket.analysis = '';
  renderPreview();
}

function escapeRegExp(text) {
  return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toFiniteNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number.parseFloat(String(value).replace(/[^0-9.+-]+/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function inferIssueFromText(text) {
  if (!text) return null;
  const raw = text.toString();
  const lower = raw.toLowerCase();
  let code = 'OTHER';
  if (lower.includes('字符') || lower.includes('length') || lower.includes('超过') || lower.includes('超出')) {
    code = 'LENGTH';
  } else if (lower.includes('品牌') || lower.includes('brand') || lower.includes('trademark')) {
    code = 'BRAND';
  } else if (lower.includes('违禁') || lower.includes('banned') || lower.includes('prohibited')) {
    code = 'BANNED_WORD';
  } else if (lower.includes('重复') || lower.includes('repeat') || lower.includes('duplicate')) {
    code = 'WORD_REPEAT';
  } else if (lower.includes('小写') || lower.includes('大小写') || lower.includes('lowercase') || lower.includes('uppercase')) {
    code = 'CASE';
  }
  const termMatch = raw.match(/[“"']([^”"'\n]+)[”"']/);
  const term = termMatch ? termMatch[1] : '';
  return {
    code,
    term,
    count: null,
    limit: null,
    actual: null,
    detail: raw,
  };
}

function normalizeAiIssue(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return inferIssueFromText(raw);
  }
  const codeRaw = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
  const code = AI_ISSUE_CODE_ALIASES[codeRaw] || 'OTHER';
  const term = typeof raw.term === 'string'
    ? raw.term.trim()
    : typeof raw.word === 'string'
      ? raw.word.trim()
      : '';
  const detail = typeof raw.detail === 'string'
    ? raw.detail.trim()
    : typeof raw.description === 'string'
      ? raw.description.trim()
      : typeof raw.message === 'string'
        ? raw.message.trim()
        : '';
  const count = toFiniteNumber(raw.count ?? raw.times ?? raw.frequency);
  const limit = toFiniteNumber(raw.limit);
  const actual = toFiniteNumber(raw.actual ?? raw.length ?? raw.value);
  return {
    code,
    term,
    count,
    limit,
    actual,
    detail,
  };
}


function normalizeAiReviewId(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  const inlineId = text.match(/id\s*[:=]\s*([A-Za-z0-9_\-]+)/i);
  if (inlineId) {
    return inlineId[1];
  }
  if (/^#\d+/.test(text)) {
    const hashId = text.match(/#\d+\s+id\s*[:=]\s*([A-Za-z0-9_\-]+)/i);
    if (hashId) {
      return hashId[1];
    }
  }
  return text;
}

function normalizeAiReviewEntry(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeAiReviewEntry(parsed);
      }
    } catch (error) {
      const idFromText = normalizeAiReviewId(raw);
      if (!idFromText) return null;
      return { id: idFromText, status: 'error', issues: [] };
    }
  }
  if (typeof raw !== 'object') return null;
  const candidateId = raw.id ?? raw.ID ?? raw.itemId ?? raw.targetId ?? raw.referenceId ?? raw.reference;
  let id = normalizeAiReviewId(candidateId);
  if (!id && typeof raw.text === 'string') {
    id = normalizeAiReviewId(raw.text);
  }
  if (!id && typeof raw.detail === 'string') {
    id = normalizeAiReviewId(raw.detail);
  }
  if (!id) return null;
  let statusRaw = '';
  if (typeof raw.status === 'string') {
    statusRaw = raw.status.trim().toLowerCase();
  } else if (typeof raw.result === 'string') {
    statusRaw = raw.result.trim().toLowerCase();
  } else if (typeof raw.state === 'string') {
    statusRaw = raw.state.trim().toLowerCase();
  }
  let status;
  if (['ok', 'pass', 'passed', 'success', 'valid'].includes(statusRaw)) {
    status = 'ok';
  } else if (['error', 'fail', 'failed', 'invalid', 'ng'].includes(statusRaw)) {
    status = 'error';
  } else {
    status = null;
  }
  const rawIssues = Array.isArray(raw.issues)
    ? raw.issues
    : Array.isArray(raw.problems)
      ? raw.problems
      : Array.isArray(raw.errors)
        ? raw.errors
        : [];
  const issues = rawIssues.map(normalizeAiIssue).filter(Boolean);
  if (!status) {
    status = issues.length ? 'error' : 'ok';
  }
  let suggestion = '';
  if (typeof raw.suggestion === 'string') {
    suggestion = raw.suggestion.trim();
  } else if (typeof raw.advice === 'string') {
    suggestion = raw.advice.trim();
  } else if (typeof raw.tip === 'string') {
    suggestion = raw.tip.trim();
  }
  return { id, status, issues, suggestion };
}



function measureTextCharacters(text) {
  if (!text) return 0;
  return Array.from(text.toString()).length;
}

function extractWordsForReview(text) {
  if (!text) return [];
  const matches = text.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]*/gu);
  return matches ? matches : [];
}

function countWords(words) {
  const map = new Map();
  if (!Array.isArray(words)) {
    return map;
  }
  for (const word of words) {
    map.set(word, (map.get(word) || 0) + 1);
  }
  return map;
}

function findBrandMatchesInText(text) {
  const matches = [];
  if (!text) return matches;
  const source = text.toString();
  for (const brand of BRAND_BLACKLIST) {
    if (BRAND_WHITELIST.has(brand)) continue;
    const pattern = new RegExp(`\b${escapeRegExp(brand)}\b`, 'i');
    if (pattern.test(source)) {
      matches.push(brand);
    }
  }
  return matches;
}

function findBannedWordMatches(words) {
  const matches = [];
  if (!Array.isArray(words)) return matches;
  for (const word of words) {
    if (BANNED_AMAZON_WORDS.has(word) && !matches.includes(word)) {
      matches.push(word);
    }
  }
  return matches;
}

function findPotentialBannedWordMatches(words) {
  const matches = [];
  if (!Array.isArray(words)) return matches;
  for (const word of words) {
    if (BANNED_AMAZON_WORDS.has(word)) continue;
    if (BANNED_AMAZON_WATCHLIST.has(word) && !matches.includes(word)) {
      matches.push(word);
    }
  }
  return matches;
}

function findOriginalWordInText(text, term) {
  if (!text || !term) return term;
  const pattern = new RegExp(`\b${escapeRegExp(term)}\b`, 'i');
  const match = text.toString().match(pattern);
  return match ? match[0] : term;
}

function hasUppercaseForSearch(text) {
  if (!text) return false;
  return /[A-Z]/.test(text.toString().replace(/[0-9]/g, ''));
}

function buildOtherIssueMessage(detail) {
  if (detail && /[\u4e00-\u9fff]/.test(detail)) {
    return detail;
  }
  return '其他问题：请根据 DeepSeek 审查结果调整。';
}

function evaluateLocalIssues(context) {
  const errors = [];
  const warns = [];
  const originalText = (context.text || '').toString();
  const normalizedText = (context.normalizedText || originalText).toString();
  if (!context.words) {
    context.words = extractWordsForReview(normalizedText);
  }
  if (!context.wordCounts) {
    context.wordCounts = countWords(context.words);
  }

  const brandMatches = findBrandMatchesInText(originalText);
  for (const brand of brandMatches) {
    const display = findOriginalWordInText(originalText, brand) || brand;
    errors.push(`品牌词违规：检测到品牌词“${display}”`);
  }

  const bannedMatches = findBannedWordMatches(context.words);
  for (const word of bannedMatches) {
    const display = findOriginalWordInText(originalText, word) || word;
    errors.push(`违禁词：检测到违禁词“${display}”`);
  }

  const potentialMatches = findPotentialBannedWordMatches(context.words);
  for (const word of potentialMatches) {
    const display = findOriginalWordInText(originalText, word) || word;
    warns.push(`疑似违禁词：${display} 可能为违禁词，请注意核对`);
  }

  for (const [word, count] of context.wordCounts.entries()) {
    if (count > WORD_REPEAT_LIMIT) {
      const display = findOriginalWordInText(originalText, word) || word;
      errors.push(`单词重复：${display} 出现 ${count} 次，超过允许的 ${WORD_REPEAT_LIMIT} 次`);
    } else if (count === WORD_REPEAT_LIMIT) {
      const display = findOriginalWordInText(originalText, word) || word;
      warns.push(`单词重复两次：${display} 已出现 ${WORD_REPEAT_LIMIT} 次，请注意`);
    }
  }

  return { errors, warns };
}

function evaluateAiIssue(issue, context) {
  if (!issue || !context) return null;
  const originalText = (context.text || '').toString();
  const normalizedText = (context.normalizedText || originalText).toString();
  if (!context.words) {
    context.words = extractWordsForReview(normalizedText);
  }
  const limit = typeof context.limit === 'number' ? context.limit : 0;
  switch (issue.code) {
    case 'LENGTH': {
      const length = measureTextCharacters(originalText);
      const limitValue = typeof issue.limit === 'number' ? issue.limit : limit;
      if (length > limitValue) {
        return { severity: 'error', message: `字数超限：当前 ${length} 字符，超过上限 ${limitValue} 字符` };
      }
      return null;
    }
    case 'BRAND': {
      const matches = findBrandMatchesInText(originalText);
      if (!matches.length) return null;
      const target = (issue.term || '').toLowerCase();
      let selected = matches.find((item) => item.toLowerCase() === target);
      if (!selected) {
        selected = matches[0];
      }
      const display = findOriginalWordInText(originalText, selected) || selected;
      return { severity: 'error', message: `品牌词违规：检测到品牌词“${display}”` };
    }
    case 'BANNED_WORD': {
      const matches = findBannedWordMatches(context.words);
      const target = (issue.term || '').toLowerCase();
      if (matches.length) {
        let selected = matches.find((item) => item === target);
        if (!selected) {
          selected = matches[0];
        }
        const display = findOriginalWordInText(originalText, selected) || selected;
        return { severity: 'error', message: `违禁词：检测到违禁词“${display}”` };
      }
      if (target) {
        const display = findOriginalWordInText(originalText, target) || issue.term || target;
        return { severity: 'warn', message: `疑似违禁词：${display} 可能为违禁词，请注意核对` };
      }
      if (issue.detail) {
        return { severity: 'warn', message: issue.detail };
      }
      return null;
    }
    case 'WORD_REPEAT': {
      if (!context.wordCounts) {
        context.wordCounts = countWords(context.words);
      }
      const counts = context.wordCounts;
      if (!counts.size) return null;
      const target = (issue.term || '').toLowerCase();
      const warnWords = [];
      if (target) {
        const count = counts.get(target);
        if (count && count > WORD_REPEAT_LIMIT) {
          const display = findOriginalWordInText(originalText, target) || target;
          return {
            severity: 'error',
            message: `单词重复：${display} 出现 ${count} 次，超过允许的 ${WORD_REPEAT_LIMIT} 次`,
          };
        }
        if (count && count === WORD_REPEAT_LIMIT) {
          warnWords.push(findOriginalWordInText(originalText, target) || target);
        }
      } else {
        for (const [word, count] of counts.entries()) {
          if (count > WORD_REPEAT_LIMIT) {
            const display = findOriginalWordInText(originalText, word) || word;
            return {
              severity: 'error',
              message: `单词重复：${display} 出现 ${count} 次，超过允许的 ${WORD_REPEAT_LIMIT} 次`,
            };
          }
          if (count === WORD_REPEAT_LIMIT) {
            warnWords.push(findOriginalWordInText(originalText, word) || word);
          }
        }
      }
      if (warnWords.length) {
        return {
          severity: 'warn',
          message: `单词重复两次：${warnWords.join('、')} 已出现 ${WORD_REPEAT_LIMIT} 次，请注意`,
        };
      }
      return null;
    }
    case 'CASE': {
      if (context.type === 'search' && hasUppercaseForSearch(originalText)) {
        return { severity: 'error', message: '大小写错误：Search Term 应全部小写，请修正大写字母' };
      }
      return null;
    }
    default: {
      return { severity: 'error', message: buildOtherIssueMessage(issue.detail) };
    }
  }
}

function evaluateReviewAgainstContext(review, context) {
  if (!review) return null;
  const issues = Array.isArray(review.issues) ? review.issues : [];
  const contextState = {
    type: context.type,
    limit: context.limit,
    text: (context.text || '').toString(),
    normalizedText: (context.normalizedText || context.text || '').toString(),
    words: context.words ? context.words.slice() : null,
    wordCounts: context.wordCounts ? new Map(context.wordCounts) : null,
  };

  const errorMessages = new Set();
  const warnMessages = new Set();

  for (const issue of issues) {
    const evaluation = evaluateAiIssue(issue, contextState);
    if (evaluation) {
      if (evaluation.severity === 'error' && evaluation.message) {
        errorMessages.add(evaluation.message);
      } else if (evaluation.severity === 'warn' && evaluation.message) {
        warnMessages.add(evaluation.message);
      }
    }
  }

  const local = evaluateLocalIssues(contextState);
  for (const message of local.errors) {
    if (message) {
      errorMessages.add(message);
    }
  }
  for (const message of local.warns) {
    if (message && !errorMessages.has(message)) {
      warnMessages.add(message);
    }
  }

  const suggestion = typeof review.suggestion === 'string' ? review.suggestion.trim() : '';
  if (errorMessages.size) {
    return { status: 'error', message: Array.from(errorMessages).join('；'), suggestion };
  }
  if (warnMessages.size) {
    return { status: 'warn', message: Array.from(warnMessages).join('；'), suggestion };
  }
  return { status: 'ok', message: '', suggestion };
}

async function reviewPreviewWithAI() {
  const titleBucket = getPreviewBucket('titles');
  const searchBucket = getPreviewBucket('search');
  if (!titleBucket || !searchBucket) return;
  const titleItems = titleBucket.items || [];
  const searchItems = searchBucket.items || [];
  if (!titleItems.length && !searchItems.length) {
    showToast('暂无可审查的标题或 Search Term', true);
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert('请先输入有效的 DeepSeek API Key。');
    return;
  }

  const triggerBtn = previewElements.aiButton;
  if (!triggerBtn) return;
  triggerBtn.disabled = true;
  const originalText = triggerBtn.textContent;
  triggerBtn.textContent = '审查中...';

  try {
    const entries = [];
    const contentById = new Map();
    const bannedWords = Array.from(BANNED_AMAZON_WORDS).join('、');
    const blockedBrands = Array.from(BRAND_BLACKLIST)
      .filter((brand) => !BRAND_WHITELIST.has(brand))
      .join('、');

    for (const item of titleItems) {
      const type = item.type === 'subtitle' ? 'parent' : 'sku';
      const limit = type === 'parent' ? getCharacterLimit('subtitle') : getCharacterLimit('sku');
      const originalText = (item.text || '').toString();
      const normalizedText = transformTitleText(originalText);
      entries.push({ id: item.id, type, limit, text: normalizedText });
      contentById.set(item.id, {
        type,
        limit,
        originalText,
        normalizedText,
      });
    }

    for (const item of searchItems) {
      const limit = getCharacterLimit('search');
      const originalText = (item.text || '').toString();
      const normalizedText = transformSearchText(originalText);
      entries.push({ id: item.id, type: 'search', limit, text: normalizedText });
      contentById.set(item.id, {
        type: 'search',
        limit,
        originalText,
        normalizedText,
      });
    }

    const payloadEntries = entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      limit: entry.limit,
      text: entry.text,
    }));
    const payload = JSON.stringify(payloadEntries, null, 2);

    const schemaInstruction =
      '请严格按照以下 JSON 结构返回结果：\n[' +
      '\n  {"id":"示例","status":"ok","issues":[{"code":"LENGTH","term":"","count":null,"limit":200,"actual":210,"detail":"字数超限：实际 210 字符，超过上限 200 字符"}],"suggestion":"用中文提供可读性提升建议"}]' +
      '\n]\n请仅输出 JSON 数组，不得返回额外文字；status 只能是 ok 或 error；issues 在无问题时必须是空数组；detail 必须使用简体中文并遵循“问题类型：具体说明”的格式；code 仅允许 LENGTH、BRAND、BANNED_WORD、WORD_REPEAT、CASE、OTHER；id 必须与提供的数据一致；suggestion 为可选字段，用简体中文给出提升可读性的建议。';

    const brandRule = blockedBrands
      ? `除 Popilush 外，如出现下列品牌词（忽略大小写）视为问题：${blockedBrands}。`
      : '仅允许品牌词 Popilush（忽略大小写），无其他品牌词限制。';
    const bannedRule = bannedWords
      ? `仅当文本实际包含下列违禁词（忽略大小写）时才算问题：${bannedWords}。`
      : '当前没有额外违禁词限制，可忽略此条。';

    const rules = [
      '父标题字符数不得超过 125，SKU 标题不得超过 200，Search Term 不得超过 250（均包含空格）。',
      brandRule,
      bannedRule,
      '任一单词（忽略大小写与标点）在同一条内容中出现次数不得超过 2 次（bodysuit 与 body suit 视为不同单词），统计时需包含非相邻重复。',
      '如检测到常见女装品牌（例如 OEAK、SUCCESS、SPANX 等，忽略大小写），视为其他品牌词问题。',
      'Search Term 必须全部为小写字母，数字视为小写字符，可保留。',
      '仅根据实际文本判断，不要臆测不存在的问题。',
      '对每个问题给出明确原因，detail 字段需使用“问题类型：具体说明”的中文描述。',
    ];

    const prompt =
      `${schemaInstruction}
审核规则：
- ${rules.join('\n- ')}

待审查列表（JSON）：
${payload}`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              '你是一名亚马逊 Listing 合规审核员。请根据用户提供的规则返回 JSON 数组，勿输出 JSON 以外的文字。数组元素须包含 id、status、issues 字段，可选 suggestion 字段用简体中文给出提升可读性的建议；issues 为对象数组，对象需包含 code、term、count、limit、actual、detail 字段，code 只能取 LENGTH、BRAND、BANNED_WORD、WORD_REPEAT、CASE、OTHER，detail 必须使用简体中文并遵循“问题类型：具体说明”的格式。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      throw new Error((await response.text()) || '请求失败');
    }

    const result = await response.json();
    const rawContent = result.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      throw new Error('未获取到有效的返回内容');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      const match = rawContent.match(/```json([\s\S]*?)```/i);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw error;
      }
    }

    if (!Array.isArray(parsed)) {
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.data)) {
          parsed = parsed.data;
        } else if (Array.isArray(parsed.results)) {
          parsed = parsed.results;
        } else if (Array.isArray(parsed.items)) {
          parsed = parsed.items;
        } else {
          throw new Error('返回格式不是数组');
        }
      } else {
        throw new Error('返回格式不是数组');
      }
    }

    const reviewById = new Map();
    for (const entry of parsed) {
      const normalized = normalizeAiReviewEntry(entry);
      if (!normalized) continue;
      if (!reviewById.has(normalized.id)) {
        reviewById.set(normalized.id, { status: normalized.status, issues: normalized.issues });
      }
    }

    if (titleBucket.reviews) titleBucket.reviews.clear();
    if (searchBucket.reviews) searchBucket.reviews.clear();

    for (const item of titleItems) {
      const stored = contentById.get(item.id) || {};
      const type = item.type === 'subtitle' ? 'parent' : 'sku';
      const fallbackText = transformTitleText((item.text || '').toString());
      const context = {
        type,
        limit: typeof stored.limit === 'number'
          ? stored.limit
          : type === 'parent'
            ? getCharacterLimit('subtitle')
            : getCharacterLimit('sku'),
        text: stored.originalText ?? fallbackText,
        normalizedText: stored.normalizedText ?? fallbackText,
      };
      const review = reviewById.get(item.id);
      const evaluation = review ? evaluateReviewAgainstContext(review, context) : null;
      if (evaluation) {
        titleBucket.reviews.set(item.id, evaluation);
      } else {
        titleBucket.reviews.set(item.id, { status: 'error', message: 'AI 未返回该标题的审查结果' });
      }
    }

    for (const item of searchItems) {
      const stored = contentById.get(item.id) || {};
      const fallbackText = transformSearchText((item.text || '').toString());
      const context = {
        type: 'search',
        limit: typeof stored.limit === 'number' ? stored.limit : getCharacterLimit('search'),
        text: stored.originalText ?? fallbackText,
        normalizedText: stored.normalizedText ?? fallbackText,
      };
      const review = reviewById.get(item.id);
      const evaluation = review ? evaluateReviewAgainstContext(review, context) : null;
      if (evaluation) {
        searchBucket.reviews.set(item.id, evaluation);
      } else {
        searchBucket.reviews.set(item.id, { status: 'error', message: 'AI 未返回该 Search Term 的审查结果' });
      }
    }

    renderPreview();
    showToast('AI 审查已完成');
  } catch (error) {
    console.error(error);
    showToast(`AI 审查失败：${error.message}`, true);
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalText;
  }
}

function exportTitle(spuId, skuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const sku = spu.skus.find((item) => item.id === skuId);
  if (!sku) return;
  const raw = buildTextFromKeywordIds(sku.titleKeywords);
  if (!raw) {
    alert('该 SKU 的标题为空，请先拖入关键词。');
    return;
  }
  const title = transformTitleText(raw);
  navigator.clipboard
    ?.writeText(title)
    .then(() => {
      showToast('标题已复制到剪贴板');
    })
    .catch(() => {
      showToast(`标题：${title}`, true);
    });
}

function exportSearchTerms(spuId, skuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const sku = spu.skus.find((item) => item.id === skuId);
  if (!sku) return;
  const raw = buildTextFromKeywordIds(sku.searchKeywords);
  if (!raw) {
    alert('该 SKU 的 Search Term 为空，请先生成或输入。');
    return;
  }
  const text = transformSearchText(raw);
  navigator.clipboard
    ?.writeText(text)
    .then(() => {
      showToast('Search Term 已复制到剪贴板');
    })
    .catch(() => {
      showToast(`Search Term：${text}`, true);
    });
}

function sortSearchTermsByHeat(spuId, skuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const sku = spu.skus.find((item) => item.id === skuId);
  if (!sku) return;
  if (isContainerLocked(spuId, 'search', skuId)) {
    showToast('Search Term 已锁定，无法重新排序', true);
    return;
  }
  const collection = getKeywordCollection(spu, 'search', skuId);
  if (!Array.isArray(collection) || !collection.length) {
    showToast('该 Search Term 暂无关键词', true);
    return;
  }
  const items = collection.map((id, index) => {
    const keyword = state.keywords.get(id);
    return {
      id,
      index,
      heat: getKeywordSortableHeat(keyword),
      text: (keyword?.text || '').toLowerCase(),
    };
  });
  items.sort((a, b) => {
    const heatDiff = b.heat - a.heat;
    if (heatDiff !== 0) return heatDiff;
    const textDiff = a.text.localeCompare(b.text, 'zh-Hans-CN');
    if (textDiff !== 0) return textDiff;
    return a.index - b.index;
  });
  const reordered = items.map((item) => item.id);
  let changed = false;
  for (let i = 0; i < collection.length; i += 1) {
    if (collection[i] !== reordered[i]) {
      changed = true;
      break;
    }
  }
  if (!changed) {
    showToast('Search Term 已按热度排序');
    return;
  }
  collection.splice(0, collection.length, ...reordered);
  renderSpu(spuId);
  showToast('已按热度重新排序 Search Term');
}

function exportSubtitle(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const raw = buildTextFromKeywordIds(spu.subtitleKeywords || []);
  if (!raw) {
    alert('该 SPU 的父标题为空，请先拖入关键词或自动生成。');
    return;
  }
  const subtitle = transformTitleText(raw);
  navigator.clipboard
    ?.writeText(subtitle)
    .then(() => {
      showToast('父标题已复制到剪贴板');
    })
    .catch(() => {
      showToast(`父标题：${subtitle}`, true);
    });
}

async function generateAllSearchTerms(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  if (!spu.skus.length) {
    showToast('暂无 SKU 可生成 Search Term', true);
    return;
  }
  if (!state.keywords.size) {
    showToast('请先添加关键词', true);
    return;
  }
  let success = 0;
  let lockedCount = 0;
  const failed = [];
  for (const sku of spu.skus) {
    const result = await generateSearchTerms(spuId, sku.id, { silent: true, skipRender: true });
    if (result === true) {
      success += 1;
    } else if (result === 'locked') {
      lockedCount += 1;
    } else {
      failed.push(sku.name || sku.id);
    }
  }
  renderSpu(spuId);
  if (success || lockedCount || failed.length) {
    const parts = [];
    if (success) {
      parts.push(`已生成 ${success} 个 Search Term`);
    }
    if (lockedCount) {
      parts.push(`跳过 ${lockedCount} 个锁定项`);
    }
    if (failed.length) {
      parts.push(`未生成：${failed.join('、')}`);
    }
    showToast(parts.join('，'), failed.length > 0);
  } else {
    showToast('未能为任何 SKU 生成 Search Term，请检查关键词或标题', true);
  }
}

keywordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(keywordForm);
  const text = (formData.get('keyword') || '').trim();
  if (!text) return;
  const type = formData.get('type') || 'core';
  const heat = (formData.get('heat') || '').trim();
  const rank = (formData.get('rank') || '').trim();
  const color = formData.get('color') || state.keywordTypeColors[type] || DEFAULT_TYPE_COLORS[type] || '#4C6EF5';
  const created = createKeyword({
    text,
    heat,
    rank,
    color,
    type,
  });
  keywordForm.reset();
  const finalType = created?.type || type;
  keywordTypeSelect.value = finalType;
  updateKeywordColorInput(finalType);
  if (created && created.type !== type) {
    showToast('排名非 A 的词已自动归类为特征词');
  }
});

clearLibraryBtn.addEventListener('click', () => {
  if (!state.keywords.size) return;
  if (confirm('确定要清空所有关键词吗？该操作不可恢复。')) {
    state.keywords.clear();
    state.pendingKeywords = [];
    state.containerTokens.clear();
    ensureFixedKeywords();
    for (const spu of state.spus.values()) {
      spu.subtitleKeywords = [];
      for (const sku of spu.skus) {
        sku.titleKeywords = [];
        sku.searchKeywords = [];
      }
    }
    renderPendingKeywords();
    renderKeywordLibrary();
    renderSpuList();
  }
});

spuForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('spu-name').value.trim();
  const info = document.getElementById('spu-info').value.trim();
  if (!name) return;
  addSpu({ name, info });
  spuForm.reset();
});

if (skuTitleLimitInput) {
  const initial = clampLimitValue(
    skuTitleLimitInput.value || state.settings.skuTitleLimit,
    state.settings.skuTitleLimit,
    { min: 20, max: 400 },
  );
  state.settings.skuTitleLimit = initial;
  skuTitleLimitInput.value = String(initial);
  skuTitleLimitInput.addEventListener('input', () => {
    const next = clampLimitValue(skuTitleLimitInput.value, state.settings.skuTitleLimit, { min: 20, max: 400 });
    state.settings.skuTitleLimit = next;
    skuTitleLimitInput.value = String(next);
    refreshAllDropzoneMetas();
  });
}

if (subtitleLimitInput) {
  const initial = clampLimitValue(
    subtitleLimitInput.value || state.settings.subtitleLimit,
    state.settings.subtitleLimit,
    { min: 20, max: 250 },
  );
  state.settings.subtitleLimit = initial;
  subtitleLimitInput.value = String(initial);
  subtitleLimitInput.addEventListener('input', () => {
    const next = clampLimitValue(subtitleLimitInput.value, state.settings.subtitleLimit, { min: 20, max: 250 });
    state.settings.subtitleLimit = next;
    subtitleLimitInput.value = String(next);
    refreshAllDropzoneMetas();
  });
}

if (searchLimitInput) {
  const initial = clampLimitValue(
    searchLimitInput.value || state.settings.searchTermLimit,
    state.settings.searchTermLimit,
    { min: 50, max: 400 },
  );
  state.settings.searchTermLimit = initial;
  searchLimitInput.value = String(initial);
  searchLimitInput.addEventListener('input', () => {
    const previous = state.settings.searchTermLimit;
    const next = clampLimitValue(searchLimitInput.value, previous, { min: 50, max: 400 });
    state.settings.searchTermLimit = next;
    searchLimitInput.value = String(next);
    refreshAllDropzoneMetas();
  });
}

if (keywordTypeSelect) {
  keywordTypeSelect.addEventListener('change', () => updateKeywordColorInput());
}

if (bulkKeywordSubmit && bulkKeywordTextarea) {
  bulkKeywordSubmit.addEventListener('click', () => {
    const raw = bulkKeywordTextarea.value.trim();
    if (!raw) {
      showToast('请输入至少一个关键词', true);
      return;
    }
    const parsed = parseBulkKeywordInput(raw);
    if (!parsed.length) {
      showToast('未解析到有效的关键词，请检查格式', true);
      return;
    }
    const toClassify = [];
    let directAdded = 0;

    for (const item of parsed) {
      if (item.type) {
        createKeyword({ text: item.text, heat: item.heat, rank: item.rank, type: item.type });
        directAdded += 1;
      } else {
        toClassify.push(item);
      }
    }

    if (directAdded) {
      showToast(`已直接新增 ${directAdded} 个关键词`);
    }

    if (toClassify.length) {
      const newItems = toClassify.map((item) => ({
        id: `pending_${++pendingKeywordCounter}`,
        text: item.text,
        heat: item.heat,
        rank: item.rank,
        status: 'waiting',
        errorMessage: '',
      }));
      state.pendingKeywords.push(...newItems);
      renderPendingKeywords();
      classifyPendingKeywords(newItems);
    }

    bulkKeywordTextarea.value = '';
  });
}

if (bulkKeywordClear && bulkKeywordTextarea) {
  bulkKeywordClear.addEventListener('click', () => {
    bulkKeywordTextarea.value = '';
  });
}

if (pendingKeywordList) {
  pendingKeywordList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (!id) return;
    const item = state.pendingKeywords.find((pending) => pending.id === id);
    if (!item) return;
    if (action === 'remove') {
      state.pendingKeywords = state.pendingKeywords.filter((pending) => pending.id !== id);
      renderPendingKeywords();
    } else if (action === 'retry') {
      classifyPendingKeywords([item]);
    }
  });
}

if (pendingRetryAllBtn) {
  pendingRetryAllBtn.addEventListener('click', () => {
    retryFailedPendingKeywords();
  });
}

if (typeColorGrid) {
  const inputs = Array.from(typeColorGrid.querySelectorAll('input[data-type]'));
  for (const input of inputs) {
    const type = input.dataset.type;
    if (!type) continue;
    if (state.keywordTypeColors[type]) {
      input.value = state.keywordTypeColors[type];
    } else {
      state.keywordTypeColors[type] = input.value;
    }
  }
  renderLibraryTypeLegend();
  typeColorGrid.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const keywordType = target.dataset.type;
    if (!keywordType) return;
    state.keywordTypeColors[keywordType] = target.value;
    for (const keyword of state.keywords.values()) {
      if (keyword.type === keywordType) {
        keyword.color = target.value;
      }
    }
    renderKeywordLibrary();
    renderSpuList();
    renderLibraryTypeLegend();
    if (keywordTypeSelect?.value === keywordType) {
      updateKeywordColorInput(keywordType);
    }
  });
}

renderPreview();

if (previewElements.exportBtn) {
  previewElements.exportBtn.addEventListener('click', () => {
    if (!state.libraryCollapsed) {
      setLibraryCollapsed(true);
    }
    const titleItems = collectTitlePreviewItems();
    const searchItems = collectSearchPreviewItems();
    if (!titleItems.length && !searchItems.length) {
      setPreviewItems('titles', []);
      setPreviewItems('search', []);
      showToast('暂无可导出的文案', true);
      return;
    }
    setPreviewItems('titles', titleItems);
    setPreviewItems('search', searchItems);
    showToast('文案已导出至预览区');
  });
}

if (previewElements.colorSwapBtn) {
  previewElements.colorSwapBtn.addEventListener('click', () => {
    const titleBucket = getPreviewBucket('titles');
    const searchBucket = getPreviewBucket('search');
    const hasContent = Boolean(titleBucket?.items?.length || searchBucket?.items?.length);
    if (!hasContent) {
      showToast('请先执行文案导出', true);
      return;
    }
    const input = prompt('请输入新的颜色词（英文）');
    if (input == null) {
      return;
    }
    const normalized = input.trim();
    if (!normalized) {
      showToast('颜色词不能为空', true);
      return;
    }
    const changed = applyPreviewColorSwap(normalized);
    if (changed) {
      showToast('颜色词已批量替换');
    } else {
      showToast('未找到可替换的颜色词', true);
    }
  });
}

if (previewElements.copyTitlesBtn) {
  previewElements.copyTitlesBtn.addEventListener('click', () => {
    const payload = getPreviewCopyPayload('titles');
    if (!payload) {
      showToast('暂无可复制的标题', true);
      return;
    }
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('标题已复制');
    }).catch(() => {
      showToast('复制失败，请手动复制', true);
      alert(payload);
    });
  });
}

if (previewElements.copySearchBtn) {
  previewElements.copySearchBtn.addEventListener('click', () => {
    const payload = getPreviewCopyPayload('search');
    if (!payload) {
      showToast('暂无可复制的 Search Term', true);
      return;
    }
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('Search Term 已复制');
    }).catch(() => {
      showToast('复制失败，请手动复制', true);
      alert(payload);
    });
  });
}

if (titlePreviewElements.frequencyBtn) {
  titlePreviewElements.frequencyBtn.addEventListener('click', showTitleFrequencies);
}

if (titlePreviewElements.frequencyClear) {
  titlePreviewElements.frequencyClear.addEventListener('click', clearTitleFrequencies);
}

if (searchPreviewElements.frequencyBtn) {
  searchPreviewElements.frequencyBtn.addEventListener('click', showSearchFrequencies);
}

if (searchPreviewElements.frequencyClear) {
  searchPreviewElements.frequencyClear.addEventListener('click', clearSearchFrequencies);
}


if (previewElements.container) {
  previewElements.container.addEventListener('click', (event) => {
    const button = event.target.closest('.preview-edit');
    if (button) {
      handlePreviewEdit(button);
    }
  });
}

window.addEventListener('scroll', hideAnnotationTooltip, true);
window.addEventListener('resize', hideAnnotationTooltip);
document.addEventListener('click', hideAnnotationTooltip);

initAccessGate();
renderPreview();
updateKeywordColorInput();
renderLibraryTypeLegend();
renderPendingKeywords();
renderKeywordLibrary();
renderSpuList();

// Toast styles
const toastStyle = document.createElement('style');
toastStyle.textContent = `
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: rgba(60, 60, 67, 0.9);
  color: white;
  padding: 12px 18px;
  border-radius: 12px;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.3s ease, transform 0.3s ease;
  z-index: 1000;
  pointer-events: none;
  font-size: 0.95rem;
}
.toast.visible {
  opacity: 1;
  transform: translateY(0);
}
.toast.error {
  background: rgba(224, 49, 49, 0.85);
}`;
document.head.appendChild(toastStyle);
