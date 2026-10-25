import { state, saveFeedbackToStorage } from './state.js';
import { formatDate, maskEmail, escapeHtml, updateLabel, getVal } from './utils.js';
import { matchesTab } from './data.js';

// ===== Определение проекта по пулам записи =====
function deriveProjectFromPools(poolsStr) {
    if (!poolsStr) return null;
    const pools = String(poolsStr).split(',').map(p => p.trim()).filter(Boolean);
    if (pools.length === 0) return null;
    for (const pool of pools) {
        for (const r of state.processedData) {
            if (r.pool === pool && r.project) {
                return r.project.replace(/_validate$/, '').trim();
            }
        }
    }
    return null;
}

// ===== Работа с группами =====
function getGroups() {
    const groups = new Set();
    for (const emp of state.rawEmployeeMap) {
        const g = getVal(emp, 'Группа', 'группа', 'Group');
        if (g) groups.add(String(g).trim());
    }
    return Array.from(groups).sort();
}

function getMarkerGroup(markerEmail) {
    if (!markerEmail) return '';
    for (const emp of state.rawEmployeeMap) {
        const email = getVal(emp, 'Почта', 'Почта разметчика', 'Email', 'email');
        if (email && String(email).trim().toLowerCase() === markerEmail.toLowerCase()) {
            const g = getVal(emp, 'Группа', 'группа', 'Group');
            return g ? String(g).trim() : '';
        }
    }
    return '';
}

// ===== Рендер таблиц обратной связи (Существующая логика) =====
function renderFeedbackRows(tbodyId, includeActions) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const validMarkers = new Set();
    if (state.currentTab !== 'all') {
        for (const r of state.processedData) {
            if (matchesTab(r) && r.marker) validMarkers.add(r.marker);
        }
    }

    const filteredFb = state.feedbackData.filter(f => {
        if (state.currentTab === 'all') return true;
        const proj = f.project || deriveProjectFromPools(f.pools);
        if (proj) return proj === state.currentTab;
        return validMarkers.has(f.marker);
    });

    tbody.innerHTML = filteredFb
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((f) => {
            const statusColor = f.status === 'Проведена' ? '#85c4ae'
                : f.status === 'Отменена' ? '#e55555'
                : f.status === 'Перенесена' ? '#f2c94c'
                : '#f07171';
            const avgQText = f.avgQuality !== undefined && f.avgQuality !== null
                ? (f.avgQuality * 100).toFixed(1) + '%'
                : '—';
            const displayProject = f.project || deriveProjectFromPools(f.pools) || '—';

            let displayDate = f.date || '';
            if (displayDate.includes('-')) {
                const parts = displayDate.split('-');
                if (parts.length === 3) displayDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
            }

            let actionsCell = '';
            if (includeActions) {
                const realIdx = state.feedbackData.indexOf(f);
                actionsCell = `<td style="text-align:right; white-space:nowrap;">
                    <button class="icon-btn" onclick="editFeedback(${realIdx})" title="Редактировать">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button class="icon-btn danger" onclick="deleteFeedback(${realIdx})" title="Удалить">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </td>`;
            }

            return `<tr>
                <td>${escapeHtml(displayDate)}</td>
                <td>${escapeHtml(f.marker || '')}</td>
                <td>${escapeHtml(f.typeVKS || '—')}</td>
                <td>${escapeHtml(f.conductor || '—')}</td>
                <td><span class="status-badge" style="background:${statusColor}20; color:${statusColor}">${escapeHtml(f.status)}</span></td>
                <td>${escapeHtml(displayProject)}</td>
                <td>${escapeHtml(f.pools || '')}</td>
                <td><b>${avgQText}</b></td>
                ${actionsCell}
            </tr>`;
        }).join('');
}

export function renderFeedbackTable() {
    const markerSelect = document.getElementById('fbMarker');
    if (markerSelect) {
        const markers = [...new Set(state.processedData.map(r => r.marker).filter(Boolean))].sort();
        markerSelect.innerHTML = markers
            .map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
            .join('');
    }

    const conductorsList = document.getElementById('conductorsList');
    if (conductorsList) {
        const conductors = [...new Set(state.feedbackData.map(f => f.conductor).filter(Boolean))].sort();
        conductorsList.innerHTML = conductors
            .map(c => `<option value="${escapeHtml(c)}">`)
            .join('');
    }

    // Заполняем фильтр групп
    const groupOptions = document.getElementById('msFbGroup_options');
    if (groupOptions) {
        const groups = getGroups();
        const currentSelected = state.filterState.feedbackGroup;
        
        // Удаляем несуществующие
        for (const g of Array.from(currentSelected)) {
            if (!groups.includes(g)) currentSelected.delete(g);
        }

        groupOptions.innerHTML = groups.map(g => {
            const safe = escapeHtml(g);
            const checked = currentSelected.has(g) ? 'checked' : '';
            return `<label class="ms-item"><input type="checkbox" value="${safe}" onchange="onOptionChange('msFbGroup', 'feedbackGroup', this.value, this.checked)" ${checked}><span style="word-break: break-word;" title="${safe}">${safe}</span></label>`;
        }).join('');
    }
    updateLabel('msFbGroup', 'feedbackGroup');

    renderFeedbackRows('fbTableBody', true);
    renderFeedbackRows('fbTableBodyHome', false);
}

export function renderFeedbackTableHome() {
    renderFeedbackRows('fbTableBodyHome', false);
}

// ===== Новая логика создания фидбека =====

export function applyFeedbackFilters() {
    const container = document.getElementById('feedbackGenerationBlocks');
    if (!container) return;

    const selectedPools = state.filterState.feedbackPool;
    const selectedGroups = state.filterState.feedbackGroup;

    // Фильтруем данные
    const filtered = state.processedData.filter(r => {
        if (r._type !== 'validation') return false;
        if (state.currentTab !== 'all' && r.project !== state.currentTab) return false;
        
        // Если выбраны пулы, фильтруем по ним. Если не выбраны - показываем все
        if (selectedPools.size > 0 && !selectedPools.has(r.pool)) return false;
        
        // Фильтр по группе
        if (selectedGroups.size > 0) {
            const group = getMarkerGroup(r.marker);
            if (!selectedGroups.has(group)) return false;
        }
        
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--muted); padding:20px;">Нет данных для выбранных фильтров.</div>';
        return;
    }

    // Группируем по разметчику -> пул -> файлы
    const tree = {};
    for (const r of filtered) {
        const marker = r.marker || 'Неизвестный разметчик';
        const pool = r.pool || 'Неизвестный пул';
        
        if (!tree[marker]) tree[marker] = {};
        if (!tree[marker][pool]) tree[marker][pool] = new Set();
        
        if (r.fileName) tree[marker][pool].add(r.fileName);
    }

    let html = '';
    for (const marker in tree) {
        html += `<div class="feedback-gen-block">
            <div class="feedback-gen-marker">${escapeHtml(marker)}</div>`;
        
        for (const pool in tree[marker]) {
            html += `<div class="feedback-gen-pool">
                <div class="feedback-gen-pool-title">Пул: ${escapeHtml(pool)}</div>`;
            
            const files = Array.from(tree[marker][pool]).sort();
            for (const file of files) {
                const linkKey = `${marker}|${file}`;
                const savedLink = state.feedbackGeneration.videoLinks[linkKey] || '';
                html += `
                <div class="feedback-link-input-group">
                    <label>${escapeHtml(file)}</label>
                    <input type="text" placeholder="Вставьте ссылку на Kinescope..." 
                           value="${escapeHtml(savedLink)}" 
                           oninput="handleVideoLinkInput('${escapeHtml(marker)}', '${escapeHtml(file)}', this.value)">
                </div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
    }

    container.innerHTML = html;
}

export function handleVideoLinkInput(marker, file, value) {
    const key = `${marker}|${file}`;
    state.feedbackGeneration.videoLinks[key] = value;
}

export function generateFeedbackHtml() {
    const selectedPools = state.filterState.feedbackPool;
    const selectedGroups = state.filterState.feedbackGroup;

    const filtered = state.processedData.filter(r => {
        if (r._type !== 'validation') return false;
        if (state.currentTab !== 'all' && r.project !== state.currentTab) return false;
        if (selectedPools.size > 0 && !selectedPools.has(r.pool)) return false;
        if (selectedGroups.size > 0) {
            const group = getMarkerGroup(r.marker);
            if (!selectedGroups.has(group)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        alert('Нет данных для генерации отчета. Проверьте фильтры.');
        return;
    }

    // Структурируем данные для отчета: project -> pool -> marker -> data
    const reportData = {};
    for (const r of filtered) {
        const proj = r.project ? r.project.replace(/_validate$/, '') : 'Неизвестный проект';
        const pool = r.pool || 'Неизвестный пул';
        const marker = r.marker || 'Неизвестный разметчик';

        if (!reportData[proj]) reportData[proj] = {};
        if (!reportData[proj][pool]) reportData[proj][pool] = {};
        if (!reportData[proj][pool][marker]) {
            reportData[proj][pool][marker] = {
                errors: [],
                totalFragments: 0,
                uniqueFiles: new Set(),
                quality: r.quality // берем из последней записи
            };
        }

        const mData = reportData[proj][pool][marker];
        const fileKey = r.fileName || 'unknown';
        
        // Считаем фрагменты один раз для уникального файла
        if (!mData.uniqueFiles.has(fileKey)) {
            mData.uniqueFiles.add(fileKey);
            mData.totalFragments += (r.fragments || 0);
        }
        
        if (r.result === 'Ошибка') {
            mData.errors.push({
                type: r.errorType || 'Неизвестная',
                interval: r.interval || '',
                comment: r.comment || ''
            });
        }
    }

    // Строим HTML
    let bodyHtml = '';
    for (const proj in reportData) {
        bodyHtml += `<h1 class="main-title">Фидбэк по проекту: ${escapeHtml(proj)}</h1>`;
        
        for (const pool in reportData[proj]) {
            bodyHtml += `<h2 class="pool-title">Пул: ${escapeHtml(pool)}</h2>`;
            bodyHtml += `<div class="markers-container">`;

            for (const marker in reportData[proj][pool]) {
                const mData = reportData[proj][pool][marker];
                
                // Собираем ссылки на видео для этого разметчика в этом пуле
                let videoHtml = '';
                mData.uniqueFiles.forEach(file => {
                    const link = state.feedbackGeneration.videoLinks[`${marker}|${file}`];
                    if (link) {
                        // Простейшая вставка iframe (подходит для Kinescope)
                        let embedUrl = link;
                        if (link.includes('kinescope.io') && !link.includes('/embed/')) {
                            const parts = link.split('/');
                            const id = parts[parts.length - 1].split('?')[0];
                            embedUrl = `https://kinescope.io/embed/${id}`;
                        }
                        videoHtml += `
                        <div class="video-wrapper">
                            <p class="video-name">${escapeHtml(file)}</div>
                            <iframe src="${embedUrl}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media;" allowfullscreen></iframe>
                        </div>`;
                    } else {
                        videoHtml += `
                        <div class="video-wrapper missing">
                            <p class="video-name">${escapeHtml(file)}</p>
                            <div class="video-placeholder">Ссылка на видео не указана</div>
                        </div>`;
                    }
                });

                // Группируем ошибки по типам
                const errorsByType = {};
                for (const err of mData.errors) {
                    if (!errorsByType[err.type]) errorsByType[err.type] = [];
                    errorsByType[err.type].push(err);
                }

                let errorsHtml = '';
                const totalErrCount = mData.errors.length;
                
                for (const type in errorsByType) {
                    const errs = errorsByType[type];
                    const percent = mData.totalFragments > 0 
                        ? ((errs.length / mData.totalFragments) * 100).toFixed(2) 
                        : '0.00';
                    
                    let listHtml = '';
                    for (const e of errs) {
                        listHtml += `<li>
                            <span class="interval">${escapeHtml(e.interval)}</span>
                            ${e.comment ? `<span class="comment">${escapeHtml(e.comment)}</span>` : ''}
                        </li>`;
                    }

                    errorsHtml += `
                    <div class="error-group">
                        <div class="error-header">
                            <span class="error-name">${escapeHtml(type)}</span>
                            <span class="error-percent">${percent}%</span>
                        </div>
                        <ul class="error-list">${listHtml}</ul>
                    </div>`;
                }

                if (totalErrCount === 0) {
                    errorsHtml = '<div class="no-errors">Ошибок не выявлено</div>';
                }

                const q = (mData.quality !== null && mData.quality !== undefined) 
                    ? (mData.quality * 100).toFixed(1) + '%' 
                    : '—';

                bodyHtml += `
                <details class="marker-card">
                    <summary class="marker-summary">
                        <div class="avatar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        </div>
                        <div class="marker-info">
                            <div class="marker-email">${escapeHtml(maskEmail(marker))}</div>
                            <div class="marker-quality">Качество: <b>${q}</b></div>
                        </div>
                        <div class="toggle-icon">▼</div>
                    </summary>
                    <div class="marker-details">
                        <div class="videos-section">
                            ${videoHtml}
                        </div>
                        <div class="errors-section">
                            <h4>Разбор ошибок</h4>
                            ${errorsHtml}
                        </div>
                    </div>
                </details>`;
            }
            bodyHtml += `</div>`;
        }
    }

    // Шаблон документа
    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Фидбэк по проекту</title>
    <style>
        :root {
            --bg: #f4f7f6; --card: #ffffff; --text: #1f1f1f; --muted: #7a7a7a; --border: #e0e0e0;
            --accent: #4CAF50; --danger: #e55555;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; line-height: 1.5; }
        .container { max-width: 900px; margin: 0 auto; }
        
        .main-title { font-size: 2rem; font-weight: 700; margin-bottom: 10px; color: #2c3e50; }
        .pool-title { font-size: 1.5rem; font-weight: 600; margin-top: 40px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid var(--accent); color: #34495e; }
        
        .markers-container { display: flex; flex-direction: column; gap: 15px; }
        
        details.marker-card { background: var(--card); border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid var(--border); }
        details[open].marker-card { border-color: var(--accent); }
        
        summary.marker-summary { display: flex; align-items: center; padding: 15px 20px; cursor: pointer; list-style: none; user-select: none; background: #fafafa; transition: background 0.2s; }
        summary.marker-summary::-webkit-details-marker { display: none; }
        summary.marker-summary:hover { background: #f0f4f8; }
        
        .avatar { width: 48px; height: 48px; border-radius: 50%; background: #e0e0e0; color: #666; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 15px; }
        .avatar svg { width: 24px; height: 24px; }
        
        .marker-info { flex: 1; display: flex; flex-direction: column; }
        .marker-email { font-weight: 700; font-size: 1.1rem; color: #2c3e50; }
        .marker-quality { font-size: 0.9rem; color: var(--muted); margin-top: 2px; }
        
        .toggle-icon { color: var(--muted); font-size: 0.8rem; transition: transform 0.3s; margin-left: 10px; }
        details[open] .toggle-icon { transform: rotate(180deg); }
        
        .marker-details { padding: 20px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 20px; }
        
        .videos-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
        .video-wrapper { border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background: #000; }
        .video-name { font-size: 0.8rem; padding: 8px 10px; background: #333; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .video-wrapper iframe { width: 100%; aspect-ratio: 16/9; border: none; display: block; }
        
        .video-wrapper.missing { background: #f9f9f9; }
        .video-placeholder { aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 0.9rem; background: #eee; }
        
        .errors-section { background: #fdfdfd; border-radius: 8px; padding: 15px; border: 1px solid var(--border); }
        .errors-section h4 { font-size: 1.1rem; margin-bottom: 15px; color: #2c3e50; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        
        .error-group { margin-bottom: 15px; }
        .error-header { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; color: var(--danger); }
        .error-list { list-style: none; padding: 0; margin: 0; }
        .error-list li { padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 0.85rem; display: flex; gap: 10px; }
        .error-list li:last-child { border-bottom: none; }
        .interval { font-family: monospace; background: #eee; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #333; white-space: nowrap; }
        .comment { color: var(--muted); font-style: italic; }
        .no-errors { color: var(--accent); font-weight: 600; padding: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        ${bodyHtml}
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Фидбэк_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===== CRUD для записей обратной связи =====
export function editFeedback(idx) {
    const f = state.feedbackData[idx];
    if (!f) return;
    document.getElementById('fbMarker').value = f.marker;
    document.getElementById('fbDate').value = f.date;
    document.getElementById('fbStatus').value = f.status;
    document.getElementById('fbType').value = f.typeVKS;
    document.getElementById('fbConductor').value = f.conductor;

    state.filterState.fbFormPools.clear();
    document.querySelectorAll('#msFbFormPools_options input').forEach(cb => { cb.checked = false; });

    if (f.pools) {
        for (const p of f.pools.split(', ')) {
            state.filterState.fbFormPools.add(p);
            const cb = document.querySelector(`#msFbFormPools_options input[value="${CSS.escape ? CSS.escape(p) : p}"]`);
            if (cb) cb.checked = true;
        }
    }
    updateLabel('msFbFormPools', 'fbFormPools');

    state.editingFeedbackIndex = idx;
    document.getElementById('btnAddFeedback').textContent = 'Сохранить';
}

export function deleteFeedback(idx) {
    if (!confirm('Удалить запись?')) return;
    state.feedbackData.splice(idx, 1);
    saveFeedbackToStorage();
    renderFeedbackTable();
}

function handleAddFeedback() {
    const marker = document.getElementById('fbMarker').value;
    const dateStr = document.getElementById('fbDate').value;
    const status = document.getElementById('fbStatus').value;
    const typeVKS = document.getElementById('fbType').value;
    const conductor = document.getElementById('fbConductor').value;
    const pools = Array.from(state.filterState.fbFormPools).join(', ');

    if (!marker || !dateStr) { alert('Выберите разметчика и дату'); return; }
    if (!pools) { alert('Выберите хотя бы один пул с ошибками'); return; }

    const project = deriveProjectFromPools(pools);

    const currentDate = new Date(dateStr);
    const pastFeedbacks = state.feedbackData
        .filter(f => f.marker === marker && f.status === 'Проведена' && new Date(f.date) < currentDate)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    let startDate = null;
    if (pastFeedbacks.length > 0) {
        startDate = new Date(pastFeedbacks[0].date);
        startDate.setDate(startDate.getDate() + 1);
    }

    const relevantData = state.processedData.filter(r => {
        if (r.marker !== marker) return false;
        if (r.quality === null || isNaN(r.quality) || r.quality <= 0) return false;
        const rDate = new Date(r.date);
        if (startDate && rDate < startDate) return false;
        if (rDate > currentDate) return false;
        return true;
    });

    let avgQuality = null;
    if (relevantData.length > 0) {
        avgQuality = relevantData.reduce((a, b) => a + b.quality, 0) / relevantData.length;
    }

    const newRecord = { marker, date: dateStr, status, typeVKS, conductor, pools, avgQuality, project };

    if (state.editingFeedbackIndex !== null) {
        state.feedbackData[state.editingFeedbackIndex] = newRecord;
        state.editingFeedbackIndex = null;
        document.getElementById('btnAddFeedback').textContent = 'Добавить';
    } else {
        state.feedbackData.push(newRecord);
    }

    saveFeedbackToStorage();
    renderFeedbackTable();

    document.getElementById('fbDate').value = '';
    document.getElementById('fbConductor').value = '';
    state.filterState.fbFormPools.clear();
    document.querySelectorAll('#msFbFormPools_options input').forEach(cb => { cb.checked = false; });
    document.getElementById('msFbFormPools_all').checked = false;
    updateLabel('msFbFormPools', 'fbFormPools');
}

// ===== Инициализация =====
export function initFeedbackForm() {
    document.getElementById('btnAddFeedback').addEventListener('click', handleAddFeedback);
    
    // Кнопка "Применить" для групп
    document.getElementById('btnApplyGroup').addEventListener('click', () => {
        toggleDropdown('msFbGroup'); // Свернуть
        applyFeedbackFilters();
    });

    // Кнопка "Создать" (генерация HTML)
    document.getElementById('btnGenerateFeedback').addEventListener('click', generateFeedbackHtml);
}
