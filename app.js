/**
 * StampMaster Pro - 在线文档盖章引擎
 */

// --- IndexedDB 自动化句柄持久化库 ---
const DB_NAME = 'StampMasterDB';
const STORE_NAME = 'handles';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveDirHandle(handle) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, 'rootDir');
}

async function getSavedDirHandle() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get('rootDir');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

// 统一 Mouse / Touch 触摸坐标
function getEventCoords(e) {
    if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
}

// --- 全局状态 ---
const state = {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isPanning: false,
    startPanX: 0,
    startPanY: 0,

    doc: {
        file: null,
        type: null,
        pdfDoc: null,
        currentPage: 1,
        totalPages: 1,
        originalWidth: 0,
        originalHeight: 0
    },

    stampLibrary: [],
    openFolders: new Set(),
    placedStamps: {},
    selectedStampId: null,
    nextStampId: 1
};

// --- DOM 节点 ---
const dom = {
    viewport: document.getElementById('viewport'),
    canvasStage: document.getElementById('canvas-stage'),
    docCanvas: document.getElementById('doc-canvas'),
    stampLayer: document.getElementById('stamp-layer'),
    dropZone: document.getElementById('drop-zone-overlay'),
    btnTriggerDropZone: document.getElementById('btn-trigger-drop-zone'),
    dirStatus: document.getElementById('dir-status'),
    
    sidebarLeft: document.getElementById('sidebar-left'),
    sidebarRight: document.getElementById('sidebar-right'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    btnToggleLeftSidebar: document.getElementById('btn-toggle-left-sidebar'),
    btnToggleRightSidebar: document.getElementById('btn-toggle-right-sidebar'),

    fileInputDoc: document.getElementById('file-input-doc'),
    stampCategories: document.getElementById('stamp-categories'),
    stampSearch: document.getElementById('stamp-search'),
    btnToggleAllFolders: document.getElementById('btn-toggle-all-folders'),
    btnChangeDir: document.getElementById('btn-change-dir'),
    folderInputFallback: document.getElementById('folder-input-fallback'),
    
    btnAddTempStamp: document.getElementById('btn-add-temp-stamp'),
    inputTempStamp: document.getElementById('input-temp-stamp'),

    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    zoomLevelText: document.getElementById('zoom-level'),

    pageControls: document.getElementById('page-controls'),
    btnPrevPage: document.getElementById('btn-prev-page'),
    btnNextPage: document.getElementById('btn-next-page'),
    pageInfo: document.getElementById('page-info'),

    propEmptyTip: document.getElementById('prop-empty-tip'),
    propControls: document.getElementById('prop-controls'),
    propScale: document.getElementById('prop-scale'),
    propScaleVal: document.getElementById('prop-scale-val'),
    propRotate: document.getElementById('prop-rotate'),
    propRotateVal: document.getElementById('prop-rotate-val'),
    propOpacity: document.getElementById('prop-opacity'),
    propOpacityVal: document.getElementById('prop-opacity-val'),
    propBlend: document.getElementById('prop-blend'),
    btnDeleteStamp: document.getElementById('btn-delete-stamp'),
    btnRotMinus90: document.getElementById('btn-rot--90'),
    btnRot0: document.getElementById('btn-rot-0'),
    btnRot90: document.getElementById('btn-rot-90')
};

// --- 初始化程序 ---
window.addEventListener('DOMContentLoaded', async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    initEvents();
    await autoDetectStamps();
});

// 自动读取关联识别目录
async function autoDetectStamps() {
    state.stampLibrary = [];

    let savedHandle = await getSavedDirHandle();

    if (savedHandle) {
        try {
            const options = { mode: 'read' };
            if ((await savedHandle.queryPermission(options)) === 'granted' || 
                (await savedHandle.requestPermission(options)) === 'granted') {
                await scanDirectoryHandle(savedHandle, '');
                updateDirStatus(`已加载目录 [${savedHandle.name}] - ${state.stampLibrary.length} 印章`, false);
                renderStampLibraryUI();
                return;
            }
        } catch (e) { console.log('Restore handle fallback'); }
    }

    try {
        const resp = await fetch('./stamps.json');
        if (resp.ok) {
            const list = await resp.json();
            state.stampLibrary = list;
            updateDirStatus(`已加载 ${list.length} 个印章`, false);
            renderStampLibraryUI();
            return;
        }
    } catch (e) {}

    updateDirStatus('可点击更改目录', true);
}

// 更改识别目录
async function selectAndSaveNewDirectory() {
    if ('showDirectoryPicker' in window) {
        try {
            const dirHandle = await window.showDirectoryPicker();
            await saveDirHandle(dirHandle);
            state.stampLibrary = [];
            state.openFolders.clear();
            await scanDirectoryHandle(dirHandle, '');
            updateDirStatus(`当前目录 [${dirHandle.name}] - ${state.stampLibrary.length} 印章`, false);
            renderStampLibraryUI();
        } catch (err) {
            if (err.name !== 'AbortError') console.error(err);
        }
    } else {
        dom.folderInputFallback.click();
    }
}

function updateDirStatus(text, isActionRequired) {
    if (!dom.dirStatus) return;
    if (isActionRequired) {
        dom.dirStatus.innerHTML = `<i class="fa-solid fa-folder-plus"></i> ${text}`;
    } else {
        dom.dirStatus.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--accent-green)"></i> ${text}`;
    }
}

async function scanDirectoryHandle(dirHandle, currentPath) {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory') {
            await scanDirectoryHandle(entry, entry.name);
        } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.png')) {
            const file = await entry.getFile();
            const url = URL.createObjectURL(file);
            state.stampLibrary.push({
                folder: currentPath || '未分类印章',
                name: entry.name.replace('.png', ''),
                url: url
            });
        }
    }
}

// 渲染可折叠印章库 UI 列表
function renderStampLibraryUI() {
    const query = dom.stampSearch.value.trim().toLowerCase();
    dom.stampCategories.innerHTML = '';

    if (state.stampLibrary.length === 0) {
        dom.stampCategories.innerHTML = `
            <div class="empty-tip">
                <i class="fa-solid fa-folder-open"></i>
                <p>未找到透明印章</p>
                <p style="font-size:11px; margin-top:4px; opacity:0.7;">可使用“临时上传”或点击“目录”</p>
            </div>`;
        return;
    }

    const groups = {};
    state.stampLibrary.forEach(item => {
        if (query && !item.name.toLowerCase().includes(query) && !item.folder.toLowerCase().includes(query)) return;
        if (!groups[item.folder]) groups[item.folder] = [];
        groups[item.folder].push(item);
    });

    Object.keys(groups).sort().forEach(folderName => {
        const isOpen = query.length > 0 ? true : state.openFolders.has(folderName);

        const folderEl = document.createElement('div');
        folderEl.className = `folder-group ${isOpen ? 'open' : ''}`;
        folderEl.setAttribute('data-folder', folderName);

        const titleEl = document.createElement('div');
        titleEl.className = 'folder-title';
        titleEl.innerHTML = `
            <div class="folder-title-left">
                <i class="fa-solid fa-chevron-right chevron-icon"></i>
                <i class="fa-regular fa-folder"></i>
                <span>${folderName}</span>
            </div>
            <span class="folder-count-badge">${groups[folderName].length}</span>
        `;

        const collapseWrapper = document.createElement('div');
        collapseWrapper.className = 'folder-collapse-wrapper';

        const collapseInner = document.createElement('div');
        collapseInner.className = 'folder-collapse-inner';

        const gridEl = document.createElement('div');
        gridEl.className = 'stamp-grid';

        groups[folderName].forEach(stamp => {
            const card = document.createElement('div');
            card.className = 'stamp-item';
            card.draggable = true;
            card.innerHTML = `<img src="${stamp.url}" alt="${stamp.name}"><span>${stamp.name}</span>`;

            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify(stamp));
            });
            card.addEventListener('click', () => {
                addStampToCanvas(stamp);
                closeMobileDrawers();
            });

            gridEl.appendChild(card);
        });

        collapseInner.appendChild(gridEl);
        collapseWrapper.appendChild(collapseInner);

        titleEl.addEventListener('click', () => {
            const currentlyOpen = folderEl.classList.contains('open');
            if (currentlyOpen) {
                folderEl.classList.remove('open');
                state.openFolders.delete(folderName);
            } else {
                folderEl.classList.add('open');
                state.openFolders.add(folderName);
            }
        });

        folderEl.appendChild(titleEl);
        folderEl.appendChild(collapseWrapper);
        dom.stampCategories.appendChild(folderEl);
    });
}

// 移动端抽屉面板切换
function openLeftDrawer() {
    dom.sidebarLeft.classList.add('show');
    dom.sidebarBackdrop.classList.add('show');
}
function openRightDrawer() {
    dom.sidebarRight.classList.add('show');
    dom.sidebarBackdrop.classList.add('show');
}
function closeMobileDrawers() {
    dom.sidebarLeft.classList.remove('show');
    dom.sidebarRight.classList.remove('show');
    dom.sidebarBackdrop.classList.remove('show');
}

// --- 事件绑定 ---
function initEvents() {
    dom.btnToggleLeftSidebar?.addEventListener('click', openLeftDrawer);
    dom.btnToggleRightSidebar?.addEventListener('click', openRightDrawer);
    dom.sidebarBackdrop?.addEventListener('click', closeMobileDrawers);
    document.querySelectorAll('.btn-close-drawer').forEach(btn => btn.addEventListener('click', closeMobileDrawers));

    dom.btnChangeDir.addEventListener('click', selectAndSaveNewDirectory);

    // 点击中间卡片/覆盖层直接选择文档文件
    dom.dropZone.addEventListener('click', () => dom.fileInputDoc.click());

    // 临时上传单个印章
    dom.btnAddTempStamp.addEventListener('click', () => dom.inputTempStamp.click());
    dom.inputTempStamp.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);
            const stampName = file.name.replace(/\.[^/.]+$/, "");
            
            const tempStamp = {
                folder: '临时印章',
                name: stampName,
                url: url
            };

            state.stampLibrary.unshift(tempStamp);
            state.openFolders.add('临时印章');
            renderStampLibraryUI();

            addStampToCanvas(tempStamp);
            closeMobileDrawers();
            e.target.value = '';
        }
    });

    dom.fileInputDoc.addEventListener('change', (e) => {
        if (e.target.files[0]) loadDocument(e.target.files[0]);
    });

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            loadDocument(e.dataTransfer.files[0]);
        }
    });

    dom.stampSearch.addEventListener('input', renderStampLibraryUI);

    dom.btnToggleAllFolders.addEventListener('click', () => {
        const allGroups = dom.stampCategories.querySelectorAll('.folder-group');
        let anyClosed = false;
        allGroups.forEach(el => {
            if (!el.classList.contains('open')) anyClosed = true;
        });

        allGroups.forEach(groupEl => {
            const folderName = groupEl.getAttribute('data-folder');
            if (anyClosed) {
                groupEl.classList.add('open');
                state.openFolders.add(folderName);
            } else {
                groupEl.classList.remove('open');
                state.openFolders.delete(folderName);
            }
        });
    });

    // 画布平移 (Mouse & Touch 统一控制)
    const startPan = (e) => {
        if (e.target === dom.viewport || e.target === dom.docCanvas || e.target === dom.stampLayer) {
            state.isPanning = true;
            const coords = getEventCoords(e);
            state.startPanX = coords.clientX - state.panX;
            state.startPanY = coords.clientY - state.panY;
            deselectStamp();
        }
    };

    const movePan = (e) => {
        if (state.isPanning) {
            const coords = getEventCoords(e);
            state.panX = coords.clientX - state.startPanX;
            state.panY = coords.clientY - state.startPanY;
            applyTransform();
        }
    };

    const endPan = () => { state.isPanning = false; };

    dom.viewport.addEventListener('mousedown', startPan);
    window.addEventListener('mousemove', movePan);
    window.addEventListener('mouseup', endPan);

    dom.viewport.addEventListener('touchstart', startPan, { passive: true });
    window.addEventListener('touchmove', movePan, { passive: true });
    window.addEventListener('touchend', endPan);

    dom.viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        setZoom(state.zoom * (e.deltaY < 0 ? 1.08 : 0.92));
    });

    dom.btnZoomIn.addEventListener('click', () => setZoom(state.zoom * 1.15));
    dom.btnZoomOut.addEventListener('click', () => setZoom(state.zoom / 1.15));
    dom.btnZoomReset.addEventListener('click', resetViewFit);

    dom.btnPrevPage.addEventListener('click', () => switchPage(state.doc.currentPage - 1));
    dom.btnNextPage.addEventListener('click', () => switchPage(state.doc.currentPage + 1));

    dom.propScale.addEventListener('input', (e) => {
        updateSelectedStamp({ scale: parseFloat(e.target.value) / 100 });
        dom.propScaleVal.textContent = e.target.value + '%';
    });
    dom.propRotate.addEventListener('input', (e) => {
        updateSelectedStamp({ rotation: parseInt(e.target.value) });
        dom.propRotateVal.textContent = e.target.value + '°';
    });
    dom.propOpacity.addEventListener('input', (e) => {
        updateSelectedStamp({ opacity: parseFloat(e.target.value) / 100 });
        dom.propOpacityVal.textContent = e.target.value + '%';
    });
    dom.propBlend.addEventListener('change', (e) => {
        updateSelectedStamp({ blendMode: e.target.value });
    });
    dom.btnDeleteStamp.addEventListener('click', deleteSelectedStamp);
    dom.btnRotMinus90.addEventListener('click', () => adjustRotation(-90));
    dom.btnRot0.addEventListener('click', () => updateSelectedStamp({ rotation: 0 }));
    dom.btnRot90.addEventListener('click', () => adjustRotation(90));

    document.querySelectorAll('.export-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const format = e.currentTarget.getAttribute('data-type');
            exportDocument(format);
        });
    });
}

// --- 加载与绘制文档 ---
async function loadDocument(file) {
    state.doc.file = file;
    state.placedStamps = {};
    deselectStamp();

    if (file.type === 'application/pdf') {
        state.doc.type = 'pdf';
        const buffer = await file.arrayBuffer();
        state.doc.pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
        state.doc.totalPages = state.doc.pdfDoc.numPages;
        state.doc.currentPage = 1;
        dom.pageControls.style.display = 'flex';
        await renderPDFPage(1);
    } else if (file.type.startsWith('image/')) {
        state.doc.type = 'image';
        state.doc.totalPages = 1;
        state.doc.currentPage = 1;
        dom.pageControls.style.display = 'none';
        await renderImageFile(file);
    }

    dom.dropZone.classList.add('hidden');
    resetViewFit();
}

function renderImageFile(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            state.doc.originalWidth = img.width;
            state.doc.originalHeight = img.height;
            dom.docCanvas.width = img.width;
            dom.docCanvas.height = img.height;
            const ctx = dom.docCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            syncStageSize();
            renderStampsForCurrentPage();
            resolve();
        };
    });
}

async function renderPDFPage(pageNum) {
    const page = await state.doc.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    state.doc.originalWidth = viewport.width;
    state.doc.originalHeight = viewport.height;
    dom.docCanvas.width = viewport.width;
    dom.docCanvas.height = viewport.height;
    
    const ctx = dom.docCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    dom.pageInfo.textContent = `${pageNum}/${state.doc.totalPages}`;
    syncStageSize();
    renderStampsForCurrentPage();
}

function syncStageSize() {
    dom.stampLayer.style.width = dom.docCanvas.width + 'px';
    dom.stampLayer.style.height = dom.docCanvas.height + 'px';
    dom.canvasStage.style.width = dom.docCanvas.width + 'px';
    dom.canvasStage.style.height = dom.docCanvas.height + 'px';
}

function switchPage(pageNum) {
    if (pageNum < 1 || pageNum > state.doc.totalPages) return;
    state.doc.currentPage = pageNum;
    deselectStamp();
    renderPDFPage(pageNum);
}

// --- 印章交互触控 ---
dom.viewport.addEventListener('dragover', (e) => e.preventDefault());
dom.viewport.addEventListener('drop', (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (data) {
        try {
            const stampData = JSON.parse(data);
            const rect = dom.docCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / state.zoom;
            const y = (e.clientY - rect.top) / state.zoom;
            addStampToCanvas(stampData, x, y);
        } catch (err) {}
    }
});

function addStampToCanvas(stampData, targetX, targetY) {
    if (!state.doc.file) return;

    const img = new Image();
    img.src = stampData.url;
    img.onload = () => {
        const defaultWidth = Math.max(120, state.doc.originalWidth * 0.18);
        const defaultHeight = defaultWidth * (img.height / img.width);
        
        const x = targetX !== undefined ? targetX - defaultWidth / 2 : (state.doc.originalWidth - defaultWidth) / 2;
        const y = targetY !== undefined ? targetY - defaultHeight / 2 : (state.doc.originalHeight - defaultHeight) / 2;

        const stampInst = {
            id: state.nextStampId++,
            pageNum: state.doc.currentPage,
            imgObj: img,
            url: stampData.url,
            x, y,
            width: defaultWidth,
            height: defaultHeight,
            rotation: 0,
            opacity: 1.0,
            blendMode: 'multiply'
        };

        if (!state.placedStamps[state.doc.currentPage]) {
            state.placedStamps[state.doc.currentPage] = [];
        }
        state.placedStamps[state.doc.currentPage].push(stampInst);
        
        renderStampsForCurrentPage();
        selectStamp(stampInst.id);
    };
}

function renderStampsForCurrentPage() {
    dom.stampLayer.innerHTML = '';
    const currentList = state.placedStamps[state.doc.currentPage] || [];

    currentList.forEach(stamp => {
        const el = document.createElement('div');
        el.className = `placed-stamp ${stamp.id === state.selectedStampId ? 'selected' : ''}`;
        el.style.left = stamp.x + 'px';
        el.style.top = stamp.y + 'px';
        el.style.width = stamp.width + 'px';
        el.style.height = stamp.height + 'px';
        el.style.transform = `rotate(${stamp.rotation}deg)`;
        el.style.opacity = stamp.opacity;
        el.style.mixBlendMode = stamp.blendMode;

        el.innerHTML = `<img src="${stamp.url}">`;

        if (stamp.id === state.selectedStampId) {
            const rotateHandle = document.createElement('div');
            rotateHandle.className = 'stamp-handle-rotate';
            rotateHandle.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
            bindRotateEvent(rotateHandle, stamp);
            el.appendChild(rotateHandle);

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'stamp-handle-resize';
            bindResizeEvent(resizeHandle, stamp);
            el.appendChild(resizeHandle);
        }

        bindStampMoveEvent(el, stamp);
        dom.stampLayer.appendChild(el);
    });
}

function bindStampMoveEvent(el, stamp) {
    const startMove = (e) => {
        e.stopPropagation();
        selectStamp(stamp.id);

        const coords = getEventCoords(e);
        let startX = coords.clientX, startY = coords.clientY;

        const onMove = (moveEvent) => {
            const currentCoords = getEventCoords(moveEvent);
            stamp.x += (currentCoords.clientX - startX) / state.zoom;
            stamp.y += (currentCoords.clientY - startY) / state.zoom;
            startX = currentCoords.clientX; startY = currentCoords.clientY;
            renderStampsForCurrentPage();
        };

        const onEnd = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
    };

    el.addEventListener('mousedown', startMove);
    el.addEventListener('touchstart', startMove, { passive: true });
}

function bindRotateEvent(handleEl, stamp) {
    const startRotate = (e) => {
        e.stopPropagation();
        const rect = dom.stampLayer.getBoundingClientRect();
        const cx = rect.left + (stamp.x + stamp.width / 2) * state.zoom;
        const cy = rect.top + (stamp.y + stamp.height / 2) * state.zoom;

        const onMove = (moveEvent) => {
            const coords = getEventCoords(moveEvent);
            let angle = Math.round(Math.atan2(coords.clientY - cy, coords.clientX - cx) * (180 / Math.PI)) + 90;
            if (angle > 180) angle -= 360;
            stamp.rotation = angle;
            updatePropUI();
            renderStampsForCurrentPage();
        };

        const onEnd = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
    };

    handleEl.addEventListener('mousedown', startRotate);
    handleEl.addEventListener('touchstart', startRotate, { passive: true });
}

function bindResizeEvent(handleEl, stamp) {
    const startResize = (e) => {
        e.stopPropagation();
        const coords = getEventCoords(e);
        let startX = coords.clientX;
        const ratio = stamp.width / stamp.height;

        const onMove = (moveEvent) => {
            const currentCoords = getEventCoords(moveEvent);
            const dx = (currentCoords.clientX - startX) / state.zoom;
            stamp.width = Math.max(30, stamp.width + dx);
            stamp.height = stamp.width / ratio;
            startX = currentCoords.clientX;
            updatePropUI();
            renderStampsForCurrentPage();
        };

        const onEnd = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
    };

    handleEl.addEventListener('mousedown', startResize);
    handleEl.addEventListener('touchstart', startResize, { passive: true });
}

function selectStamp(id) {
    state.selectedStampId = id;
    renderStampsForCurrentPage();
    updatePropUI();
}

function deselectStamp() {
    state.selectedStampId = null;
    renderStampsForCurrentPage();
    updatePropUI();
}

function updateSelectedStamp(props) {
    if (!state.selectedStampId) return;
    const list = state.placedStamps[state.doc.currentPage] || [];
    const stamp = list.find(s => s.id === state.selectedStampId);
    if (stamp) {
        Object.assign(stamp, props);
        renderStampsForCurrentPage();
        updatePropUI();
    }
}

function deleteSelectedStamp() {
    if (!state.selectedStampId) return;
    let list = state.placedStamps[state.doc.currentPage] || [];
    state.placedStamps[state.doc.currentPage] = list.filter(s => s.id !== state.selectedStampId);
    deselectStamp();
}

function adjustRotation(delta) {
    const list = state.placedStamps[state.doc.currentPage] || [];
    const stamp = list.find(s => s.id === state.selectedStampId);
    if (stamp) updateSelectedStamp({ rotation: (stamp.rotation + delta) % 360 });
}

function updatePropUI() {
    const list = state.placedStamps[state.doc.currentPage] || [];
    const stamp = list.find(s => s.id === state.selectedStampId);

    if (!stamp) {
        dom.propEmptyTip.style.display = 'block';
        dom.propControls.style.display = 'none';
        return;
    }

    dom.propEmptyTip.style.display = 'none';
    dom.propControls.style.display = 'block';
    
    const baseW = state.doc.originalWidth * 0.18;
    dom.propScale.value = Math.round((stamp.width / baseW) * 100);
    dom.propScaleVal.textContent = dom.propScale.value + '%';
    dom.propRotate.value = stamp.rotation;
    dom.propRotateVal.textContent = stamp.rotation + '°';
    dom.propOpacity.value = Math.round(stamp.opacity * 100);
    dom.propOpacityVal.textContent = dom.propOpacity.value + '%';
    dom.propBlend.value = stamp.blendMode;
}

// --- 缩放与视图 ---
function setZoom(newZoom) {
    state.zoom = Math.min(Math.max(0.2, newZoom), 4.0);
    dom.zoomLevelText.textContent = `${Math.round(state.zoom * 100)}%`;
    applyTransform();
}

function applyTransform() {
    dom.canvasStage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

function resetViewFit() {
    if (!state.doc.originalWidth) return;
    const vpW = dom.viewport.clientWidth - 20;
    const vpH = dom.viewport.clientHeight - 20;
    state.zoom = Math.min(vpW / state.doc.originalWidth, vpH / state.doc.originalHeight, 1.0);
    state.panX = 0; state.panY = 0;
    dom.zoomLevelText.textContent = `${Math.round(state.zoom * 100)}%`;
    applyTransform();
}

// --- 1:1 高保真导出 ---
async function exportDocument(format) {
    if (!state.doc.file) return;
    if (format === 'pdf') await exportAsPDF();
    else await exportAsImage(format);
}

async function renderHighResPageCanvas(pageNum) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = state.doc.originalWidth;
    offCanvas.height = state.doc.originalHeight;
    const ctx = offCanvas.getContext('2d');

    if (state.doc.type === 'image') {
        const img = new Image();
        img.src = URL.createObjectURL(state.doc.file);
        await new Promise(r => img.onload = r);
        ctx.drawImage(img, 0, 0);
    } else if (state.doc.type === 'pdf') {
        const page = await state.doc.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        await page.render({ canvasContext: ctx, viewport }).promise;
    }

    const stamps = state.placedStamps[pageNum] || [];
    for (let stamp of stamps) {
        ctx.save();
        ctx.globalAlpha = stamp.opacity;
        ctx.globalCompositeOperation = stamp.blendMode;

        const cx = stamp.x + stamp.width / 2;
        const cy = stamp.y + stamp.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((stamp.rotation * Math.PI) / 180);

        ctx.drawImage(stamp.imgObj, -stamp.width / 2, -stamp.height / 2, stamp.width, stamp.height);
        ctx.restore();
    }

    return offCanvas;
}

async function exportAsImage(format) {
    const canvas = await renderHighResPageCanvas(state.doc.currentPage);
    const link = document.createElement('a');
    link.download = `盖章文档_第${state.doc.currentPage}页.${format}`;
    link.href = canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.95);
    link.click();
}

async function exportAsPDF() {
    const { jsPDF } = window.jspdf;
    let pdfDoc = null;

    for (let i = 1; i <= state.doc.totalPages; i++) {
        const canvas = await renderHighResPageCanvas(i);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const orient = canvas.width > canvas.height ? 'l' : 'p';
        
        if (i === 1) {
            pdfDoc = new jsPDF({ orientation: orient, unit: 'px', format: [canvas.width, canvas.height] });
        } else {
            pdfDoc.addPage([canvas.width, canvas.height], orient);
        }

        pdfDoc.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
    }

    pdfDoc.save('盖章文档_高清.pdf');
}