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

// 显示 Toast 顶部通知
function showToast(message) {
    const toast = document.getElementById('toast-message');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// --- 夜间模式切换 ---
const THEME_STORAGE_KEY = 'stampmaster-theme';
const ONBOARD_STORAGE_KEY = 'stampmaster-onboard';

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function updateThemeButtonIcon() {
    const isDark = currentTheme() === 'dark';
    if (!dom.btnToggleTheme) return;
    dom.btnToggleTheme.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    dom.btnToggleTheme.title = isDark ? '切换到日间模式' : '切换到夜间模式';
}

function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (e) {}
    updateThemeButtonIcon();
    showToast(next === 'dark' ? '已开启夜间模式 🌙' : '已切换为日间模式 ☀️');
}

// --- 开屏使用说明弹窗 ---
function shouldShowOnboard() {
    try { return localStorage.getItem(ONBOARD_STORAGE_KEY) !== '1'; } catch (e) { return true; }
}

function showOnboard() {
    dom.onboardOverlay.classList.add('show');
}

function hideOnboard() {
    dom.onboardOverlay.classList.remove('show');
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
    nextStampId: 1,
    selectedExportFormat: 'pdf'
};

// 触摸双指捏合缩放状态追踪
const touchZoomState = {
    isPinching: false,
    initialDist: 0,
    initialZoom: 1.0
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
    
    // 弹窗与控制
    sidebarLeft: document.getElementById('sidebar-left'),
    sidebarRight: document.getElementById('sidebar-right'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    btnToggleLeftSidebar: document.getElementById('btn-toggle-left-sidebar'),
    btnToggleRightSidebar: document.getElementById('btn-toggle-right-sidebar'),

    // 导出弹窗与自定义文件名
    modalExportFormat: document.getElementById('modal-export-format'),
    btnOpenExportModal: document.getElementById('btn-open-export-modal'),
    btnConfirmExport: document.getElementById('btn-confirm-export'),
    inputCustomFilename: document.getElementById('input-custom-filename'),

    fileInputDoc: document.getElementById('file-input-doc'),
    stampCategories: document.getElementById('stamp-categories'),
    stampSearch: document.getElementById('stamp-search'),
    btnToggleAllFolders: document.getElementById('btn-toggle-all-folders'),
    btnChangeDir: document.getElementById('btn-change-dir'),
    folderInputFallback: document.getElementById('folder-input-fallback'),
    
    btnAddTempStamp: document.getElementById('btn-add-temp-stamp'),
    inputTempStamp: document.getElementById('input-temp-stamp'),

    btnResetDoc: document.getElementById('btn-reset-doc'),
    btnClearStamps: document.getElementById('btn-clear-stamps'),

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
    btnRot90: document.getElementById('btn-rot-90'),

    // 夜间模式 & 开屏说明
    btnToggleTheme: document.getElementById('btn-toggle-theme'),
    btnHelp: document.getElementById('btn-help'),
    onboardOverlay: document.getElementById('onboard-overlay'),
    onboardDontAgain: document.getElementById('onboard-dont-again'),
    btnOnboardStart: document.getElementById('btn-onboard-start')
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
                closeModals(); // 选择印章后自动关闭小弹窗
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

// 弹窗与控制
function openLeftModal() {
  dom.sidebarLeft.classList.add('show');
    dom.modalBackdrop.classList.add('show');
}
function openRightModal() {
    dom.sidebarRight.classList.add('show');
    dom.modalBackdrop.classList.add('show');
}
function openExportModal() {
    // 预填推荐的提示占位符
    if (dom.inputCustomFilename) {
        dom.inputCustomFilename.placeholder = `请输入导出文件名，默认使用原文件名`;
    }
    dom.modalExportFormat.classList.add('show');
    dom.modalBackdrop.classList.add('show');
}
function closeModals() {
    dom.sidebarLeft.classList.remove('show');
    dom.sidebarRight.classList.remove('show');
    if (dom.modalExportFormat) dom.modalExportFormat.classList.remove('show');
    dom.modalBackdrop.classList.remove('show');
}

// 重置清空画布文档（换一张）
function resetDocument() {
    state.doc = {
        file: null, type: null, pdfDoc: null,
        currentPage: 1, totalPages: 1,
        originalWidth: 0, originalHeight: 0
    };
    state.placedStamps = {};
    deselectStamp();

    const ctx = dom.docCanvas.getContext('2d');
    ctx.clearRect(0, 0, dom.docCanvas.width, dom.docCanvas.height);
    dom.docCanvas.width = 0;
    dom.docCanvas.height = 0;
    dom.stampLayer.innerHTML = '';

    dom.pageControls.style.display = 'none';
    dom.dropZone.classList.remove('hidden');
    dom.fileInputDoc.value = '';
}

// 清除当前页面上的所有印章
function clearCurrentPageStamps() {
    state.placedStamps[state.doc.currentPage] = [];
    deselectStamp();
    renderStampsForCurrentPage();
}

// 默认推荐的基础文件名公式
function generateDefaultBaseFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    let rawFileName = '文档';
    if (state.doc.file && state.doc.file.name) {
        rawFileName = state.doc.file.name.replace(/\.[^/.]+$/, "");
    }

    const usedStampNames = [];
    Object.values(state.placedStamps).forEach(pageStamps => {
        pageStamps.forEach(stamp => {
            if (stamp.name && !usedStampNames.includes(stamp.name)) {
                usedStampNames.push(stamp.name);
            }
        });
    });

    const stampsStr = usedStampNames.length > 0 ? usedStampNames.join('_') : '已盖章';
    return `${dateStr}_${rawFileName}_${stampsStr}`;
}

// 拼接最终导出的完整文件名
function generateExportFilename(extension) {
    const customName = dom.inputCustomFilename ? dom.inputCustomFilename.value.trim() : '';
    if (customName) {
        const sanitizedName = customName.replace(/\.[^/.]+$/, "");
        return `${sanitizedName}.${extension}`;
    }
    return `${generateDefaultBaseFilename()}.${extension}`;
}

// --- 事件绑定 ---
function initEvents() {
    dom.btnToggleLeftSidebar?.addEventListener('click', openLeftModal);
    dom.btnToggleRightSidebar?.addEventListener('click', openRightModal);
    
    // 导出前先检测画布是否有内容
    dom.btnOpenExportModal?.addEventListener('click', () => {
        if (!state.doc.file || !state.doc.originalWidth) {
            showToast('当前画布暂无内容，请先上传文档！');
            return;
        }
        openExportModal();
    });
    
    dom.modalBackdrop?.addEventListener('click', closeModals);
    document.querySelectorAll('.btn-close-modal, .btn-close-export-modal').forEach(btn => btn.addEventListener('click', closeModals));

    // 导出格式卡片选择
    document.querySelectorAll('.format-card').forEach(card => {
        card.addEventListener('click', (e) => {
            document.querySelectorAll('.format-card').forEach(c => c.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            state.selectedExportFormat = target.getAttribute('data-format');
        });
    });

    // 确认导出
    dom.btnConfirmExport.addEventListener('click', () => {
        exportDocument(state.selectedExportFormat);
        closeModals();
    });

    dom.btnChangeDir.addEventListener('click', selectAndSaveNewDirectory);

    // 单击中央卡片直接选择文档
    dom.btnTriggerDropZone.addEventListener('click', () => dom.fileInputDoc.click());

    // “换一张”与“清除印章”
    dom.btnResetDoc.addEventListener('click', resetDocument);
    dom.btnClearStamps.addEventListener('click', clearCurrentPageStamps);

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
            closeModals();
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

    // 画布平移与双指捏合（Pinch-to-Zoom）手势控制
    const handlePanOrPinchStart = (e) => {
        if (e.touches && e.touches.length === 2) {
            // 双指捏合手势开始
            state.isPanning = false;
            touchZoomState.isPinching = true;
            touchZoomState.initialDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchZoomState.initialZoom = state.zoom;
        } else if (e.target === dom.viewport || e.target === dom.docCanvas || e.target === dom.stampLayer) {
            // 单指/鼠标平移
            touchZoomState.isPinching = false;
            state.isPanning = true;
            const coords = getEventCoords(e);
            state.startPanX = coords.clientX - state.panX;
            state.startPanY = coords.clientY - state.panY;
            deselectStamp();
        }
    };

    const handlePanOrPinchMove = (e) => {
        if (touchZoomState.isPinching && e.touches && e.touches.length === 2) {
            // 双指捏合实时计算缩放倍率
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (touchZoomState.initialDist > 0) {
                const factor = currentDist / touchZoomState.initialDist;
                setZoom(touchZoomState.initialZoom * factor);
            }
        } else if (state.isPanning) {
            // 单指/鼠标平移
            const coords = getEventCoords(e);
            state.panX = coords.clientX - state.startPanX;
            state.panY = coords.clientY - state.startPanY;
            applyTransform();
        }
    };

    const handlePanOrPinchEnd = (e) => {
        if (e.touches && e.touches.length < 2) {
            touchZoomState.isPinching = false;
        }
        if (!e.touches || e.touches.length === 0) {
            state.isPanning = false;
        }
    };

    dom.viewport.addEventListener('mousedown', handlePanOrPinchStart);
    window.addEventListener('mousemove', handlePanOrPinchMove);
    window.addEventListener('mouseup', handlePanOrPinchEnd);

    dom.viewport.addEventListener('touchstart', handlePanOrPinchStart, { passive: true });
    window.addEventListener('touchmove', handlePanOrPinchMove, { passive: true });
    window.addEventListener('touchend', handlePanOrPinchEnd);

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

    // 夜间模式切换按钮
    dom.btnToggleTheme?.addEventListener('click', toggleTheme);
    updateThemeButtonIcon();

    // 开屏使用说明弹窗
    dom.btnHelp?.addEventListener('click', showOnboard);
    dom.btnOnboardStart?.addEventListener('click', () => {
        if (dom.onboardDontAgain.checked) {
            try { localStorage.setItem(ONBOARD_STORAGE_KEY, '1'); } catch (e) {}
        }
        hideOnboard();
    });

    // 点击遮罩空白处关闭开屏弹窗
    dom.onboardOverlay?.addEventListener('click', (e) => {
        if (e.target === dom.onboardOverlay) hideOnboard();
    });

    // 首次进入且未勾选“不再提醒”时，延时弹出使用说明
    if (shouldShowOnboard()) {
        setTimeout(showOnboard, 600);
    }
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
            name: stampData.name || '印章',
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

// 就地给印章元素添加选中样式与旋转/缩放手柄（手势中不重建整层 DOM，
// 避免手指按住时触摸目标被移除，导致移动端手势被 touchcancel 中断）
function addSelectionHandles(el, stamp) {
    if (!el.classList.contains('selected')) el.classList.add('selected');
    if (!el.querySelector('.stamp-handle-rotate')) {
        const rh = document.createElement('div');
        rh.className = 'stamp-handle-rotate';
        rh.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
        bindRotateEvent(rh, stamp);
        el.appendChild(rh);
    }
    if (!el.querySelector('.stamp-handle-resize')) {
        const rsh = document.createElement('div');
        rsh.className = 'stamp-handle-resize';
        bindResizeEvent(rsh, stamp);
        el.appendChild(rsh);
    }
}

function bindStampMoveEvent(el, stamp) {
    const startMove = (e) => {
        e.stopPropagation();
        const coords = getEventCoords(e);
        const startX = coords.clientX, startY = coords.clientY;
        const origX = stamp.x, origY = stamp.y;

        // 选中印章但只就地更新视觉，不重建整层 DOM
        if (state.selectedStampId !== stamp.id) {
            state.selectedStampId = stamp.id;
            addSelectionHandles(el, stamp);
            updatePropUI();
        }

        const onMove = (moveEvent) => {
            const c = getEventCoords(moveEvent);
            stamp.x = origX + (c.clientX - startX) / state.zoom;
            stamp.y = origY + (c.clientY - startY) / state.zoom;
            el.style.left = stamp.x + 'px';
            el.style.top = stamp.y + 'px';
        };

        const onEnd = () => {
            cleanup();
            renderStampsForCurrentPage();
            updatePropUI();
        };
        const cleanup = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
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
        const el = handleEl.closest('.placed-stamp');

        const onMove = (moveEvent) => {
            const coords = getEventCoords(moveEvent);
            let angle = Math.round(Math.atan2(coords.clientY - cy, coords.clientX - cx) * (180 / Math.PI)) + 90;
            if (angle > 180) angle -= 360;
            stamp.rotation = angle;
            if (el) el.style.transform = `rotate(${angle}deg)`;
            updatePropUI();
        };

        const onEnd = () => {
            cleanup();
            renderStampsForCurrentPage();
            updatePropUI();
        };
        const cleanup = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
    };

    handleEl.addEventListener('mousedown', startRotate);
    handleEl.addEventListener('touchstart', startRotate, { passive: true });
}

function bindResizeEvent(handleEl, stamp) {
    const startResize = (e) => {
        e.stopPropagation();
        const coords = getEventCoords(e);
        const startX = coords.clientX;
        const ratio = stamp.width / stamp.height;
        const origWidth = stamp.width;
        const el = handleEl.closest('.placed-stamp');

        const onMove = (moveEvent) => {
            const c = getEventCoords(moveEvent);
            const dx = (c.clientX - startX) / state.zoom;
            stamp.width = Math.max(30, origWidth + dx);
            stamp.height = stamp.width / ratio;
            if (el) {
                el.style.width = stamp.width + 'px';
                el.style.height = stamp.height + 'px';
            }
            updatePropUI();
        };

        const onEnd = () => {
            cleanup();
            renderStampsForCurrentPage();
            updatePropUI();
        };
        const cleanup = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
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
    const filename = generateExportFilename(format);
    const link = document.createElement('a');
    link.download = filename;
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

    const filename = generateExportFilename('pdf');
    pdfDoc.save(filename);
}