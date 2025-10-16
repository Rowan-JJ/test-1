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
};

const KNOWN_SIZE_CODES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const SIZE_CODE_SET = new Set(KNOWN_SIZE_CODES);

const SEARCH_TYPE_PERCENTAGES = {
  core: 0.2,
  feature: 0.2,
  scene: 0.4,
  minor: 0.2,
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
    return { colorCode: null, featureCode: null, sizeCode: null };
  }
  const upper = value.toUpperCase();
  const parts = upper.split(/[-_]/).filter(Boolean);
  let colorCode = null;
  let featureCode = null;
  let sizeCode = null;

  if (parts.length >= 3) {
    sizeCode = parts[parts.length - 1];
    featureCode = parts[parts.length - 2];
    colorCode = parts[parts.length - 3];
  }

  if (!colorCode || !featureCode || !sizeCode) {
    const match = upper.match(/([A-Z]{2})[-_]?(\d{2})[-_]?([A-Z0-9]{1,3})$/);
    if (match) {
      colorCode = colorCode || match[1];
      featureCode = featureCode || match[2];
      sizeCode = sizeCode || match[3];
    }
  }

  return { colorCode, featureCode, sizeCode };
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

function createPreviewBucket({ enableFrequency = false } = {}) {
  return {
    items: [],
    aiItems: [],
    aiRaw: '',
    enableFrequency,
    frequencies: enableFrequency ? null : undefined,
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
  settings: {
    skuTitleLimit: DEFAULT_SKU_TITLE_LIMIT,
    subtitleLimit: DEFAULT_SUBTITLE_LIMIT,
    searchTermLimit: DEFAULT_SEARCH_TERM_LIMIT,
  },
  preview: {
    titles: createPreviewBucket({ enableFrequency: true }),
    search: createPreviewBucket({ enableFrequency: false }),
  },
  previewFormats: {
    titles: 'simple',
    search: 'simple',
  },
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

function ensureSkuColorSize(sku) {
  if (!sku) return null;
  const parsed = parseSkuComponents(sku.name);
  const mappedColor = parsed.colorCode ? COLOR_CODE_MAP[parsed.colorCode] : null;
  if (mappedColor) {
    sku.colorText = mappedColor;
  }
  if (!sku.colorText) {
    const input = prompt(`请输入 SKU ${sku.name || ''} 的颜色（英文）`);
    if (!input) {
      return null;
    }
    sku.colorText = input.trim();
  }

  const normalizedSize = parsed.sizeCode ? parsed.sizeCode.toUpperCase() : '';
  if (normalizedSize && SIZE_CODE_SET.has(normalizedSize)) {
    sku.sizeText = normalizedSize;
  }
  if (!sku.sizeText) {
    const input = prompt(
      `请输入 SKU ${sku.name || ''} 的尺码（可选：${KNOWN_SIZE_CODES.join('/')})`,
    );
    if (!input) {
      return null;
    }
    sku.sizeText = input.trim().toUpperCase();
  }

  if (!sku.colorText || !sku.sizeText) {
    return null;
  }

  return { color: sku.colorText, size: sku.sizeText };
}

function ensureColorSizeKeywordForSku(sku) {
  const resolved = ensureSkuColorSize(sku);
  if (!resolved) return null;
  const { color, size } = resolved;
  if (!color || !size) return null;
  const id = `__color_${sanitizeKeywordIdSegment(color)}__size_${sanitizeKeywordIdSegment(size)}`;
  const text = `Color ${color} Size ${size}`;
  const keywordData = {
    id,
    text,
    type: 'feature',
    color: state.keywordTypeColors.feature || DEFAULT_TYPE_COLORS.feature,
    virtual: true,
    heatValue: Number.NEGATIVE_INFINITY,
  };
  const existing = state.keywords.get(id);
  if (existing) {
    Object.assign(existing, keywordData);
    return existing;
  }
  state.keywords.set(id, keywordData);
  return keywordData;
}

let keywordCounter = 0;
let spuCounter = 0;
let skuCounter = 0;
let pendingKeywordCounter = 0;

const topNav = document.querySelector('.top-nav');

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

const titlePreviewElements = {
  empty: document.getElementById('title-preview-empty'),
  currentBlock: document.getElementById('title-preview-current'),
  text: document.getElementById('title-preview-text'),
  count: document.getElementById('title-preview-count'),
  aiBlock: document.getElementById('title-preview-ai-block'),
  aiText: document.getElementById('title-preview-ai-text'),
  aiEmpty: document.getElementById('title-preview-ai-empty'),
  aiReset: document.getElementById('title-preview-ai-reset'),
  aiExport: document.getElementById('title-preview-export-results'),
  exportBtn: document.getElementById('title-preview-export'),
  copyBtn: document.getElementById('title-preview-copy'),
  aiBtn: document.getElementById('title-preview-ai'),
  formatSelect: document.getElementById('title-preview-format'),
  frequencyBlock: document.getElementById('title-frequency-block'),
  frequencyList: document.getElementById('title-preview-frequency-list'),
  frequencyBtn: document.getElementById('title-preview-frequency'),
  frequencyClear: document.getElementById('title-preview-frequency-clear'),
  aiChars: document.getElementById('title-preview-ai-chars'),
};

const searchPreviewElements = {
  empty: document.getElementById('search-preview-empty'),
  currentBlock: document.getElementById('search-preview-current'),
  text: document.getElementById('search-preview-text'),
  count: document.getElementById('search-preview-count'),
  aiBlock: document.getElementById('search-preview-ai-block'),
  aiText: document.getElementById('search-preview-ai-text'),
  aiEmpty: document.getElementById('search-preview-ai-empty'),
  aiReset: document.getElementById('search-preview-ai-reset'),
  aiExport: document.getElementById('search-preview-export-results'),
  exportBtn: document.getElementById('search-preview-export'),
  copyBtn: document.getElementById('search-preview-copy'),
  aiBtn: document.getElementById('search-preview-ai'),
  formatSelect: document.getElementById('search-preview-format'),
  aiChars: document.getElementById('search-preview-ai-chars'),
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

function compareKeywordsForLibrary(a, b) {
  const heatDiff = getKeywordHeatValue(b) - getKeywordHeatValue(a);
  if (heatDiff !== 0) return heatDiff;
  return a.text.localeCompare(b.text, 'zh-Hans-CN');
}

function incrementUsage(map, keywordId, amount = 1) {
  if (!keywordId) return;
  map.set(keywordId, (map.get(keywordId) || 0) + amount);
}

function computeSpuKeywordUsage(spu, { excludeSearchSkuId } = {}) {
  const usage = new Map();
  const record = (ids, skuId) => {
    if (!Array.isArray(ids)) return;
    if (excludeSearchSkuId && skuId && skuId === excludeSearchSkuId) return;
    for (const id of ids) {
      incrementUsage(usage, id);
    }
  };
  record(spu.subtitleKeywords);
  for (const sku of spu.skus) {
    record(sku.titleKeywords);
    record(sku.searchKeywords, sku.id);
  }
  return usage;
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
  const current = (apiKeyInput.value || '').trim();
  apiKeyInput.value = current || DEFAULT_API_KEY;
  apiKeyInput.readOnly = true;
  apiKeyInput.dataset.locked = 'true';
  if (apiKeyEditBtn) {
    apiKeyEditBtn.textContent = '修改秘钥';
    apiKeyEditBtn.addEventListener('click', () => {
      const locked = apiKeyInput.dataset.locked === 'true';
      if (locked) {
        apiKeyInput.dataset.locked = 'false';
        apiKeyInput.readOnly = false;
        apiKeyEditBtn.textContent = '完成修改';
        apiKeyInput.focus();
        apiKeyInput.select();
      } else {
        apiKeyInput.dataset.locked = 'true';
        apiKeyInput.readOnly = true;
        apiKeyEditBtn.textContent = '修改秘钥';
        if (!(apiKeyInput.value || '').trim()) {
          apiKeyInput.value = DEFAULT_API_KEY;
        }
        showToast('API Key 已更新');
      }
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
      countEl.textContent = list.length ? `${list.length} 个词` : '';
    }
    if (!container) continue;
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'hint empty-hint';
      empty.textContent = `暂无${label}`;
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
  pill.style.background = keyword.color || state.keywordTypeColors[keyword.type] || '#4c6ef5';
  pill.querySelector('.keyword-label').textContent = keyword.text;
  const metaParts = [];
  if (keyword.heat) metaParts.push(`热度: ${keyword.heat}`);
  if (keyword.rank) metaParts.push(`排名: ${keyword.rank}`);
  const metaEl = pill.querySelector('.keyword-meta');
  if (metaEl) {
    if (metaParts.length) {
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
          renderSpu(spuId);
        }
      });
    } else {
      removeBtn.remove();
    }
  }

  const editBtn = pill.querySelector('.pill-edit');
  if (editBtn) {
    if (isLibrary && !keyword.fixed) {
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
  if (!keywords || !keywords.length) {
    if (placeholder) placeholder.hidden = false;
    updateDropzoneMeta(dropzone, keywords);
    return;
  }
  if (placeholder) placeholder.hidden = true;
  for (const keywordId of keywords) {
    const keyword = state.keywords.get(keywordId);
    if (!keyword) continue;
    let options = optionsFactory ? optionsFactory(keywordId, keyword) : {};
    if (keyword.fixed) {
      options = { ...options, allowRemove: false };
    }
    const pill = createKeywordPill(keyword, options);
    dropzone.appendChild(pill);
  }
  updateDropzoneMeta(dropzone, keywords);
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

function buildTextFromKeywordIds(keywordIds) {
  return (keywordIds || [])
    .map((keywordId) => state.keywords.get(keywordId)?.text)
    .filter(Boolean)
    .join(' ');
}

function computeTitleCandidateLength(ids, { isSubtitle, colorKeywordId } = {}) {
  const trailingIds = !isSubtitle && colorKeywordId ? [colorKeywordId] : [];
  const finalIds = trailingIds.length ? ids.concat(trailingIds) : ids;
  return buildTextFromKeywordIds(finalIds).length;
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
  const text = buildTextFromKeywordIds(keywords);
  const length = text.length;
  const counter = dropzone.querySelector('.char-counter');
  if (counter) {
    counter.textContent = `${length} / ${limit}`;
    counter.classList.toggle('over', length > limit);
  }
  dropzone.classList.toggle('over-limit', length > limit);
}

function updateSearchMeta(skuElement, sku) {
  if (!skuElement || !sku) return;
  const dropzone = skuElement.querySelector('.search-dropzone');
  if (!dropzone) return;
  updateDropzoneMeta(dropzone, sku.searchKeywords);
}

function refreshAllDropzoneMetas() {
  document.querySelectorAll('.title-dropzone').forEach((dropzone) => {
    updateDropzoneMeta(dropzone);
  });
  document.querySelectorAll('.sku-card').forEach((card) => {
    const skuId = card.dataset.skuId;
    const spuId = card.closest('[data-spu-id]')?.dataset.spuId;
    if (!skuId || !spuId) return;
    const spu = state.spus.get(spuId);
    const sku = spu?.skus.find((item) => item.id === skuId);
    if (sku) {
      updateSkuMeta(card, sku);
      updateSearchMeta(card, sku);
    }
  });
}

function validateContainerLength(spuId, containerType, containerId, keywords) {
  const limit = getCharacterLimit(containerType);
  const text = buildTextFromKeywordIds(keywords);
  if (text.length > limit) {
    const label =
      containerType === 'subtitle'
        ? '父标题'
        : containerType === 'search'
          ? '搜索词'
          : '标题';
    showToast(`${label}字符数超过限制（${text.length} / ${limit}）`, true);
    return false;
  }
  return true;
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
      const parts = hasDelimiter ? line.split(/\s*[|,\t]\s*/).filter(Boolean) : [line];
      const [keywordPart, heatPart, rankPart, ...rest] = parts;
      const keyword = (keywordPart || '').trim();
      if (!keyword) return null;
      const heat = (heatPart || '').trim();
      const rank = [rankPart, ...rest].filter(Boolean).join(' ').trim();
      return { text: keyword, heat, rank };
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
    const response = await fetch('https://api.deepseek.com/chat/completions', {
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

  if (!validateContainerLength(spuId, containerType, containerId, collection)) {
    const removalIndex = insertIndex >= 0 ? insertIndex : collection.length - 1;
    if (removalIndex >= 0) {
      collection.splice(removalIndex, 1);
    }
    return;
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

  if (!validateContainerLength(toSpuId, toContainerType, toContainerId, snapshot)) {
    fromCollection.splice(index, 0, keywordId);
    return;
  }

  toCollection.splice(0, toCollection.length, ...snapshot);
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
  };
  spu.skus.push(sku);
  renderSpu(spuId);
}

function removeSku(spuId, skuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  spu.skus = spu.skus.filter((sku) => sku.id !== skuId);
  renderSpu(spuId);
}

function deleteSpu(spuId) {
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
    const info = document.createElement('p');
    const infoText = (spu.info || '').trim();
    const display = infoText || '（产品信息待完善，详见左侧面板）';
    info.textContent = display;
    if (infoText) {
      info.title = infoText;
    }
    li.appendChild(info);
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
  skuElement.querySelector('.sku-title').textContent = sku.name || '未命名 SKU';
  const dropzone = skuElement.querySelector('.title-dropzone');
  dropzone.dataset.skuId = sku.id;
  dropzone.dataset.containerType = 'sku';
  dropzone.dataset.containerId = sku.id;
  bindDropzoneEvents(dropzone);

  renderDropzoneKeywords(dropzone, sku.titleKeywords, (keywordId) => ({
    allowRemove: true,
    context: { spuId, containerType: 'sku', containerId: sku.id, keywordId },
  }));
  updateSkuMeta(skuElement, sku);

  if (!Array.isArray(sku.searchKeywords)) {
    sku.searchKeywords = Array.isArray(sku.searchKeywords) ? sku.searchKeywords.slice() : [];
  }

  const searchDropzone = skuElement.querySelector('.search-dropzone');
  const searchGenerateBtn = skuElement.querySelector('.search-generate');
  const searchExportBtn = skuElement.querySelector('.search-export');

  if (searchDropzone) {
    searchDropzone.dataset.skuId = sku.id;
    searchDropzone.dataset.containerType = 'search';
    searchDropzone.dataset.containerId = sku.id;
    bindDropzoneEvents(searchDropzone);
    renderDropzoneKeywords(searchDropzone, sku.searchKeywords, (keywordId) => ({
      allowRemove: true,
      context: { spuId, containerType: 'search', containerId: sku.id, keywordId },
    }));
  }

  if (searchGenerateBtn) {
    searchGenerateBtn.addEventListener('click', () => generateSearchTerms(spuId, sku.id));
  }

  if (searchExportBtn) {
    searchExportBtn.addEventListener('click', () => exportSearchTerms(spuId, sku.id));
  }

  updateSearchMeta(skuElement, sku);

  skuElement.querySelector('.sku-export').addEventListener('click', () => exportTitle(spuId, sku.id));
  skuElement.querySelector('.sku-delete').addEventListener('click', () => removeSku(spuId, sku.id));
  return skuElement;
}

function updateSkuMeta(skuElement, sku) {
  const metaEl = skuElement.querySelector('.sku-meta');
  if (!metaEl) return;
  const limit = state.settings.skuTitleLimit || DEFAULT_SKU_TITLE_LIMIT;
  const length = buildTextFromKeywordIds(sku.titleKeywords).length;
  metaEl.textContent = `字符：${length} / ${limit}`;
  metaEl.classList.toggle('over', length > limit);
}

function bindDropzoneEvents(dropzone) {
  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('dragleave', handleDragLeave);
  dropzone.addEventListener('drop', handleDrop);
}

function bindSpuEvents(card, spuId) {
  const addSkuBtn = card.querySelector('.add-sku');
  const autoGenerateBtn = card.querySelector('.auto-generate');
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
    autoGenerateBtn.onclick = () => autoGenerateTitles(spuId);
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

function expandTitleCombination({
  ids,
  words,
  remainingFeatures,
  remainingScenes,
  limit,
  isSubtitle,
  colorKeywordId,
}) {
  const featurePool = (remainingFeatures || []).slice();
  const scenePool = (remainingScenes || []).slice();
  const usedIds = new Set(ids);
  let currentIds = ids.slice();
  let currentWords = words.slice();
  const heatOf = (keyword) => {
    const value = getKeywordHeatValue(keyword);
    return Number.isFinite(value) ? value : -1000;
  };
  let currentHeat = currentWords.reduce((total, keyword) => total + heatOf(keyword), 0);
  let currentLength = computeTitleCandidateLength(currentIds, { isSubtitle, colorKeywordId });

  const evaluateList = (list, type) => {
    let best = null;
    for (let index = 0; index < list.length; index += 1) {
      const keyword = list[index];
      if (!keyword || usedIds.has(keyword.id)) continue;
      const nextIds = currentIds.concat(keyword.id);
      const nextLength = computeTitleCandidateLength(nextIds, { isSubtitle, colorKeywordId });
      if (nextLength > limit) continue;
      const nextHeat = currentHeat + heatOf(keyword);
      if (
        !best ||
        nextLength > best.length ||
        (nextLength === best.length && nextHeat > best.heat)
      ) {
        best = { type, index, keyword, ids: nextIds, length: nextLength, heat: nextHeat };
      }
    }
    return best;
  };

  while (true) {
    const featureCandidate = evaluateList(featurePool, 'feature');
    const sceneCandidate = evaluateList(scenePool, 'scene');
    let bestCandidate = null;
    if (featureCandidate && sceneCandidate) {
      if (
        featureCandidate.length > sceneCandidate.length ||
        (featureCandidate.length === sceneCandidate.length &&
          featureCandidate.heat >= sceneCandidate.heat)
      ) {
        bestCandidate = featureCandidate;
      } else {
        bestCandidate = sceneCandidate;
      }
    } else {
      bestCandidate = featureCandidate || sceneCandidate;
    }

    if (!bestCandidate) break;

    currentIds = bestCandidate.ids;
    currentLength = bestCandidate.length;
    currentHeat = bestCandidate.heat;
    usedIds.add(bestCandidate.keyword.id);
    currentWords.push(bestCandidate.keyword);

    if (bestCandidate.type === 'feature') {
      featurePool.splice(bestCandidate.index, 1);
    } else {
      scenePool.splice(bestCandidate.index, 1);
    }
  }

  return {
    ids: currentIds.slice(),
    words: currentWords.slice(),
    length: currentLength,
    heat: currentHeat,
  };
}

function selectKeywordsForTarget({ pools, usage, limit, isSubtitle, colorKeywordId }) {
  const MAX_CORE_CANDIDATES = 6;
  const MAX_FEATURE_CANDIDATES = 10;
  const MAX_SCENE_CANDIDATES = 8;

  const comparator = (a, b) => {
    const usageDiff = (usage.get(a.id) || 0) - (usage.get(b.id) || 0);
    if (usageDiff !== 0) return usageDiff;
    const heatDiff = getKeywordHeatValue(b) - getKeywordHeatValue(a);
    if (heatDiff !== 0) return heatDiff;
    return a.text.localeCompare(b.text, 'zh-Hans-CN');
  };

  const coreList = (pools.core || []).slice().sort(comparator).slice(0, MAX_CORE_CANDIDATES);
  const featureList = (pools.feature || []).slice().sort(comparator).slice(0, MAX_FEATURE_CANDIDATES);
  const sceneList = (pools.scene || []).slice().sort(comparator).slice(0, MAX_SCENE_CANDIDATES);

  if (coreList.length < 2 || featureList.length < 2 || sceneList.length < 1) {
    return null;
  }

  const brandId = FIXED_KEYWORDS.brand.id;
  let best = null;

  for (let i = 0; i < coreList.length; i += 1) {
    const coreA = coreList[i];
    for (let j = 0; j < coreList.length; j += 1) {
      if (j === i) continue;
      const coreB = coreList[j];
      if (keywordsShareCoreRoot(coreA, coreB)) continue;
      for (let f1 = 0; f1 < featureList.length; f1 += 1) {
        const feature1 = featureList[f1];
        const featurePoolAfterF1 = featureList.filter((_, index) => index !== f1);
        if (!featurePoolAfterF1.length) continue;
        for (let f2 = 0; f2 < featurePoolAfterF1.length; f2 += 1) {
          const feature2 = featurePoolAfterF1[f2];
          const baseIds = [brandId, coreA.id, feature1.id, coreB.id, feature2.id];
          const baseWords = [coreA, feature1, coreB, feature2];
          const remainingFeatures = featurePoolAfterF1.filter((_, index) => index !== f2);
          for (let s = 0; s < sceneList.length; s += 1) {
            const scene1 = sceneList[s];
            const ids = baseIds.concat(scene1.id);
            const words = baseWords.concat(scene1);
            const baseLength = computeTitleCandidateLength(ids, { isSubtitle, colorKeywordId });
            if (baseLength > limit) continue;
            const remainingScenes = sceneList.filter((_, index) => index !== s);
            const expanded = expandTitleCombination({
              ids,
              words,
              remainingFeatures,
              remainingScenes,
              limit,
              isSubtitle,
              colorKeywordId,
            });
            if (!expanded) continue;
            if (
              !best ||
              expanded.length > best.length ||
              (expanded.length === best.length && expanded.heat > best.heat)
            ) {
              best = expanded;
            }
          }
        }
      }
    }
  }

  if (!best) return null;
  const finalLength = computeTitleCandidateLength(best.ids, { isSubtitle, colorKeywordId });
  const finalIds = !isSubtitle && colorKeywordId ? best.ids.concat(colorKeywordId) : best.ids.slice();
  return { ids: finalIds, words: best.words.slice(), length: finalLength, heat: best.heat };
}

function autoGenerateTitles(spuId) {
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

  const pools = { core: [], feature: [], scene: [] };
  for (const keyword of state.keywords.values()) {
    if (keyword.virtual) continue;
    if (pools[keyword.type]) {
      pools[keyword.type].push(keyword);
    }
  }

  if ((pools.core || []).length < 2) {
    showToast('请至少添加 2 个核心词', true);
    return;
  }
  if ((pools.feature || []).length < 2) {
    showToast('请至少添加 2 个特征词', true);
    return;
  }
  if ((pools.scene || []).length < 1) {
    showToast('请至少添加 1 个场景词', true);
    return;
  }

  const usage = computeSpuKeywordUsage(spu);
  const targets = [
    { type: 'subtitle', apply: (keywords) => { spu.subtitleKeywords = keywords; } },
    ...spu.skus.map((sku) => ({
      type: 'sku',
      sku,
      apply: (keywords) => {
        sku.titleKeywords = keywords;
      },
    })),
  ];

  const assignments = [];

  for (const target of targets) {
    const isSubtitle = target.type === 'subtitle';
    const limit = getCharacterLimit(isSubtitle ? 'subtitle' : 'sku');
    let colorKeywordId = null;
    if (!isSubtitle) {
      const colorKeyword = ensureColorSizeKeywordForSku(target.sku);
      if (!colorKeyword) {
        showToast(`请补充 SKU ${target.sku?.name || ''} 的颜色或尺码信息`, true);
        return;
      }
      colorKeywordId = colorKeyword.id;
    }

    const combination = selectKeywordsForTarget({
      pools,
      usage,
      limit,
      isSubtitle,
      colorKeywordId,
    });

    if (!combination) {
      showToast('未能生成满足字符限制的标题，请调整关键词或提高上限', true);
      return;
    }

    assignments.push(() => target.apply(combination.ids.slice()));
    for (const keyword of combination.words) {
      incrementUsage(usage, keyword.id);
    }
  }

  for (const apply of assignments) {
    apply();
  }

  renderSpu(spuId);
  showToast('已根据公式生成标题，可继续调整顺序');
}

function generateSearchTerms(spuId, skuId, options = {}) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const sku = spu.skus.find((item) => item.id === skuId);
  if (!sku) return;
  if (!state.keywords.size) {
    if (!options.silent) {
      showToast('请先添加关键词', true);
    }
    return false;
  }
  if (!Array.isArray(sku.searchKeywords)) {
    sku.searchKeywords = [];
  }

  const usedKeywordIds = new Set(sku.titleKeywords || []);
  const pools = {};
  for (const { value } of KEYWORD_TYPES) {
    pools[value] = [];
  }
  for (const keyword of state.keywords.values()) {
    if (keyword.virtual) continue;
    const type = KEYWORD_TYPES.some((item) => item.value === keyword.type) ? keyword.type : 'core';
    if (usedKeywordIds.has(keyword.id)) continue;
    if (!pools[type]) pools[type] = [];
    pools[type].push(keyword);
  }

  const availableCount = Object.values(pools).reduce((total, list) => total + list.length, 0);
  if (!availableCount) {
    if (!options.silent) {
      showToast('暂无可用于该 SKU 的剩余关键词', true);
    }
    return false;
  }

  const usage = computeSpuKeywordUsage(spu, { excludeSearchSkuId: sku.id });

  const comparator = (a, b) => {
    const usageDiff = (usage.get(a.id) || 0) - (usage.get(b.id) || 0);
    if (usageDiff !== 0) return usageDiff;
    const heatDiff = getKeywordHeatValue(b) - getKeywordHeatValue(a);
    if (heatDiff !== 0) return heatDiff;
    return a.text.localeCompare(b.text, 'zh-Hans-CN');
  };

  const limit = getSearchLimit();
  const selected = [];
  const selectedSet = new Set();

  const tryAddKeyword = (keyword) => {
    if (!keyword || selectedSet.has(keyword.id)) return false;
    const tentative = selected.concat(keyword.id);
    const text = buildTextFromKeywordIds(tentative);
    if (text.length > limit) return false;
    selected.push(keyword.id);
    selectedSet.add(keyword.id);
    incrementUsage(usage, keyword.id);
    return true;
  };

  const pattern = (SEARCH_TYPE_PATTERN.length ? SEARCH_TYPE_PATTERN : Object.keys(pools)).filter(
    (type) => pools[type]?.length,
  );
  let patternIndex = 0;
  let idleSteps = 0;
  const maxIdle = Math.max(pattern.length * 3, 12);

  const hasRemainingPool = () => Object.values(pools).some((pool) => pool && pool.length);

  while (pattern.length && hasRemainingPool() && idleSteps < maxIdle) {
    const type = pattern[patternIndex % pattern.length];
    patternIndex += 1;
    const pool = pools[type];
    if (!pool || !pool.length) {
      idleSteps += 1;
      continue;
    }
    pool.sort(comparator);
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
      idleSteps += 1;
    }
  }

  if (!selected.length) {
    if (!options.silent) {
      showToast('未能在字符限制内生成搜索词，请调整限制或关键词', true);
    }
    return false;
  }

  const remainingCandidates = Object.values(pools)
    .flat()
    .sort(comparator);
  for (const keyword of remainingCandidates) {
    tryAddKeyword(keyword);
  }

  sku.searchKeywords = selected;
  if (!options.skipRender) {
    renderSpu(spuId);
  }
  if (!options.silent) {
    showToast('已生成搜索词，可继续调整或导出');
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
    const response = await fetch('https://api.deepseek.com/chat/completions', {
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
        label: `${spuLabel} - ${skuLabel}（搜索词）`,
        text,
        type: 'search',
        spuId: spu.id,
        skuId: sku.id,
      });
    }
  }
  return items;
}

function formatPreviewItems(items, format = 'simple') {
  if (!Array.isArray(items) || !items.length) return '';
  if (format === 'detailed') {
    return items
      .map((item, index) => `${index + 1}. ${item.label}: ${item.text}`)
      .join('\n\n');
  }
  return items.map((item) => item.text).join('\n');
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
  bucket.aiItems = [];
  bucket.aiRaw = '';
  if (bucket.enableFrequency) {
    bucket.frequencies = null;
  }
  renderPreview();
}

function getActivePreviewItems(kind) {
  const bucket = getPreviewBucket(kind);
  if (!bucket) return [];
  if (bucket.aiItems?.length) return bucket.aiItems;
  if (bucket.aiRaw) return bucket.items;
  return bucket.items;
}

function getPreviewCopyPayload(kind) {
  const bucket = getPreviewBucket(kind);
  if (!bucket) return '';
  const format = getPreviewFormat(kind);
  if (bucket.aiItems?.length) {
    return formatPreviewItems(bucket.aiItems, format);
  }
  if (bucket.aiRaw) {
    return bucket.aiRaw;
  }
  if (bucket.items?.length) {
    return formatPreviewItems(bucket.items, format);
  }
  return '';
}

function renderPreview() {
  renderTitlePreview();
  renderSearchPreview();
}

function renderTitlePreview() {
  const bucket = getPreviewBucket('titles');
  if (!bucket) return;
  const hasItems = Boolean(bucket.items?.length);
  const format = getPreviewFormat('titles');
  if (titlePreviewElements.empty) {
    titlePreviewElements.empty.hidden = hasItems;
  }
  if (titlePreviewElements.currentBlock) {
    titlePreviewElements.currentBlock.hidden = !hasItems;
    if (hasItems) {
      if (titlePreviewElements.text) {
        titlePreviewElements.text.textContent = formatPreviewItems(bucket.items, format);
      }
      if (titlePreviewElements.count) {
        titlePreviewElements.count.textContent = `${bucket.items.length} 条内容`;
      }
    } else {
      if (titlePreviewElements.text) {
        titlePreviewElements.text.textContent = '';
      }
      if (titlePreviewElements.count) {
        titlePreviewElements.count.textContent = '';
      }
    }
  }

  const hasAiText = Boolean(bucket.aiItems?.length || bucket.aiRaw);
  if (titlePreviewElements.aiBlock) {
    const shouldShow = hasItems;
    titlePreviewElements.aiBlock.hidden = !shouldShow;
    if (!shouldShow && titlePreviewElements.aiChars) {
      titlePreviewElements.aiChars.textContent = '';
    }
    if (shouldShow) {
      if (titlePreviewElements.aiEmpty) {
        titlePreviewElements.aiEmpty.hidden = hasAiText;
      }
      if (titlePreviewElements.aiText) {
        if (hasAiText) {
          const text = bucket.aiItems?.length ? formatPreviewItems(bucket.aiItems, format) : bucket.aiRaw;
          titlePreviewElements.aiText.textContent = text;
          titlePreviewElements.aiText.hidden = false;
          if (titlePreviewElements.aiChars) {
            titlePreviewElements.aiChars.textContent = text ? `字符数：${text.length}` : '';
          }
        } else {
          titlePreviewElements.aiText.textContent = '';
          titlePreviewElements.aiText.hidden = true;
          if (titlePreviewElements.aiChars) {
            titlePreviewElements.aiChars.textContent = '';
          }
        }
      }
    }
  }
  if (titlePreviewElements.aiExport) {
    titlePreviewElements.aiExport.disabled = !hasItems;
  }
  if (titlePreviewElements.aiReset) {
    titlePreviewElements.aiReset.disabled = !hasAiText;
  }

  const freqVisible = Array.isArray(bucket.frequencies) && bucket.frequencies.length > 0;
  const showFrequencyBlock = bucket.enableFrequency && (hasItems || freqVisible);
  if (titlePreviewElements.frequencyBlock) {
    titlePreviewElements.frequencyBlock.hidden = !showFrequencyBlock;
    if (titlePreviewElements.frequencyList) {
      titlePreviewElements.frequencyList.innerHTML = '';
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
          countEl.textContent = String(entry.count);
          row.append(wordEl, countEl);
          fragment.appendChild(row);
        }
        titlePreviewElements.frequencyList.appendChild(fragment);
      } else if (showFrequencyBlock) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = '暂无统计结果，请点击“生成词频统计”。';
        titlePreviewElements.frequencyList.appendChild(empty);
      }
    }
  }
}

function renderSearchPreview() {
  const bucket = getPreviewBucket('search');
  if (!bucket) return;
  const hasItems = Boolean(bucket.items?.length);
  const format = getPreviewFormat('search');
  if (searchPreviewElements.empty) {
    searchPreviewElements.empty.hidden = hasItems;
  }
  if (searchPreviewElements.currentBlock) {
    searchPreviewElements.currentBlock.hidden = !hasItems;
    if (hasItems) {
      if (searchPreviewElements.text) {
        searchPreviewElements.text.textContent = formatPreviewItems(bucket.items, format);
      }
      if (searchPreviewElements.count) {
        searchPreviewElements.count.textContent = `${bucket.items.length} 条内容`;
      }
    } else {
      if (searchPreviewElements.text) {
        searchPreviewElements.text.textContent = '';
      }
      if (searchPreviewElements.count) {
        searchPreviewElements.count.textContent = '';
      }
    }
  }

  const hasAiText = Boolean(bucket.aiItems?.length || bucket.aiRaw);
  if (searchPreviewElements.aiBlock) {
    const shouldShow = hasItems;
    searchPreviewElements.aiBlock.hidden = !shouldShow;
    if (!shouldShow && searchPreviewElements.aiChars) {
      searchPreviewElements.aiChars.textContent = '';
    }
    if (shouldShow) {
      if (searchPreviewElements.aiEmpty) {
        searchPreviewElements.aiEmpty.hidden = hasAiText;
      }
      if (searchPreviewElements.aiText) {
        if (hasAiText) {
          const text = bucket.aiItems?.length ? formatPreviewItems(bucket.aiItems, format) : bucket.aiRaw;
          searchPreviewElements.aiText.textContent = text;
          searchPreviewElements.aiText.hidden = false;
          if (searchPreviewElements.aiChars) {
            searchPreviewElements.aiChars.textContent = text ? `字符数：${text.length}` : '';
          }
        } else {
          searchPreviewElements.aiText.textContent = '';
          searchPreviewElements.aiText.hidden = true;
          if (searchPreviewElements.aiChars) {
            searchPreviewElements.aiChars.textContent = '';
          }
        }
      }
    }
  }
  if (searchPreviewElements.aiExport) {
    searchPreviewElements.aiExport.disabled = !hasItems;
  }
  if (searchPreviewElements.aiReset) {
    searchPreviewElements.aiReset.disabled = !hasAiText;
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
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function showTitleFrequencies() {
  const bucket = getPreviewBucket('titles');
  if (!bucket) return;
  const items = getActivePreviewItems('titles');
  if (!items?.length) {
    showToast('暂无可统计的内容', true);
    return;
  }
  const frequencies = computeWordFrequencies(items);
  if (!frequencies.length) {
    showToast('未检测到可统计的单词', true);
    bucket.frequencies = [];
    renderPreview();
    return;
  }
  bucket.frequencies = frequencies;
  renderPreview();
  showToast('词频统计已生成');
}

function clearTitleFrequencies() {
  const bucket = getPreviewBucket('titles');
  if (!bucket) return;
  bucket.frequencies = null;
  renderPreview();
}

function clearPreviewAi(kind) {
  const bucket = getPreviewBucket(kind);
  if (!bucket) return;
  bucket.aiItems = [];
  bucket.aiRaw = '';
  if (bucket.enableFrequency) {
    bucket.frequencies = null;
  }
  renderPreview();
}

async function adjustPreviewWithAI(kind) {
  const bucket = getPreviewBucket(kind);
  if (!bucket) return;
  const items = bucket.aiItems?.length ? bucket.aiItems : bucket.items;
  if (!items?.length) {
    showToast('请先在上方批量导出内容', true);
    return;
  }
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast('请先输入有效的 DeepSeek API Key', true);
    return;
  }
  const elements = kind === 'titles' ? titlePreviewElements : searchPreviewElements;
  const triggerBtn = elements.aiBtn;
  if (!triggerBtn) return;
  triggerBtn.disabled = true;
  const originalText = triggerBtn.textContent;
  triggerBtn.textContent = '调整中...';
  try {
    const listText = items
      .map((item, index) => `${index + 1}. ${item.label}: ${item.text}`)
      .join('\n');
    const response = await fetch('https://api.deepseek.com/chat/completions', {
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
              'You are an Amazon listing editor. For each entry (title or search term list), remove duplicate words caused by concatenating keyword blocks while preserving meaning, language, and approximate length. Maintain the entry order and respond using the format "n. Label: Text".',
          },
          {
            role: 'user',
            content: `Here are the entries:\n${listText}\n\nEnsure a word does not repeat within the same entry (e.g., "black bodysuit bodysuit for women" should become "black bodysuit for women"). For search term lists, keep words unique while retaining important phrases. If an entry needs no change, repeat it exactly.`,
          },
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
    const aiItems = items.map((item) => ({ ...item }));
    let parsed = 0;
    for (const line of content.split(/\n+/)) {
      const match = line.match(/^(\d+)\.\s*(.+?):\s*(.+)$/);
      if (!match) continue;
      const index = Number(match[1]) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= aiItems.length) continue;
      aiItems[index].label = match[2].trim() || aiItems[index].label;
      aiItems[index].text = match[3].trim();
      parsed += 1;
    }
    if (parsed > 0) {
      bucket.aiItems = aiItems;
      bucket.aiRaw = '';
    } else {
      bucket.aiItems = [];
      bucket.aiRaw = content;
      showToast('AI 返回内容格式异常，已显示原始文本', true);
    }
    if (bucket.enableFrequency) {
      bucket.frequencies = null;
    }
    renderPreview();
    if (parsed > 0) {
      showToast('AI 已完成内容检查');
    }
  } catch (error) {
    console.error(error);
    showToast(`AI 调整失败：${error.message}`, true);
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
  const keywords = sku.titleKeywords
    .map((keywordId) => state.keywords.get(keywordId)?.text)
    .filter(Boolean);
  if (!keywords.length) {
    alert('该 SKU 的标题为空，请先拖入关键词。');
    return;
  }
  const title = keywords.join(' ');
  navigator.clipboard?.writeText(title).then(() => {
    showToast('标题已复制到剪贴板');
  }).catch(() => {
    showToast(`标题：${title}`, true);
  });
}

function exportSearchTerms(spuId, skuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const sku = spu.skus.find((item) => item.id === skuId);
  if (!sku) return;
  const text = buildTextFromKeywordIds(sku.searchKeywords);
  if (!text) {
    alert('该 SKU 的搜索词为空，请先生成或输入。');
    return;
  }
  navigator.clipboard?.writeText(text).then(() => {
    showToast('搜索词已复制到剪贴板');
  }).catch(() => {
    showToast(`搜索词：${text}`, true);
  });
}

function exportSubtitle(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const keywords = (spu.subtitleKeywords || [])
    .map((keywordId) => state.keywords.get(keywordId)?.text)
    .filter(Boolean);
  if (!keywords.length) {
    alert('该 SPU 的父标题为空，请先拖入关键词或自动生成。');
    return;
  }
  const subtitle = keywords.join(' ');
  navigator.clipboard?.writeText(subtitle).then(() => {
    showToast('父标题已复制到剪贴板');
  }).catch(() => {
    showToast(`父标题：${subtitle}`, true);
  });
}

function generateAllSearchTerms(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  if (!spu.skus.length) {
    showToast('暂无 SKU 可生成搜索词', true);
    return;
  }
  if (!state.keywords.size) {
    showToast('请先添加关键词', true);
    return;
  }
  let success = 0;
  const failed = [];
  for (const sku of spu.skus) {
    const result = generateSearchTerms(spuId, sku.id, { silent: true, skipRender: true });
    if (result) {
      success += 1;
    } else {
      failed.push(sku.name || sku.id);
    }
  }
  renderSpu(spuId);
  if (success) {
    const message = failed.length
      ? `已生成 ${success} 个搜索词，未生成：${failed.join('、')}`
      : `已为 ${success} 个 SKU 生成搜索词`;
    showToast(message, failed.length > 0);
  } else {
    showToast('未能为任何 SKU 生成搜索词，请检查关键词或标题', true);
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
    const newItems = parsed.map((item) => ({
      id: `pending_${++pendingKeywordCounter}`,
      text: item.text,
      heat: item.heat,
      rank: item.rank,
      status: 'waiting',
      errorMessage: '',
    }));
    state.pendingKeywords.push(...newItems);
    renderPendingKeywords();
    bulkKeywordTextarea.value = '';
    classifyPendingKeywords(newItems);
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

if (titlePreviewElements.formatSelect) {
  titlePreviewElements.formatSelect.value = getPreviewFormat('titles');
  titlePreviewElements.formatSelect.addEventListener('change', () => {
    const value = titlePreviewElements.formatSelect.value === 'detailed' ? 'detailed' : 'simple';
    state.previewFormats.titles = value;
    renderPreview();
  });
}

if (searchPreviewElements.formatSelect) {
  searchPreviewElements.formatSelect.value = getPreviewFormat('search');
  searchPreviewElements.formatSelect.addEventListener('change', () => {
    const value = searchPreviewElements.formatSelect.value === 'detailed' ? 'detailed' : 'simple';
    state.previewFormats.search = value;
    renderPreview();
  });
}

renderPreview();

if (titlePreviewElements.exportBtn) {
  titlePreviewElements.exportBtn.addEventListener('click', () => {
    const items = collectTitlePreviewItems();
    if (!items.length) {
      showToast('暂无可导出的标题', true);
      return;
    }
    setPreviewItems('titles', items);
    const format = getPreviewFormat('titles');
    const payload = formatPreviewItems(items, format);
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('标题已导出并复制到剪贴板');
    }).catch(() => {
      showToast('复制失败，请手动复制', true);
      alert(payload);
    });
  });
}

if (titlePreviewElements.copyBtn) {
  titlePreviewElements.copyBtn.addEventListener('click', () => {
    const payload = getPreviewCopyPayload('titles');
    if (!payload) {
      showToast('暂无可复制的标题', true);
      return;
    }
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('标题内容已复制');
    }).catch(() => {
      showToast('复制失败，请手动复制', true);
      alert(payload);
    });
  });
}

if (titlePreviewElements.aiBtn) {
  titlePreviewElements.aiBtn.addEventListener('click', () => adjustPreviewWithAI('titles'));
}

if (titlePreviewElements.aiReset) {
  titlePreviewElements.aiReset.addEventListener('click', () => clearPreviewAi('titles'));
}

if (titlePreviewElements.aiExport) {
  titlePreviewElements.aiExport.addEventListener('click', () => {
    const payload = getPreviewCopyPayload('titles');
    if (!payload) {
      showToast('暂无可导出的标题结果', true);
      return;
    }
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('标题结果已复制');
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

if (searchPreviewElements.exportBtn) {
  searchPreviewElements.exportBtn.addEventListener('click', () => {
    const items = collectSearchPreviewItems();
    if (!items.length) {
      showToast('暂无可导出的搜索词', true);
      return;
    }
    setPreviewItems('search', items);
    const format = getPreviewFormat('search');
    const payload = formatPreviewItems(items, format);
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('搜索词已导出并复制到剪贴板');
    }).catch(() => {
      showToast('复制失败，请手动复制', true);
      alert(payload);
    });
  });
}

if (searchPreviewElements.copyBtn) {
  searchPreviewElements.copyBtn.addEventListener('click', () => {
    const payload = getPreviewCopyPayload('search');
    if (!payload) {
      showToast('暂无可复制的搜索词', true);
      return;
    }
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('搜索词内容已复制');
    }).catch(() => {
      showToast('复制失败，请手动复制', true);
      alert(payload);
    });
  });
}

if (searchPreviewElements.aiBtn) {
  searchPreviewElements.aiBtn.addEventListener('click', () => adjustPreviewWithAI('search'));
}

if (searchPreviewElements.aiReset) {
  searchPreviewElements.aiReset.addEventListener('click', () => clearPreviewAi('search'));
}

if (searchPreviewElements.aiExport) {
  searchPreviewElements.aiExport.addEventListener('click', () => {
    const payload = getPreviewCopyPayload('search');
    if (!payload) {
      showToast('暂无可导出的搜索词结果', true);
      return;
    }
    navigator.clipboard?.writeText(payload).then(() => {
      showToast('搜索词结果已复制');
    }).catch(() => {
      showToast('复制失败，请手动复制', true);
      alert(payload);
    });
  });
}

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
