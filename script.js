const KEYWORD_TYPES = [
  { value: 'core', label: '核心词' },
  { value: 'feature', label: '特征词' },
  { value: 'scene', label: '场景词' },
  { value: 'minor', label: '小语种词' },
];

const DEFAULT_TYPE_COLORS = {
  core: '#4C6EF5',
  feature: '#12B886',
  scene: '#845EF7',
  minor: '#FA5252',
};

const DEFAULT_FIVE_POINT_PROMPT =
  'You are an Amazon listing expert. Analyze the product information and write five concise Amazon bullet points in English, following marketplace rules.';

const state = {
  keywords: new Map(), // id -> keyword object
  spus: new Map(), // id -> { id, name, info, subtitleKeywords: [], skus: [] }
  keywordTypeColors: { ...DEFAULT_TYPE_COLORS },
};

let keywordCounter = 0;
let spuCounter = 0;
let skuCounter = 0;

const keywordListEl = document.getElementById('keyword-list');
const keywordForm = document.getElementById('keyword-form');
const clearLibraryBtn = document.getElementById('clear-library');
const keywordTypeSelect = document.getElementById('keyword-type');
const keywordColorInput = document.getElementById('keyword-color');
const typeColorGrid = document.getElementById('type-color-grid');
const spuForm = document.getElementById('spu-form');
const spuContainer = document.getElementById('spu-container');
const apiKeyInput = document.getElementById('api-key');

const keywordPillTemplate = document.getElementById('keyword-pill-template');
const spuTemplate = document.getElementById('spu-template');
const skuTemplate = document.getElementById('sku-template');

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

function updateKeywordColorInput(selectedType = keywordTypeSelect.value) {
  const color = state.keywordTypeColors[selectedType] || DEFAULT_TYPE_COLORS[selectedType] || '#4C6EF5';
  if (keywordColorInput) {
    keywordColorInput.value = color;
  }
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
    color: color || state.keywordTypeColors[finalType] || DEFAULT_TYPE_COLORS.core,
  };
  state.keywords.set(id, keyword);
  renderKeywordLibrary();
  renderSpuList();
}

function renderKeywordLibrary() {
  keywordListEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const keyword of state.keywords.values()) {
    fragment.appendChild(createKeywordPill(keyword, { allowRemove: false }));
  }
  if (!state.keywords.size) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '还没有关键词，请先在上方添加。';
    keywordListEl.appendChild(empty);
    return;
  }
  keywordListEl.appendChild(fragment);
}

function createKeywordPill(keyword, { allowRemove, context } = {}) {
  const pill = keywordPillTemplate.content.firstElementChild.cloneNode(true);
  pill.dataset.keywordId = keyword.id;
  pill.dataset.keywordType = keyword.type || 'core';
  pill.style.background = keyword.color || state.keywordTypeColors[keyword.type] || '#4c6ef5';
  pill.querySelector('.keyword-label').textContent = keyword.text;
  const meta = [];
  if (keyword.type) meta.push(`类型: ${getKeywordTypeLabel(keyword.type)}`);
  if (keyword.heat) meta.push(`热度: ${keyword.heat}`);
  if (keyword.rank) meta.push(`排名: ${keyword.rank}`);
  pill.querySelector('.keyword-meta').textContent = meta.join(' | ') || '无额外信息';
  if (!allowRemove) {
    pill.querySelector('.pill-remove').remove();
  } else {
    const btn = pill.querySelector('.pill-remove');
    btn.addEventListener('click', () => {
      if (!context) return;
      const { spuId, containerId, containerType, keywordId } = context;
      const spu = state.spus.get(spuId);
      if (!spu) return;
      const collection = getKeywordCollection(spu, containerType, containerId);
      if (!collection) return;
      const index = collection.indexOf(keywordId);
      if (index < 0) return;
      collection.splice(index, 1);
      renderSpu(spuId);
    });
  }

  pill.addEventListener('dragstart', (event) => handleDragStart(event, { context }));
  pill.addEventListener('click', () => copyKeyword(keyword));
  return pill;
}

function renderDropzoneKeywords(dropzone, keywords, optionsFactory) {
  dropzone.querySelectorAll('.keyword-pill').forEach((pill) => pill.remove());
  const placeholder = dropzone.querySelector('.placeholder');
  if (!keywords || !keywords.length) {
    if (placeholder) placeholder.hidden = false;
    return;
  }
  if (placeholder) placeholder.hidden = true;
  for (const keywordId of keywords) {
    const keyword = state.keywords.get(keywordId);
    if (!keyword) continue;
    const options = optionsFactory ? optionsFactory(keywordId, keyword) : undefined;
    const pill = createKeywordPill(keyword, options);
    dropzone.appendChild(pill);
  }
}

function handleDragStart(event, { context }) {
  const keywordId = event.currentTarget.dataset.keywordId;
  const payload = context
    ? {
        type: 'title',
        keywordId,
        containerId: context.containerId,
        containerType: context.containerType,
        spuId: context.spuId,
      }
    : { type: 'library', keywordId };
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
  fromCollection.splice(index, 1);
  const insertIndex = beforeKeywordId ? toCollection.indexOf(beforeKeywordId) : -1;
  if (insertIndex >= 0) {
    toCollection.splice(insertIndex, 0, keywordId);
  } else {
    toCollection.push(keywordId);
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

function addSpu({ name, info }) {
  const id = `spu_${++spuCounter}`;
  const spu = {
    id,
    name,
    info,
    subtitleKeywords: [],
    fivePointPrompt: DEFAULT_FIVE_POINT_PROMPT,
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

function renderSpuList() {
  spuContainer.innerHTML = '';
  if (!state.spus.size) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '还没有创建任何 SPU，请先在上方添加。';
    spuContainer.appendChild(empty);
    return;
  }
  for (const [spuId] of state.spus) {
    renderSpu(spuId, { append: true });
  }
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
  card.querySelector('.spu-info').textContent = spu.info || '（暂无产品信息）';
  const subtitleDropzone = card.querySelector('.subtitle-dropzone');
  subtitleDropzone.dataset.containerType = 'subtitle';
  subtitleDropzone.dataset.containerId = 'subtitle';
  bindDropzoneEvents(subtitleDropzone);
  renderDropzoneKeywords(subtitleDropzone, spu.subtitleKeywords, (keywordId) => ({
    allowRemove: true,
    context: { spuId: spu.id, containerType: 'subtitle', containerId: 'subtitle', keywordId },
  }));
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

  const promptTextarea = card.querySelector('.five-point-prompt');
  if (promptTextarea) {
    promptTextarea.value = spu.fivePointPrompt || DEFAULT_FIVE_POINT_PROMPT;
  }

  const fivePointBox = card.querySelector('.five-point-output');
  if (fivePointBox) {
    fivePointBox.hidden = !spu.fivePoints;
    if (spu.fivePoints) {
      fivePointBox.querySelector('.five-point-text').textContent = spu.fivePoints;
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

  skuElement.querySelector('.sku-export').addEventListener('click', () => exportTitle(spuId, sku.id));
  skuElement.querySelector('.sku-delete').addEventListener('click', () => removeSku(spuId, sku.id));
  return skuElement;
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
  const deleteSpuBtn = card.querySelector('.delete-spu');
  const generateBtn = card.querySelector('.generate-five');
  const promptTextarea = card.querySelector('.five-point-prompt');
  const bulkTextarea = card.querySelector('.bulk-sku-text');
  const bulkAddBtn = card.querySelector('.bulk-add-sku');
  const bulkClearBtn = card.querySelector('.bulk-clear');
  const fivePointDetails = card.querySelector('.five-point-panel');

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

  if (promptTextarea) {
    promptTextarea.addEventListener('input', () => {
      const spu = state.spus.get(spuId);
      if (!spu) return;
      spu.fivePointPrompt = promptTextarea.value;
    });
  }

  deleteSpuBtn.onclick = () => {
    if (confirm('确定要删除该 SPU 及其所有 SKU 吗？')) {
      deleteSpu(spuId);
    }
  };

  if (generateBtn) {
    generateBtn.onclick = () => {
      if (fivePointDetails && !fivePointDetails.open) {
        fivePointDetails.open = true;
      }
      generateFivePoints(spuId);
    };
  }
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

  const keywordsByType = {};
  for (const { value } of KEYWORD_TYPES) {
    keywordsByType[value] = [];
  }

  for (const keyword of state.keywords.values()) {
    if (keywordsByType[keyword.type]) {
      keywordsByType[keyword.type].push(keyword.id);
    }
  }

  if ((keywordsByType.core || []).length < 2) {
    showToast('请至少添加 2 个核心词', true);
    return;
  }
  if ((keywordsByType.feature || []).length < 2) {
    showToast('请至少添加 2 个特征词', true);
    return;
  }
  if ((keywordsByType.scene || []).length < 1) {
    showToast('请至少添加 1 个场景词', true);
    return;
  }
  if ((keywordsByType.minor || []).length < 1) {
    showToast('请至少添加 1 个小语种词', true);
    return;
  }

  const selectors = {};
  for (const [type, ids] of Object.entries(keywordsByType)) {
    if (ids.length) {
      selectors[type] = { list: shuffle(ids), pointer: 0 };
    }
  }

  const pickWord = (type, usedSet) => {
    const selector = selectors[type];
    if (!selector || !selector.list.length) return null;
    for (let i = 0; i < selector.list.length; i += 1) {
      const idx = (selector.pointer + i) % selector.list.length;
      const candidate = selector.list[idx];
      if (!usedSet.has(candidate)) {
        selector.pointer = (idx + 1) % selector.list.length;
        return candidate;
      }
    }
    return null;
  };

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
    const used = new Set();
    const combination = [];

    const core1 = pickWord('core', used);
    const feature1 = pickWord('feature', used);
    const core2 = pickWord('core', used);
    const feature2 = pickWord('feature', used);
    const scene = pickWord('scene', used);
    const minor = pickWord('minor', used);

    if (!core1 || !core2 || !feature1 || !feature2 || !scene || !minor) {
      showToast('请确保每种类型的关键词数量充足且互不重复', true);
      return;
    }

    combination.push(core1, feature1, core2, feature2, scene, minor);
    assignments.push(() => target.apply(combination.slice()));

    for (const typeName of ['core', 'feature', 'scene', 'minor']) {
      if (selectors[typeName]) {
        const selector = selectors[typeName];
        selector.pointer = (selector.pointer + 1) % selector.list.length;
      }
    }
  }

  for (const apply of assignments) {
    apply();
  }

  renderSpu(spuId);
  showToast('已根据公式生成标题，可继续调整顺序');
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
  const card = spuContainer.querySelector(`[data-spu-id="${spuId}"]`);
  const generateBtn = card?.querySelector('.generate-five');
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
    renderSpu(spuId);
    showToast('五点描述生成成功');
  } catch (error) {
    console.error(error);
    alert(`生成失败：${error.message}`);
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = '五点生成';
    }
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

function exportSubtitle(spuId) {
  const spu = state.spus.get(spuId);
  if (!spu) return;
  const keywords = (spu.subtitleKeywords || [])
    .map((keywordId) => state.keywords.get(keywordId)?.text)
    .filter(Boolean);
  if (!keywords.length) {
    alert('该 SPU 的副标题为空，请先拖入关键词或自动生成。');
    return;
  }
  const subtitle = keywords.join(' ');
  navigator.clipboard?.writeText(subtitle).then(() => {
    showToast('副标题已复制到剪贴板');
  }).catch(() => {
    showToast(`副标题：${subtitle}`, true);
  });
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
  createKeyword({
    text,
    heat,
    rank,
    color,
    type,
  });
  keywordForm.reset();
  keywordTypeSelect.value = type;
  updateKeywordColorInput(type);
});

clearLibraryBtn.addEventListener('click', () => {
  if (!state.keywords.size) return;
  if (confirm('确定要清空所有关键词吗？该操作不可恢复。')) {
    state.keywords.clear();
    for (const spu of state.spus.values()) {
      spu.subtitleKeywords = [];
      for (const sku of spu.skus) {
        sku.titleKeywords = [];
      }
    }
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

if (keywordTypeSelect) {
  keywordTypeSelect.addEventListener('change', () => updateKeywordColorInput());
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
    if (keywordTypeSelect?.value === keywordType) {
      updateKeywordColorInput(keywordType);
    }
  });
}

updateKeywordColorInput();
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
