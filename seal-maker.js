/**
 * SealMaker - 印章制作引擎（融合版）
 * 挂载 window.SealMaker，纯绘制 + 驱动右侧 sidebar 表单渲染
 */
(function () {
    const SM = {};
    window.SealMaker = SM;

    // ========= 状态 =========
    SM.state = {
        color: '#b81919',
        outerRadius: 304,
        borderWidth: 15,

        topText: '龙国遥遥领先有限公司',
        topFontFamily: "SimSun, 'Songti SC', 'STSong', serif",
        topFontSize: 60,
        topSpanAngle: 215,
        topRadius: 231,
        topScaleX: 1.05,
        topScaleY: 1.65,
        topFontWeight: 'bold',

        centerPattern: 'star',
        starRadius: 117,
        starOffsetY: -15,

        middleText: '领先司令部',
        middleFontSize: 48,
        middleSpacing: 9,
        middleOffsetY: 152,
        midScaleY: 1.1,

        bottomText: '666666666666',
        bottomFontSize: 29,
        bottomRadius: 275,
        bottomSpanAngle: 79,

        agingNoise: 0,
        agingCuts: 9,
        agingCutMode: 'uniform',
        agingCutAngle: 22,
        agingCutWidth: 3,
        inkBleed: 3
    };

    SM.currentPart = 'aging';
    let agingSeed = 123456;
    let hoveredPart = null;
    let smCanvas, smCtx, formBody;

    // ========= 部件 Schema =========
    const partSchemas = {
        border: {
            title: '基本与边框',
            fields: [
                { key: 'color', label: '印泥颜色', type: 'color' },
                { key: 'outerRadius', label: '外圈半径', type: 'dual', min: 150, max: 340, step: 1 },
                { key: 'borderWidth', label: '边框线宽', type: 'dual', min: 2, max: 35, step: 1 }
            ]
        },
        topText: {
            title: '上弧文字（公司名称）',
            fields: [
                { key: 'topText', label: '文字内容', type: 'text' },
                { key: 'topFontFamily', label: '字体', type: 'select', options: [
                    { label: '宋体 (推荐标准)', value: "SimSun, 'Songti SC', 'STSong', serif" },
                    { label: '仿宋', value: "'FangSong', 'STFangsong', serif" },
                    { label: '黑体', value: "'SimHei', 'Heiti SC', sans-serif" },
                    { label: '楷体', value: "'KaiTi', 'STKaiti', serif" }
                ]},
                { key: 'topFontSize', label: '字号', type: 'dual', min: 20, max: 80, step: 1 },
                { key: 'topSpanAngle', label: '跨度角度 (°)', type: 'dual', min: 60, max: 300, step: 1 },
                { key: 'topRadius', label: '排布半径', type: 'dual', min: 140, max: 320, step: 1 },
                { key: 'topScaleX', label: '字宽缩放', type: 'dual', min: 0.5, max: 2.0, step: 0.05 },
                { key: 'topScaleY', label: '字高缩放', type: 'dual', min: 0.5, max: 2.5, step: 0.05 },
                { key: 'topFontWeight', label: '文字粗细', type: 'select', options: [
                    { label: '粗体', value: 'bold' },
                    { label: '特粗 900', value: '900' },
                    { label: '标准', value: 'normal' }
                ]}
            ]
        },
        center: {
            title: '中心图案',
            fields: [
                { key: 'centerPattern', label: '图案类型', type: 'select', options: [
                    { label: '五角星', value: 'star' },
                    { label: '无图案', value: 'none' }
                ]},
                { key: 'starRadius', label: '图案外径', type: 'dual', min: 20, max: 180, step: 1 },
                { key: 'starOffsetY', label: '垂直偏移 Y', type: 'dual', min: -100, max: 100, step: 1 }
            ]
        },
        middleText: {
            title: '横排说明文字',
            fields: [
                { key: 'middleText', label: '文字内容', type: 'text' },
                { key: 'middleFontSize', label: '字号', type: 'dual', min: 16, max: 72, step: 1 },
                { key: 'middleSpacing', label: '字间距', type: 'dual', min: 0, max: 40, step: 1 },
                { key: 'middleOffsetY', label: '垂直偏移 Y', type: 'dual', min: 20, max: 220, step: 1 },
                { key: 'midScaleY', label: '字高缩放', type: 'dual', min: 0.5, max: 2.0, step: 0.05 }
            ]
        },
        bottomText: {
            title: '底部防伪码',
            fields: [
                { key: 'bottomText', label: '编号内容', type: 'text' },
                { key: 'bottomFontSize', label: '字号', type: 'dual', min: 12, max: 48, step: 1 },
                { key: 'bottomRadius', label: '弧形半径', type: 'dual', min: 150, max: 320, step: 1 },
                { key: 'bottomSpanAngle', label: '跨度角度 (°)', type: 'dual', min: 30, max: 180, step: 1 }
            ]
        },
        aging: {
            title: '做旧质感',
            fields: [
                { key: 'agingNoise', label: '斑驳噪点强度 (%)', type: 'dual', min: 0, max: 100, step: 1 },
                { key: 'agingCuts', label: '外圈缺口数', type: 'dual', min: 0, max: 20, step: 1 },
                { key: 'agingCutMode', label: '缺口分布', type: 'select', options: [
                    { label: '均匀分布', value: 'uniform' },
                    { label: '随机分布', value: 'random' }
                ]},
                { key: 'agingCutAngle', label: '均匀分布起始角 (°)', type: 'dual', min: 0, max: 360, step: 1 },
                { key: 'agingCutWidth', label: '缺口缝隙宽度', type: 'dual', min: 1, max: 10, step: 0.5 },
                { key: 'inkBleed', label: '边缘浸润/毛边', type: 'dual', min: 0, max: 8, step: 0.5 }
            ]
        }
    };

    // ========= Canvas 绘制 =========
    function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
        let rot = Math.PI / 2 * 3, x, y;
        const step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;
            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fill();
    }

    function applyWeatheringEffect(ctx, cx, cy) {
        const s = SM.state;
        const intensity = s.agingNoise / 100;
        if (intensity <= 0 && s.agingCuts <= 0) return;

        let seed = agingSeed;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';

        if (s.agingCuts > 0) {
            const isUniform = s.agingCutMode === 'uniform';
            const baseRot = (s.agingCutAngle || 0) * Math.PI / 180;
            const cutLen = s.borderWidth * 2.5;
            for (let i = 0; i < s.agingCuts; i++) {
                const angle = isUniform
                    ? baseRot + (i * 2 * Math.PI / s.agingCuts)
                    : rnd() * Math.PI * 2;
                const cutX = cx + Math.cos(angle) * s.outerRadius;
                const cutY = cy + Math.sin(angle) * s.outerRadius;
                ctx.save();
                ctx.translate(cutX, cutY);
                ctx.rotate(angle);
                if (!isUniform) ctx.rotate((rnd() - 0.5) * 0.3);
                ctx.fillStyle = 'rgba(0,0,0,1)';
                ctx.fillRect(-cutLen / 2, -s.agingCutWidth / 2, cutLen, s.agingCutWidth);
                ctx.restore();
            }
        }

        if (intensity > 0) {
            const poresCount = Math.floor(18000 * intensity);
            for (let i = 0; i < poresCount; i++) {
                const r = Math.sqrt(rnd()) * (s.outerRadius + s.borderWidth);
                const theta = rnd() * Math.PI * 2;
                ctx.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.8})`;
                ctx.beginPath();
                ctx.arc(cx + r * Math.cos(theta), cy + r * Math.sin(theta), 0.5 + rnd() * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    function drawActiveIndicator(ctx, cx, cy) {
        const target = hoveredPart || SM.currentPart;
        if (!target) return;
        ctx.save();
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = 2;
        if (target === 'border' || target === 'aging') {
            ctx.beginPath();
            ctx.arc(cx, cy, SM.state.outerRadius + SM.state.borderWidth / 2 + 5, 0, Math.PI * 2);
            ctx.stroke();
        } else if (target === 'center') {
            ctx.beginPath();
            ctx.arc(cx, cy + SM.state.starOffsetY, SM.state.starRadius + 8, 0, Math.PI * 2);
            ctx.stroke();
        } else if (target === 'middleText') {
            const m = SM.state;
            const midLen = m.middleText.length;
            const totalW = (midLen - 1) * (m.middleFontSize + m.middleSpacing) + m.middleFontSize * 1.4;
            const totalH = m.middleFontSize * m.midScaleY * 1.3;
            ctx.strokeRect(cx - totalW / 2, cy + m.middleOffsetY - totalH / 2, totalW, totalH);
        } else if (target === 'topText') {
            ctx.beginPath();
            const span = SM.state.topSpanAngle * Math.PI / 180;
            ctx.arc(cx, cy, SM.state.topRadius, -Math.PI / 2 - span / 2, -Math.PI / 2 + span / 2);
            ctx.stroke();
        } else if (target === 'bottomText') {
            ctx.beginPath();
            const span = SM.state.bottomSpanAngle * Math.PI / 180;
            ctx.arc(cx, cy, SM.state.bottomRadius, Math.PI / 2 - span / 2, Math.PI / 2 + span / 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    SM.renderSeal = function () {
        if (!smCtx || !smCanvas) return;
        const w = smCanvas.width, h = smCanvas.height;
        const cx = w / 2, cy = h / 2;
        const s = SM.state;

        smCtx.clearRect(0, 0, w, h);
        smCtx.fillStyle = s.color;
        smCtx.strokeStyle = s.color;
        smCtx.shadowColor = s.color;
        smCtx.shadowBlur = s.inkBleed;

        smCtx.lineWidth = s.borderWidth;
        smCtx.beginPath();
        smCtx.arc(cx, cy, s.outerRadius, 0, Math.PI * 2);
        smCtx.stroke();

        if (s.centerPattern === 'star') {
            drawStar(smCtx, cx, cy + s.starOffsetY, 5, s.starRadius, s.starRadius * 0.382);
        }

        // 上弧文字
        smCtx.font = `${s.topFontWeight} ${s.topFontSize}px ${s.topFontFamily}`;
        smCtx.textAlign = 'center';
        smCtx.textBaseline = 'middle';
        const topLen = s.topText.length;
        if (topLen > 0) {
            const spanRad = s.topSpanAngle * Math.PI / 180;
            const step = topLen > 1 ? spanRad / (topLen - 1) : 0;
            const startAngle = -Math.PI / 2 - spanRad / 2;
            for (let i = 0; i < topLen; i++) {
                const angle = startAngle + i * step;
                smCtx.save();
                smCtx.translate(cx, cy);
                smCtx.rotate(angle + Math.PI / 2);
                smCtx.translate(0, -s.topRadius);
                smCtx.scale(s.topScaleX, s.topScaleY);
                smCtx.fillText(s.topText[i], 0, 0);
                smCtx.restore();
            }
        }

        // 中间横排
        const midLen = s.middleText.length;
        if (midLen > 0) {
            smCtx.save();
            smCtx.font = `bold ${s.middleFontSize}px ${s.topFontFamily}`;
            smCtx.textAlign = 'center';
            smCtx.textBaseline = 'middle';
            const totalW = (midLen - 1) * (s.middleFontSize + s.middleSpacing);
            const startX = cx - totalW / 2;
            for (let i = 0; i < midLen; i++) {
                smCtx.save();
                smCtx.translate(startX + i * (s.middleFontSize + s.middleSpacing), cy + s.middleOffsetY);
                smCtx.scale(1.0, s.midScaleY);
                smCtx.fillText(s.middleText[i], 0, 0);
                smCtx.restore();
            }
            smCtx.restore();
        }

        // 底部防伪码
        const btmLen = s.bottomText.length;
        if (btmLen > 0) {
            smCtx.save();
            smCtx.font = `bold ${s.bottomFontSize}px Arial, Helvetica, sans-serif`;
            smCtx.textAlign = 'center';
            smCtx.textBaseline = 'middle';
            const btmSpanRad = s.bottomSpanAngle * Math.PI / 180;
            const btmStep = btmLen > 1 ? btmSpanRad / (btmLen - 1) : 0;
            const startAngle = Math.PI / 2 - btmSpanRad / 2;
            for (let i = 0; i < btmLen; i++) {
                const angle = startAngle + i * btmStep;
                smCtx.save();
                smCtx.translate(cx, cy);
                smCtx.rotate(angle - Math.PI / 2);
                smCtx.translate(0, s.bottomRadius);
                smCtx.fillText(s.bottomText[i], 0, 0);
                smCtx.restore();
            }
            smCtx.restore();
        }

        smCtx.shadowBlur = 0;
        applyWeatheringEffect(smCtx, cx, cy);
        drawActiveIndicator(smCtx, cx, cy);
    };

    // ========= 几何命中（点画布上哪个部位） =========
    SM.hitTest = function (x, y) {
        const cx = smCanvas.width / 2, cy = smCanvas.height / 2;
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const s = SM.state;

        const midY = cy + s.middleOffsetY;
        const midLen = s.middleText.length;
        const midHalfW = ((midLen - 1) * (s.middleFontSize + s.middleSpacing) + s.middleFontSize) / 2 + 10;
        const midHalfH = (s.middleFontSize * s.midScaleY) / 2 + 10;
        if (Math.abs(x - cx) <= midHalfW && Math.abs(y - midY) <= midHalfH) return 'middleText';

        if (Math.hypot(dx, dy - s.starOffsetY) <= s.starRadius * 1.1) return 'center';

        const btmSpan = (s.bottomSpanAngle * Math.PI / 180) / 2;
        if (Math.abs(dist - s.bottomRadius) <= s.bottomFontSize * 1.2 &&
            Math.abs(angle - Math.PI / 2) <= btmSpan + 0.1) return 'bottomText';

        const topSpan = (s.topSpanAngle * Math.PI / 180) / 2;
        if (Math.abs(dist - s.topRadius) <= (s.topFontSize * s.topScaleY) * 0.9 &&
            Math.abs(angle + Math.PI / 2) <= topSpan + 0.1) return 'topText';

        if (Math.abs(dist - s.outerRadius) <= s.borderWidth + 12) return 'border';
        if (dist <= s.outerRadius) return 'aging';
        return null;
    };

    // ========= 右侧面板表单渲染（跟 app.js 配合） =========
    SM.buildForm = function (partKey) {
        SM.currentPart = partKey;
        document.querySelectorAll('.maker-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.part === partKey);
        });
        const schema = partSchemas[partKey];
        if (!schema || !formBody) return;

        formBody.innerHTML = '';
        schema.fields.forEach(f => {
            const item = document.createElement('div');
            item.className = 'maker-field';
            item.innerHTML = `<div class="maker-field-label">${f.label}</div>`;

            const state = SM.state;
            if (f.type === 'dual') {
                const v = state[f.key];
                item.innerHTML += `
                    <div class="maker-field-control">
                        <input type="range" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${v}" data-sm-key="${f.key}">
                        <input type="number" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${v}" data-sm-key="${f.key}" data-num>
                    </div>`;
            } else if (f.type === 'text') {
                item.innerHTML += `<input type="text" class="maker-text-input" value="${state[f.key]}" data-sm-key="${f.key}">`;
            } else if (f.type === 'color') {
                item.innerHTML += `
                    <div class="maker-color-row">
                        <input type="color" value="${state[f.key]}" data-sm-key="${f.key}">
                        <input type="text" class="maker-text-input maker-color-hex" value="${state[f.key]}" data-sm-key="${f.key}" data-hex>
                    </div>`;
            } else if (f.type === 'select') {
                const opts = f.options.map(o =>
                    `<option value="${o.value}" ${state[f.key] === o.value ? 'selected' : ''}>${o.label}</option>`
                ).join('');
                item.innerHTML += `<select class="glass-select" data-sm-key="${f.key}">${opts}</select>`;
            }
            formBody.appendChild(item);
        });

        // 事件绑定：滑块 ↔ 数字框联动
        // 从所有部件 schema 建 key→字段定义映射，用于 clamp 和默认值回退
        const keyDefMap = {};
        Object.values(partSchemas).forEach(schema => {
            schema.fields.forEach(fd => { keyDefMap[fd.key] = fd; });
        });

        formBody.querySelectorAll('[data-sm-key]').forEach(el => {
            const key = el.dataset.smKey;
            el.addEventListener('input', () => {
                let raw = el.value;
                let v;
                const def = keyDefMap[key];
                if (el.type === 'number' || el.type === 'range') {
                    v = parseFloat(raw);
                    if (isNaN(v)) { v = def ? SM.state[key] : 0; }
                    // clamp 到 min/max
                    if (def) {
                        if (def.min !== undefined) v = Math.max(def.min, v);
                        if (def.max !== undefined) v = Math.min(def.max, v);
                    }
                } else {
                    v = raw;
                }
                SM.state[key] = v;
                // 双向同步
                formBody.querySelectorAll(`[data-sm-key="${key}"]`).forEach(syncEl => {
                    if (syncEl !== el) {
                        // 同步 range 时也要 clamp
                        if (syncEl.type === 'range' && def) {
                            const clamped = Math.max(def.min, Math.min(def.max, v));
                            syncEl.value = clamped;
                        } else {
                            syncEl.value = v;
                        }
                    }
                });
                SM.renderSeal();
            });
        });
    };

    // ========= 导出 =========
    SM.exportPNG = function () {
        const prevPart = SM.currentPart, prevHover = hoveredPart;
        SM.currentPart = null; hoveredPart = null;
        SM.renderSeal();
        const dataUrl = smCanvas.toDataURL('image/png');
        const name = (SM.state.topText || '标准印章').replace(/[\\/:*?"<>|]/g, '_');
        const link = document.createElement('a');
        link.download = `标准印章_${name}_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        SM.currentPart = prevPart; hoveredPart = prevHover;
        SM.renderSeal();
        return { name, dataUrl };
    };

    SM.randomizeAging = function () {
        agingSeed = Math.random() * 999999;
        SM.renderSeal();
    };

    // ========= 印章库持久化：参数快照 API =========

    // 导出当前印章参数 JSON
    SM.snapshot = function () {
        return JSON.parse(JSON.stringify(SM.state));
    };

    // 从参数 JSON 恢复（刷新画布 + 右侧面板表单）
    SM.loadFromSnapshot = function (params) {
        Object.assign(SM.state, params);
        SM.renderSeal();
        if (formBody) SM.buildForm(SM.currentPart || 'aging');
    };

    // 关键：在离屏 Canvas 上独立绘制并返回 dataURL
    // 盖章时调用这个，不依赖 DOM 中的 seal-canvas
    SM.renderToDataURL = function (params, size = 700) {
        // 临时替换 state 为传入的参数
        const prev = SM.snapshot();
        if (params) Object.assign(SM.state, params);

        const off = document.createElement('canvas');
        off.width = size; off.height = size;
        const offCtx = off.getContext('2d');

        // 把所有绘制函数里用到 ctx 的都换成 offCtx
        const cx = size / 2, cy = size / 2;
        const s = SM.state;

        offCtx.clearRect(0, 0, size, size);
        offCtx.fillStyle = s.color;
        offCtx.strokeStyle = s.color;
        offCtx.shadowColor = s.color;
        offCtx.shadowBlur = s.inkBleed;

        offCtx.lineWidth = s.borderWidth;
        offCtx.beginPath();
        offCtx.arc(cx, cy, s.outerRadius, 0, Math.PI * 2);
        offCtx.stroke();

        if (s.centerPattern === 'star') {
            drawStar(offCtx, cx, cy + s.starOffsetY, 5, s.starRadius, s.starRadius * 0.382);
        }

        // 上弧
        offCtx.font = `${s.topFontWeight} ${s.topFontSize}px ${s.topFontFamily}`;
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        const topLen = s.topText.length;
        if (topLen > 0) {
            const spanRad = s.topSpanAngle * Math.PI / 180;
            const step = topLen > 1 ? spanRad / (topLen - 1) : 0;
            const startAngle = -Math.PI / 2 - spanRad / 2;
            for (let i = 0; i < topLen; i++) {
                const angle = startAngle + i * step;
                offCtx.save();
                offCtx.translate(cx, cy);
                offCtx.rotate(angle + Math.PI / 2);
                offCtx.translate(0, -s.topRadius);
                offCtx.scale(s.topScaleX, s.topScaleY);
                offCtx.fillText(s.topText[i], 0, 0);
                offCtx.restore();
            }
        }

        // 中间横排
        const midLen = s.middleText.length;
        if (midLen > 0) {
            offCtx.save();
            offCtx.font = `bold ${s.middleFontSize}px ${s.topFontFamily}`;
            offCtx.textAlign = 'center';
            offCtx.textBaseline = 'middle';
            const totalW = (midLen - 1) * (s.middleFontSize + s.middleSpacing);
            const startX = cx - totalW / 2;
            for (let i = 0; i < midLen; i++) {
                offCtx.save();
                offCtx.translate(startX + i * (s.middleFontSize + s.middleSpacing), cy + s.middleOffsetY);
                offCtx.scale(1.0, s.midScaleY);
                offCtx.fillText(s.middleText[i], 0, 0);
                offCtx.restore();
            }
            offCtx.restore();
        }

        // 底部防伪码
        const btmLen = s.bottomText.length;
        if (btmLen > 0) {
            offCtx.save();
            offCtx.font = `bold ${s.bottomFontSize}px Arial, Helvetica, sans-serif`;
            offCtx.textAlign = 'center';
            offCtx.textBaseline = 'middle';
            const btmSpanRad = s.bottomSpanAngle * Math.PI / 180;
            const btmStep = btmLen > 1 ? btmSpanRad / (btmLen - 1) : 0;
            const startAngle = Math.PI / 2 - btmSpanRad / 2;
            for (let i = 0; i < btmLen; i++) {
                const angle = startAngle + i * btmStep;
                offCtx.save();
                offCtx.translate(cx, cy);
                offCtx.rotate(angle - Math.PI / 2);
                offCtx.translate(0, s.bottomRadius);
                offCtx.fillText(s.bottomText[i], 0, 0);
                offCtx.restore();
            }
            offCtx.restore();
        }

        offCtx.shadowBlur = 0;
        // 做旧
        applyWeatheringEffect(offCtx, cx, cy);

        const dataUrl = off.toDataURL('image/png');

        // 恢复原 state
        Object.assign(SM.state, prev);
        return dataUrl;
    };

    // ========= 初始化 =========
    SM.init = function () {
        smCanvas = document.getElementById('seal-canvas');
        if (!smCanvas) return false;
        smCtx = smCanvas.getContext('2d');
        formBody = document.getElementById('maker-form-body');

        // 画布命中 → 切 tab + 渲染表单
        smCanvas.addEventListener('click', (e) => {
            const rect = smCanvas.getBoundingClientRect();
            const scaleX = smCanvas.width / rect.width;
            const scaleY = smCanvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            const part = SM.hitTest(x, y) || 'aging';
            SM.buildForm(part);
        });

        smCanvas.addEventListener('mousemove', (e) => {
            const rect = smCanvas.getBoundingClientRect();
            const scaleX = smCanvas.width / rect.width;
            const scaleY = smCanvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            const hit = SM.hitTest(x, y);
            if (hit !== hoveredPart) {
                hoveredPart = hit;
                smCanvas.style.cursor = hit ? 'pointer' : 'default';
                SM.renderSeal();
            }
        });
        smCanvas.addEventListener('mouseleave', () => { hoveredPart = null; SM.renderSeal(); });

        // 右侧 tab 切换
        document.querySelectorAll('.maker-tab').forEach(tab => {
            tab.addEventListener('click', () => SM.buildForm(tab.dataset.part));
        });

        // 初始 canvas 大小 700×700
        smCanvas.width = 700;
        smCanvas.height = 700;
        SM.buildForm('aging');
        SM.renderSeal();
        return true;
    };
})();
