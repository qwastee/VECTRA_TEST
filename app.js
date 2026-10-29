(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const palettes = [
    { name: 'Лаванда', colors: ['#DCD5FF', '#7D66D9', '#F5E99D', '#F29B86'] },
    { name: 'Мята', colors: ['#C9EEEA', '#2F827B', '#F8CFAF', '#6C56B4'] },
    { name: 'Графика', colors: ['#F5F2EA', '#171822', '#BFC2CC', '#FFFFFF'] },
    { name: 'Закат', colors: ['#FFD9C7', '#F06A6A', '#744FC6', '#F6E99E'] },
    { name: 'Океан', colors: ['#CDEFF3', '#237C92', '#78C5B8', '#F2D07A'] },
    { name: 'Ночь', colors: ['#20213A', '#7E70D8', '#F4DF83', '#F4F0E8'] }
  ];

  // Встроенная библиотека: только исходные SVG-файлы из репозитория.
  const bundledManifest = [{"path":"background objects/Group 2136136347.svg","category":"background","name":"Group 2136136347"},{"path":"background objects/Vector.svg","category":"background","name":"Vector"},{"path":"background objects/Книга.svg","category":"background","name":"Книга"},{"path":"background objects/Кошелек.svg","category":"background","name":"Кошелек"},{"path":"background objects/Лампа.svg","category":"background","name":"Лампа"},{"path":"background objects/Монета.svg","category":"background","name":"Монета"},{"path":"background objects/Наушники.svg","category":"background","name":"Наушники"},{"path":"background objects/Пазлы.svg","category":"background","name":"Пазлы"},{"path":"background objects/Папка.svg","category":"background","name":"Папка"},{"path":"background objects/Ручка.svg","category":"background","name":"Ручка"},{"path":"background objects/Телефон.svg","category":"background","name":"Телефон"},{"path":"main-objects/Group 2136136344.svg","category":"main","name":"Group 2136136344"},{"path":"main-objects/Vector.svg","category":"main","name":"Vector"},{"path":"main-objects/Книга.svg","category":"main","name":"Книга"},{"path":"main-objects/Кошелек.svg","category":"main","name":"Кошелек"},{"path":"main-objects/Лампа.svg","category":"main","name":"Лампа"},{"path":"main-objects/Монета.svg","category":"main","name":"Монета"},{"path":"main-objects/Наушники.svg","category":"main","name":"Наушники"},{"path":"main-objects/Пазлы.svg","category":"main","name":"Пазлы"},{"path":"main-objects/Папка.svg","category":"main","name":"Папка"},{"path":"main-objects/Ручка.svg","category":"main","name":"Ручка"},{"path":"main-objects/Телефон.svg","category":"main","name":"Телефон"}];
  let bundledAssets = [];
  async function loadBundledAssets() {
    const results = await Promise.allSettled(bundledManifest.map(async item => {
      const response = await fetch(encodeURI(item.path));
      if (!response.ok) throw new Error(`${item.path}: HTTP ${response.status}`);
      const asset = sanitizeSvg(await response.text(), item.name + '.svg');
      asset.category = item.category;
      asset.name = item.name === 'Vector' ? (item.category === 'main' ? 'Вектор (главный)' : 'Вектор (фон)') : item.name;
      asset.tags = tokenize(asset.name);
      asset.bundled = true;
      return asset;
    }));
    const failures = results.map((r, i) => r.status === 'rejected' ? `${bundledManifest[i].path}: ${r.reason?.message || r.reason}` : null).filter(Boolean);
    if (failures.length) console.error('VECTRA SVG load failures:', failures);
    bundledAssets = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    state.assets = [...bundledAssets];
    renderLibrary();
    $('#statusText').textContent = failures.length ? `Ошибка библиотеки: ${bundledAssets.length}/22. ${failures[0]}` : `Встроенная библиотека готова: ${bundledAssets.length}/22 SVG`;
    if (bundledAssets.length !== bundledManifest.length) toast(`Загружено ${bundledAssets.length} из ${bundledManifest.length} встроенных SVG`);
    else toast(`Библиотека готова: ${bundledAssets.length} SVG`);
  }

  // Только SVG, импортированные из исходных иллюстраций.
  const state = {
    assets: [],
    scene: [],
    selectedId: null,
    width: 1080,
    height: 1080,
    zoom: .62,
    paletteIndex: 0,
    palette: [...palettes[0].colors],
    background: palettes[0].colors[0],
    layout: 'editorial',
    history: [],
    future: []
  };

  const artboard = $('#artboard');
  const sceneNode = $('#scene');
  const overlayNode = $('#selectionOverlay');

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function normalize(text) {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
  }

  function tokenize(text) {
    const stop = new Set(['и','в','на','из','по','для','с','к','как','это','the','a','of','to']);
    return normalize(text).split(/\s+/).filter(w => w.length > 1 && !stop.has(w));
  }

  const semanticMap = {
    знан: ['книга','лист','блокнот'], обуч: ['книга','лист','лампа'],
    иде: ['пазл','лампа','карандаш','растение'], решен: ['пазл','блокнот','карандаш'],
    фокус: ['наушники','лампа','блокнот'], вниман: ['наушники','лампа'],
    рост: ['растение','книга','лампа'], развит: ['растение','книга','пазл'],
    связ: ['телефон','пазл','наушники'], команд: ['пазл','телефон','блокнот'],
    план: ['блокнот','карандаш','лист'], работ: ['лампа','блокнот','карандаш'],
    твор: ['карандаш','лампа','пазл'], цифров: ['телефон','наушники'],
    путь: ['книга','карандаш','лист'], музык: ['наушники'], звук: ['наушники']
  };

  function scoreAsset(asset, prompt) {
    const words = tokenize(prompt);
    const haystack = normalize(`${asset.name} ${asset.tags.join(' ')}`);
    let score = 0;
    words.forEach(word => {
      if (haystack.includes(word) || asset.tags.some(tag => normalize(tag).includes(word))) score += 5;
      Object.entries(semanticMap).forEach(([stem, related]) => {
        if (word.includes(stem) && related.some(term => haystack.includes(term))) score += 3;
      });
    });
    return score;
  }

  function sanitizeSvg(svgText, filename = 'Объект') {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Некорректный SVG');
    root.querySelectorAll('script, foreignObject, iframe, object, embed, image, use, style, animate, animateMotion, animateTransform, set, audio, video').forEach(node => node.remove());
    root.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith('on')) node.removeAttribute(attr.name);
        if (name === 'href' || name === 'xlink:href' || name === 'src' || name === 'style' || name === 'filter' || name === 'mask' || name === 'clip-path' || /url\s*\(/i.test(value)) node.removeAttribute(attr.name);
        if ((name === 'fill' || name === 'stroke') && /url\((?!#)/i.test(value)) node.setAttribute(attr.name, 'none');
      });
    });
    let viewBox = root.getAttribute('viewBox');
    if (!viewBox) {
      const w = parseFloat(root.getAttribute('width')) || 512;
      const h = parseFloat(root.getAttribute('height')) || 512;
      viewBox = `0 0 ${w} ${h}`;
    }
    if (!getValidViewBox(viewBox)) throw new Error('Некорректный viewBox');
    const cleanName = filename.replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').trim() || 'SVG-объект';
    return {
      id: uid('asset'), name: cleanName, category: 'main', tags: tokenize(cleanName),
      viewBox, markup: root.innerHTML, demo: false
    };
  }

  function getValidViewBox(value) { const n = String(value).trim().split(/[ ,]+/).map(Number); return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 && n.every(x => Math.abs(x) < 1000000); }

  function getViewBox(asset) {
    const nums = asset.viewBox.split(/[ ,]+/).map(Number);
    return nums.length === 4 && nums.every(Number.isFinite) ? nums : [0, 0, 512, 512];
  }

  function addObject(asset, opts = {}) {
    const [, , vbW, vbH] = getViewBox(asset);
    const target = asset.category === 'background' ? 350 : 270;
    const ratio = vbW / vbH || 1;
    const baseWidth = ratio >= 1 ? target : target * ratio;
    const baseHeight = ratio >= 1 ? target / ratio : target;
    const obj = {
      id: uid('obj'), assetId: asset.id, name: asset.name, markup: asset.markup, viewBox: asset.viewBox,
      x: opts.x ?? state.width / 2, y: opts.y ?? state.height / 2,
      scale: opts.scale ?? 1, rotation: opts.rotation ?? 0,
      baseWidth, baseHeight, category: asset.category
    };
    state.scene.push(obj);
    state.selectedId = obj.id;
    renderAll();
    return obj;
  }

  function snapshot() {
    state.history.push(JSON.stringify({scene: state.scene, width: state.width, height: state.height, palette: state.palette, background: state.background, layout: state.layout}));
    if (state.history.length > 40) state.history.shift();
    state.future = [];
  }

  function restoreSnapshot(raw) {
    const data = JSON.parse(raw);
    Object.assign(state, data);
    state.selectedId = null;
    renderAll();
  }

  function undo() {
    if (!state.history.length) return toast('Нет действий для отмены');
    state.future.push(JSON.stringify({scene: state.scene, width: state.width, height: state.height, palette: state.palette, background: state.background, layout: state.layout}));
    restoreSnapshot(state.history.pop());
  }

  function redo() {
    if (!state.future.length) return toast('Нет действий для повтора');
    state.history.push(JSON.stringify({scene: state.scene, width: state.width, height: state.height, palette: state.palette, background: state.background, layout: state.layout}));
    restoreSnapshot(state.future.pop());
  }

  function getAsset(assetId) { return state.assets.find(a => a.id === assetId); }
  function getSelected() { return state.scene.find(o => o.id === state.selectedId); }

  // Separate high-contrast outlines from palette fills.
  // Keep original SVG geometry. Map original dark ink to contrast ink,
  // and original light surfaces to contrasting palette fills.
  function recolorMarkup(markup, colors) {
    const bg = state.background || colors[0] || '#FFFFFF';
    const normalize = value => {
      let h = String(value).trim().toLowerCase();
      if (h === 'white') return '#ffffff';
      if (h === 'black') return '#000000';
      if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + [...h.slice(1)].map(c=>c+c).join('');
      return /^#[0-9a-f]{6}$/.test(h) ? h : null;
    };
    const luminance = value => {
      const h=normalize(value); if(!h) return null;
      const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      return .2126*c[0]+.7152*c[1]+.0722*c[2];
    };
    const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return x===null||y===null?1:(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const ink=['#181817','#ffffff'].sort((a,b)=>contrast(b,bg)-contrast(a,bg))[0];
    const accents=colors.filter(c=>normalize(c) && contrast(c,bg)>=1.55 && normalize(c)!==normalize(bg));
    const fills=accents.length?accents:[ink];
    const mapping=new Map(); let next=0;
    const recolor=(attr,value)=>{
      const key=normalize(value);
      if(!key) return value;
      if(attr.toLowerCase()==='stroke' || luminance(key)<.045) return ink;
      if(!mapping.has(key)) mapping.set(key,fills[next++%fills.length]);
      return mapping.get(key);
    };
    return markup.replace(/(fill|stroke)(\s*=\s*)(["'])([^"']+)\3/gi,(full,attr,eq,quote,value)=>`${attr}${eq}${quote}${recolor(attr,value)}${quote}`)
      .replace(/(fill|stroke)(\s*:\s*)(#[0-9a-f]{3}(?:[0-9a-f]{3})?|white|black)\b/gi,(full,attr,sep,value)=>`${attr}${sep}${recolor(attr,value)}`);
  }

  function renderScene() {
    sceneNode.innerHTML = '';
    state.scene.forEach(obj => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.id = obj.id;
      g.setAttribute('transform', `translate(${obj.x} ${obj.y}) rotate(${obj.rotation}) scale(${obj.scale})`);
      const nested = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      nested.setAttribute('x', -obj.baseWidth / 2);
      nested.setAttribute('y', -obj.baseHeight / 2);
      nested.setAttribute('width', obj.baseWidth);
      nested.setAttribute('height', obj.baseHeight);
      nested.setAttribute('viewBox', obj.viewBox);
      nested.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      nested.innerHTML = recolorMarkup(obj.markup, state.palette);
      g.appendChild(nested);
      sceneNode.appendChild(g);
    });
    renderSelection();
  }

  function renderSelection() {
    overlayNode.innerHTML = '';
    const obj = getSelected();
    $('#selectionPanel').classList.toggle('hidden', !obj);
    if (!obj) return;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', -obj.baseWidth / 2 - 8);
    rect.setAttribute('y', -obj.baseHeight / 2 - 8);
    rect.setAttribute('width', obj.baseWidth + 16);
    rect.setAttribute('height', obj.baseHeight + 16);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', '#6E56CF');
    rect.setAttribute('stroke-width', 3 / obj.scale);
    rect.setAttribute('stroke-dasharray', `${8 / obj.scale} ${6 / obj.scale}`);
    rect.setAttribute('transform', `translate(${obj.x} ${obj.y}) rotate(${obj.rotation}) scale(${obj.scale})`);
    overlayNode.appendChild(rect);
    $('#selectedName').textContent = obj.name;
    $('#xInput').value = Math.round(obj.x);
    $('#yInput').value = Math.round(obj.y);
    $('#scaleInput').value = obj.scale.toFixed(2);
    $('#rotationInput').value = ((Math.round(obj.rotation) % 360) + 360) % 360;
    $('#rotationSlider').value = ((Math.round(obj.rotation) % 360) + 360) % 360;
    $('#rotationValue').textContent = `${$('#rotationSlider').value}°`;
  }

  function renderLayers() {
    const list = $('#layersList');
    list.innerHTML = '';
    [...state.scene].reverse().forEach(obj => {
      const asset = getAsset(obj.assetId) || obj;
      const item = document.createElement('div');
      item.className = `layer-item${obj.id === state.selectedId ? ' active' : ''}`;
      item.dataset.id = obj.id;
      item.innerHTML = `<span class="layer-thumb"><svg viewBox="${escapeHtml(obj.viewBox)}">${recolorMarkup(obj.markup, state.palette)}</svg></span><span class="layer-meta"><b>${escapeHtml(obj.name)}</b><small>${obj.category === 'background' ? 'Фоновый объект' : 'Главный объект'}</small></span><span class="layer-grip">⋮⋮</span>`;
      item.addEventListener('click', () => { state.selectedId = obj.id; renderAll(); });
      list.appendChild(item);
    });
    $('#layerCount').textContent = state.scene.length;
  }

  function renderLibrary() {
    const query = normalize($('#searchInput').value || '');
    const category = $('#categoryFilter').value;
    const filtered = state.assets.filter(a => (category === 'all' || a.category === category) && (!query || normalize(`${a.name} ${a.tags.join(' ')}`).includes(query)));
    const grid = $('#assetGrid');
    grid.innerHTML = '';
    filtered.forEach(asset => {
      const card = document.createElement('button');
      card.className = 'asset-card';
      card.type = 'button';
      card.title = `Добавить: ${asset.name}`;
      card.innerHTML = `<span class="plus-badge">+</span><svg viewBox="${escapeHtml(asset.viewBox)}" aria-hidden="true">${recolorMarkup(asset.markup, state.palette)}</svg><span class="asset-meta"><b>${escapeHtml(asset.name)}</b><small>${asset.demo ? 'Демо · ' : ''}${asset.category === 'background' ? 'Фоновый объект' : 'Главный объект'}</small></span>`;
      card.addEventListener('click', () => { snapshot(); addObject(asset, {x: state.width/2 + (Math.random()-.5)*100, y: state.height/2 + (Math.random()-.5)*100}); toast(`${asset.name} добавлен`); });
      grid.appendChild(card);
    });
    $('#assetCount').textContent = state.assets.length;
  }

  function renderPalette() {
    const root = $('#palettePresets');
    root.innerHTML = '';
    palettes.forEach((palette, index) => {
      const button = document.createElement('button');
      button.className = `palette-card${index === state.paletteIndex ? ' active' : ''}`;
      button.innerHTML = `<span class="palette-bar">${palette.colors.map(c => `<i style="background:${c}"></i>`).join('')}</span><small>${palette.name}</small>`;
      button.addEventListener('click', () => {
        snapshot(); state.paletteIndex = index; state.palette = [...palette.colors]; state.background = state.palette[0]; renderAll();
      });
      root.appendChild(button);
    });
    const editor = $('#swatchEditor');
    editor.innerHTML = '';
    state.palette.forEach((color, index) => {
      const label = document.createElement('label');
      label.title = `Цвет ${index + 1}: ${color}`;
      label.innerHTML = `<input type="color" value="${/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'}" aria-label="Цвет ${index + 1}">`;
      const input = $('input', label);
      input.addEventListener('input', e => { state.palette[index] = e.target.value; if (index === 0) state.background = e.target.value; renderScene(); $('#canvasBackground').setAttribute('fill', state.background); });
      input.addEventListener('change', () => { state.paletteIndex = -1; renderAll(); });
      editor.appendChild(label);
    });
  }

  function fitCanvas() {
    const stage = $('#canvasStage');
    const maxW = Math.max(240, stage.clientWidth - 100);
    const maxH = Math.max(240, stage.clientHeight - 100);
    const baseScale = Math.min(maxW / state.width, maxH / state.height);
    const displayScale = baseScale * (state.zoom / .62);
    const wrap = $('#canvasWrap');
    wrap.style.width = `${Math.round(state.width * displayScale)}px`;
    wrap.style.height = `${Math.round(state.height * displayScale)}px`;
    artboard.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    artboard.setAttribute('width', state.width);
    artboard.setAttribute('height', state.height);
    const bg = $('#canvasBackground');
    bg.setAttribute('width', state.width);
    bg.setAttribute('height', state.height);
    bg.setAttribute('fill', state.background);
    $('#zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
    $('#canvasSizeLabel').textContent = `${state.width} × ${state.height} px`;
  }

  function renderAll() {
    fitCanvas(); renderScene(); renderLayers(); renderPalette();
  }

  function layoutScene(layout = state.layout) {
    if (!state.scene.length) return;
    const w = state.width, h = state.height, n = state.scene.length;
    state.scene.forEach((obj, i) => {
      const t = n === 1 ? .5 : i / (n - 1);
      if (layout === 'orbit') {
        const angle = -Math.PI/2 + i * (Math.PI * 2 / n);
        obj.x = w/2 + Math.cos(angle) * w * .27;
        obj.y = h/2 + Math.sin(angle) * h * .24;
        obj.rotation = Math.round(Math.sin(angle) * 10);
        obj.scale = obj.category === 'background' ? 1.15 : .9;
      } else if (layout === 'diagonal') {
        obj.x = w * (.22 + .56 * t);
        obj.y = h * (.76 - .52 * t);
        obj.rotation = -12 + i * 7;
        obj.scale = obj.category === 'background' ? 1.1 : .9 + (i % 2) * .15;
      } else if (layout === 'stack') {
        obj.x = w/2 + (i - (n-1)/2) * Math.min(65, w*.07);
        obj.y = h/2 + (i - (n-1)/2) * Math.min(42, h*.05);
        obj.rotation = -8 + i * 4;
        obj.scale = obj.category === 'background' ? 1.2 : .95;
      } else {
        const positions = [
          [.29,.34, -8, 1.12], [.67,.31, 7, .9], [.54,.67, -4, 1], [.25,.73, 10,.72], [.78,.72,-10,.7], [.5,.5,0,.76]
        ];
        const p = positions[i % positions.length];
        obj.x = w*p[0]; obj.y = h*p[1]; obj.rotation = p[2]; obj.scale = p[3] * (obj.category === 'background' ? 1.22 : 1);
      }
    });
    state.selectedId = state.scene.at(-1)?.id || null;
    renderAll();
  }

  function composeByMetaphor(prompt = $('#metaphorInput').value) {
    if (!prompt.trim()) return toast('Введите метафору или заголовок');
    if (!state.assets.length) return toast('Библиотека SVG ещё загружается');
    snapshot();
    const ranked = state.assets.map(asset => ({asset, score: scoreAsset(asset, prompt)})).sort((a,b) => b.score-a.score);
    let selected = ranked.filter(x => x.score > 0).slice(0, 5).map(x => x.asset);
    if (selected.length < 3) {
      const seed = [...prompt].reduce((sum,c) => sum + c.charCodeAt(0), 0);
      const fallback = [...state.assets].sort((a,b) => ((a.name.length + seed) % 11) - ((b.name.length + seed) % 11));
      selected = [...new Map([...selected, ...fallback].map(a => [a.id, a])).values()].slice(0, Math.min(5, state.assets.length));
    }
    state.scene = [];
    selected.forEach(asset => addObject(asset));
    layoutScene(state.layout);
    $('#statusText').textContent = `Подобрано по смыслу: ${selected.map(a => a.name).join(', ')}`;
    toast(`Композиция собрана: ${selected.length} объектов`);
  }

  function composeByNames() {
    const names = $('#componentInput').value.split(/[,;\n]+/).map(normalize).filter(Boolean);
    if (!names.length) return toast('Введите названия компонентов');
    const selected = [];
    const missing = [];
    names.forEach(name => {
      const asset = state.assets.find(a => normalize(a.name).includes(name) || name.includes(normalize(a.name)) || a.tags.some(t => normalize(t).includes(name)));
      if (asset && !selected.includes(asset)) selected.push(asset);
      if (!asset) missing.push(name);
    });
    if (!selected.length) return toast('Совпадений в библиотеке не найдено');
    if (missing.length) return toast(`Не найдены: ${missing.join(', ')}. Композиция не изменена`);
    snapshot(); state.scene = [];
    selected.forEach(asset => addObject(asset));
    layoutScene(state.layout);
    $('#statusText').textContent = `Собрано по названиям: ${selected.map(a => a.name).join(', ')}`;
    toast(`Добавлено объектов: ${selected.length}`);
  }

  async function importSvgFiles(files) {
    const svgFiles = [...files].filter(file => file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'));
    if (!svgFiles.length) return toast('Выберите файлы SVG');
    let added = 0;
    for (const file of svgFiles) {
      try {
        const text = await file.text();
        state.assets.push(sanitizeSvg(text, file.name));
        added++;
      } catch (error) {
        toast(`${file.name}: ${error.message}`);
      }
    }
    renderLibrary();
    $('#svgUpload').value = '';
    toast(`Загружено SVG: ${added}`);
  }

  function exportSvg() {
    if (!state.scene.length) return toast('Сначала добавьте объекты на холст');
    const defs = `<metadata>VECTRA: editable objects from the supplied SVG library. No rasterization.</metadata>`;
    const groups = state.scene.map((obj, index) => {
      const safeName = escapeHtml(obj.name);
      return `<g id="object-${index+1}" data-name="${safeName}" data-source-asset="${escapeHtml(obj.assetId)}" transform="translate(${obj.x} ${obj.y}) rotate(${obj.rotation}) scale(${obj.scale})"><svg x="${-obj.baseWidth/2}" y="${-obj.baseHeight/2}" width="${obj.baseWidth}" height="${obj.baseHeight}" viewBox="${escapeHtml(obj.viewBox)}" preserveAspectRatio="xMidYMid meet">${recolorMarkup(obj.markup, state.palette)}</svg></g>`;
    }).join('');
    const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}">${defs}<rect id="background" width="${state.width}" height="${state.height}" fill="${state.background}"/>${groups}</svg>`;
    const blob = new Blob([content], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `vector-composition-${state.width}x${state.height}.svg`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('SVG экспортирован — объекты остались векторными');
  }

  function duplicateSelected() {
    const obj = getSelected(); if (!obj) return;
    snapshot(); const clone = {...structuredClone(obj), id: uid('obj'), x: obj.x + 36, y: obj.y + 36, name: `${obj.name} · копия`};
    state.scene.push(clone); state.selectedId = clone.id; renderAll();
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    snapshot(); state.scene = state.scene.filter(o => o.id !== state.selectedId); state.selectedId = null; renderAll();
  }

  function moveLayer(direction) {
    const index = state.scene.findIndex(o => o.id === state.selectedId); if (index < 0) return;
    const next = Math.max(0, Math.min(state.scene.length - 1, index + direction)); if (next === index) return;
    snapshot(); const [obj] = state.scene.splice(index, 1); state.scene.splice(next, 0, obj); renderAll();
  }

  function pointInSvg(event) {
    const pt = artboard.createSVGPoint(); pt.x = event.clientX; pt.y = event.clientY;
    return pt.matrixTransform(artboard.getScreenCTM().inverse());
  }

  let drag = null;
  artboard.addEventListener('pointerdown', event => {
    const group = event.target.closest('#scene > g');
    if (!group) { state.selectedId = null; renderAll(); return; }
    const obj = state.scene.find(o => o.id === group.dataset.id); if (!obj) return;
    state.selectedId = obj.id; snapshot();
    const p = pointInSvg(event); drag = {id: obj.id, dx: p.x - obj.x, dy: p.y - obj.y};
    artboard.setPointerCapture(event.pointerId); renderAll();
  });
  artboard.addEventListener('pointermove', event => {
    if (!drag) return; const obj = state.scene.find(o => o.id === drag.id); if (!obj) return;
    const p = pointInSvg(event); obj.x = p.x - drag.dx; obj.y = p.y - drag.dy; renderScene(); renderLayers();
  });
  artboard.addEventListener('pointerup', () => { drag = null; });
  artboard.addEventListener('pointercancel', () => { drag = null; });

  function bindTransformInput(selector, key, parser = Number) {
    $(selector).addEventListener('change', event => {
      const obj = getSelected(); if (!obj) return;
      const value = parser(event.target.value); if (!Number.isFinite(value)) return; snapshot();
      obj[key] = key === 'scale' ? Math.max(.1, Math.min(8, value)) : key === 'rotation' ? ((value % 360) + 360) % 360 : value; renderAll();
    });
  }

  function setSize(size) {
    const [width, height] = size.split('x').map(Number); snapshot();
    const sx = width / state.width, sy = height / state.height;
    state.scene.forEach(o => { o.x *= sx; o.y *= sy; });
    state.width = width; state.height = height;
    $$('.format-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.size === size));
    renderAll();
  }

  function openInfo(type) {
    const root = $('#dialogContent');
    if (type === 'help') {
      root.innerHTML = `<div class="eyebrow">Короткая демонстрация</div><h2>От идеи до SVG за три шага</h2><p>Редактор не создаёт и не дорисовывает объекты. Он работает как умная монтажная поверхность для готовой библиотеки.</p><div class="steps"><div class="step"><b>1 · Загрузите</b><span>Добавьте отдельные SVG-файлы. Структура, пропорции и векторные пути сохраняются.</span></div><div class="step"><b>2 · Скомпонуйте</b><span>Введите метафору или точные названия. Алгоритм подберёт объекты и разложит их на холсте.</span></div><div class="step"><b>3 · Экспортируйте</b><span>Настройте слои, формат и палитру, затем скачайте редактируемый SVG.</span></div></div><p class="microcopy">Безопасность: при импорте удаляются исполняемые скрипты, внешние ссылки и foreignObject; геометрия SVG остаётся без изменений.</p>`;
    } else {
      root.innerHTML = `<div class="eyebrow">Исходные материалы</div><h2>Примеры работы</h2><p>Исходные SVG уже загружены во встроенную библиотеку. Выберите метафору или названия, чтобы автоматически собрать композицию; дополнительные SVG можно импортировать вручную.</p>`;
    }
    $('#infoDialog').showModal();
  }

  $$('.segment').forEach(btn => btn.addEventListener('click', () => {
    $$('.segment').forEach(x => { x.classList.toggle('active', x === btn); x.setAttribute('aria-selected', x === btn); });
    $('#metaphorPane').classList.toggle('hidden', btn.dataset.mode !== 'metaphor');
    $('#componentsPane').classList.toggle('hidden', btn.dataset.mode !== 'components');
  }));
  $$('.suggestions button').forEach(btn => btn.addEventListener('click', () => $('#metaphorInput').value = btn.dataset.prompt));
  $('#composeByMetaphor').addEventListener('click', () => composeByMetaphor());
  $('#composeByNames').addEventListener('click', composeByNames);
  $('#svgUpload').addEventListener('change', e => importSvgFiles(e.target.files));
  $('#dropzone').addEventListener('click', () => $('#svgUpload').click());
  $('#dropzone').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') $('#svgUpload').click(); });
  ['dragenter','dragover'].forEach(type => $('#dropzone').addEventListener(type, e => { e.preventDefault(); $('#dropzone').classList.add('drag'); }));
  ['dragleave','drop'].forEach(type => $('#dropzone').addEventListener(type, e => { e.preventDefault(); $('#dropzone').classList.remove('drag'); }));
  $('#dropzone').addEventListener('drop', e => importSvgFiles(e.dataTransfer.files));
  $('#searchInput').addEventListener('input', renderLibrary);
  $('#categoryFilter').addEventListener('change', renderLibrary);
  $('#resetDemoBtn').addEventListener('click', () => { if (!confirm('Очистить библиотеку и композицию?')) return; snapshot(); state.assets = [...bundledAssets]; state.scene = []; state.selectedId = null; renderAll(); toast('Композиция очищена, встроенная библиотека восстановлена'); });
  $('#layoutSelect').addEventListener('change', e => { snapshot(); state.layout = e.target.value; layoutScene(); });
  $('#shuffleBtn').addEventListener('click', () => { snapshot(); layoutScene(); toast('Композиция перестроена'); });
  $('#applyPaletteBtn').addEventListener('click', () => { snapshot(); state.paletteIndex = -1; renderAll(); toast('Палитра применена ко всей сцене'); });
  $('#paletteUpload').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text(); let colors;
      if (file.name.toLowerCase().endsWith('.json')) { const json = JSON.parse(text); colors = Array.isArray(json) ? json : json.colors; }
      else colors = text.match(/#[0-9a-fA-F]{6}/g);
      colors = [...new Set((colors || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)))].slice(0, 8);
      if (colors.length < 2) throw new Error('Нужно минимум два HEX-цвета');
      snapshot(); state.palette = colors; state.paletteIndex = -1; state.background = colors[0]; renderAll(); toast(`Палитра загружена: ${colors.length} цветов`);
    } catch (error) { toast(`Не удалось загрузить палитру: ${error.message}`); }
  });
  $$('.format-btn').forEach(btn => btn.addEventListener('click', () => setSize(btn.dataset.size)));
  $('#zoomInBtn').addEventListener('click', () => { state.zoom = Math.min(1.4, state.zoom + .1); fitCanvas(); });
  $('#zoomOutBtn').addEventListener('click', () => { state.zoom = Math.max(.25, state.zoom - .1); fitCanvas(); });
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
  $('#exportBtn').addEventListener('click', exportSvg);
  $('#deleteBtn').addEventListener('click', deleteSelected);
  $('#duplicateBtn').addEventListener('click', duplicateSelected);
  $('#sendBackBtn').addEventListener('click', () => moveLayer(-1));
  $('#bringFrontBtn').addEventListener('click', () => moveLayer(1));
  bindTransformInput('#xInput', 'x'); bindTransformInput('#yInput', 'y'); bindTransformInput('#scaleInput', 'scale'); bindTransformInput('#rotationInput', 'rotation');
  // Поворот вокруг центра объекта: центр задан в renderScene и exportSvg.
  let rotationStart = null;
  $('#rotationSlider').addEventListener('pointerdown', () => { const obj = getSelected(); rotationStart = obj ? obj.rotation : null; });
  $('#rotationSlider').addEventListener('input', event => {
    const obj = getSelected(); if (!obj) return;
    if (rotationStart === null) rotationStart = obj.rotation;
    obj.rotation = Number(event.target.value);
    renderScene(); $('#rotationInput').value = obj.rotation; $('#rotationValue').textContent = `${obj.rotation}°`;
  });
  $('#rotationSlider').addEventListener('change', () => {
    const obj = getSelected(); if (obj && rotationStart !== null && rotationStart !== obj.rotation) {
      const finalRotation = obj.rotation; obj.rotation = rotationStart; snapshot(); obj.rotation = finalRotation;
    }
    rotationStart = null; renderAll();
  });
  const rotateBy = amount => { const obj = getSelected(); if (!obj) return; snapshot(); obj.rotation = ((obj.rotation + amount) % 360 + 360) % 360; renderAll(); };
  $('#rotateLeftBtn').addEventListener('click', () => rotateBy(-15));
  $('#rotateRightBtn').addEventListener('click', () => rotateBy(15));
  $('#rotateResetBtn').addEventListener('click', () => { const obj = getSelected(); if (!obj) return; snapshot(); obj.rotation = 0; renderAll(); });
  $('#helpBtn').addEventListener('click', () => openInfo('help')); $('#examplesBtn').addEventListener('click', () => openInfo('examples'));

  window.addEventListener('keydown', event => {
    if (/input|textarea|select/i.test(document.activeElement?.tagName)) return;
    if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    const obj = getSelected(); if (!obj) return;
    const step = event.shiftKey ? 10 : 2;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); snapshot();
      if (event.key === 'ArrowLeft') obj.x -= step; if (event.key === 'ArrowRight') obj.x += step;
      if (event.key === 'ArrowUp') obj.y -= step; if (event.key === 'ArrowDown') obj.y += step;
      renderAll();
    }
  });
  window.addEventListener('resize', fitCanvas);

  renderLibrary(); renderPalette(); renderAll();
  loadBundledAssets();
})();
