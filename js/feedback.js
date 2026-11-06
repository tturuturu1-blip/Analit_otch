// js/feedback.js — ПОЛНЫЙ ИСПРАВЛЕННЫЙ КОД
// ★ ИЗМЕНЕНО: handleSaveFeedback теперь считает avgQuality и сохраняет marker строкой для совместимости.
// ★ ИЗМЕНЕНО: В модалке добавления ОС заголовок "Провел" заменен на "Организатор" (в HTML это уже сделано, но в JS подтягиваем верно).

import { state, saveFeedbackToStorage, ITEMS_PER_PAGE } from './state.js';
import { formatDate, maskEmail, escapeHtml, updateLabel, getVal, parseExcelDate } from './utils.js';
import { matchesTab } from './data.js';

// Вспомогательные функции для проектов и групп
function buildPoolProjectCache() {
    const cache = {};
    for (const r of state.processedData) {
        if (r.pool && r.project && !cache[r.pool]) {
            cache[r.pool] = r.project.replace(/_validate$/, '').trim();
        }
    }
    return cache;
}

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

// ===== 1. ЛОГИКА КАЛЕНДАРЯ =====

export function renderCalendar() {
    const container = document.getElementById('calendarScroller');
    if (!container) return;

    const today = new Date();
    const currentDay = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - currentDay + 1 + state.calendarDayOffset);

    let html = '';
    const dayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
    
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(monday);
        currentDate.setDate(monday.getDate() + i);
        
        const y = currentDate.getFullYear();
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        const d = String(currentDate.getDate()).padStart(2, '0');
        const dateStrISO = `${y}-${m}-${d}`;
        const displayDate = `${dayNames[i]}, ${d}.${m}.${String(y).slice(-2)}`;

        const dayFeedbacks = state.feedbackData.filter(f => f.date === dateStrISO).sort((a,b) => new Date(b.date) - new Date(a.date));

        html += `<div class="calendar-day-card">
            <div class="calendar-date-title">${displayDate}</div>
            <div class="calendar-records-container" style="display:flex; flex-direction:column; gap:10px;">`;

        for (const fb of dayFeedbacks) {
            const realIdx = state.feedbackData.indexOf(fb);
            html += renderFeedbackRecordCard(fb, realIdx);
        }

        html += `
            <button class="calendar-add-btn" onclick="openAddTypeModal('${dateStrISO}')" title="Добавить запись">
                +
            </button>
        </div></div>`;
    }

    container.innerHTML = html;
}

function renderFeedbackRecordCard(fb, idx) {
    if (fb.eventType === 'task' || fb.eventType === 'vacation') {
        return `
            <div class="feedback-record-card" style="border-left-color: ${fb.eventType === 'task' ? 'var(--success)' : 'var(--warning)'};">
                <div class="feedback-record-actions">
                    <button class="icon-btn" onclick="deleteFeedbackFromCalendar(${idx})" title="Удалить">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
                <div class="feedback-record-header" style="color: ${fb.eventType === 'task' ? 'var(--success)' : 'var(--warning)'};">
                    ${fb.eventType === 'task' ? 'Задача' : 'Отпуск'}
                </div>
                <div class="feedback-record-sub"><b>${escapeHtml(fb.marker)}</b></div>
                <div style="font-size: 0.85rem; margin-top: 5px;">${escapeHtml(fb.description || '')}</div>
            </div>
        `;
    }

    const markersHtml = (fb.markers || []).map(m => {
        let avgQuality = 0;
        let count = 0;
        
        for (const r of state.processedData) {
            if (r.marker === m && r.quality != null) {
                const rProj = (r.project || '').replace(/_validate$/, '').trim();
                if (fb.project && rProj !== fb.project) continue;
                if (fb.pools && fb.pools.length > 0 && !fb.pools.includes(r.pool)) continue;
                avgQuality += r.quality;
                count++;
            }
        }
        
        const qText = count > 0 ? ((avgQuality / count) * 100).toFixed(1) + '%' : '—';
        const firstLetter = m.charAt(0).toUpperCase();
        
        return `<div class="feedback-avatar-chip">
            <div class="feedback-avatar-circle">${firstLetter}</div>
            <span title="${escapeHtml(m)}">${escapeHtml(m.split('@')[0])}</span>
            <b>${qText}</b>
        </div>`;
    }).join('');

    const timeStr = (fb.timeFrom && fb.timeTo) ? `${fb.timeFrom} - ${fb.timeTo}` : '';

    return `
        <div class="feedback-record-card">
            <div class="feedback-record-actions">
                <button class="icon-btn" onclick="editFeedbackFromCalendar(${idx})" title="Редактировать">
                    <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
                <button class="icon-btn" onclick="deleteFeedbackFromCalendar(${idx})" title="Удалить">
                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
            <div class="feedback-record-header">${escapeHtml(fb.conductor || 'Без организатора')}</div>
            <div class="feedback-record-sub">${escapeHtml(fb.typeVKS)} ${timeStr ? `(${timeStr})` : ''} • ${escapeHtml(fb.project || 'Без проекта')}</div>
            <div class="feedback-avatars-container">
                ${markersHtml}
            </div>
        </div>
    `;
}

// ===== 2. ЛОГИКА МОДАЛЬНЫХ ОКОН =====

export function openAddTypeModal(dateStr) {
    document.getElementById('eventModalDate').value = dateStr;
    document.getElementById('addTypeModal').classList.add('active');
}

export function openEventModal(type) {
    document.getElementById('addTypeModal').classList.remove('active');
    
    const modal = document.getElementById('addEventModal');
    const title = document.getElementById('eventModalTitle');
    const typeInput = document.getElementById('eventModalType');
    const dateStr = document.getElementById('eventModalDate').value;
    
    typeInput.value = type;
    modal.querySelector('#eventModalDate').value = dateStr;
    
    if (type === 'task') title.textContent = 'Добавить задачу';
    else if (type === 'vacation') title.textContent = 'Добавить отпуск';
    else title.textContent = 'Добавить ОС';

    const select = document.getElementById('eventModalMarker');
    const markers = [...new Set(state.processedData.map(r => r.marker).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Выберите разметчика...</option>' + markers.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

    document.getElementById('eventModalTitleInput').value = '';

    if (type === 'feedback') {
        openAddFeedbackModal(dateStr);
    } else {
        modal.classList.add('active');
    }
}

export function handleSaveEvent() {
    const date = document.getElementById('eventModalDate').value;
    const type = document.getElementById('eventModalType').value;
    const marker = document.getElementById('eventModalMarker').value;
    const description = document.getElementById('eventModalTitleInput').value.trim();

    if (!marker) {
        alert('Выберите разметчика');
        return;
    }

    const newRecord = { 
        date, 
        eventType: type, 
        marker, 
        description,
        typeVKS: type === 'task' ? 'Задача' : 'Отпуск'
    };

    state.feedbackData.push(newRecord);
    saveFeedbackToStorage();
    
    document.getElementById('addEventModal').classList.remove('active');
    renderCalendar();
}

export function openAddFeedbackModal(dateStr, editIdx = null) {
    const modal = document.getElementById('addFeedbackModal');
    if (!modal) return;

    document.getElementById('fbModalDate').value = dateStr;
    document.getElementById('btnSaveFeedback').textContent = 'Добавить';
    state.editingFeedbackIndex = editIdx;

    document.getElementById('fbModalProject').value = '';
    document.getElementById('fbModalTimeFrom').value = '';
    document.getElementById('fbModalTimeTo').value = '';
    document.getElementById('fbModalStatus').value = 'Запланирована';
    document.getElementById('fbModalType').value = 'Общее обучение';
    document.getElementById('fbModalConductor').value = '';
    
    state.filterState.fbRecordMarkers.clear();
    state.filterState.fbFormPools.clear();
    document.querySelectorAll('#msFbRecordMarkers_options input').forEach(cb => cb.checked = false);
    document.querySelectorAll('#msFbFormPools_options input').forEach(cb => cb.checked = false);
    
    populateFeedbackModalSelects();

    if (editIdx !== null) {
        const fb = state.feedbackData[editIdx];
        if (fb) {
            document.getElementById('fbModalProject').value = fb.project || '';
            document.getElementById('fbModalTimeFrom').value = fb.timeFrom || '';
            document.getElementById('fbModalTimeTo').value = fb.timeTo || '';
            document.getElementById('fbModalStatus').value = fb.status || 'Запланирована';
            document.getElementById('fbModalType').value = fb.typeVKS || 'Общее обучение';
            document.getElementById('fbModalConductor').value = fb.conductor || '';
            
            if (fb.markers) fb.markers.forEach(m => state.filterState.fbRecordMarkers.add(m));
            if (fb.pools) fb.pools.forEach(p => state.filterState.fbFormPools.add(p));
            
            document.querySelectorAll('#msFbRecordMarkers_options input').forEach(cb => {
                if (state.filterState.fbRecordMarkers.has(cb.value)) cb.checked = true;
            });
            document.querySelectorAll('#msFbFormPools_options input').forEach(cb => {
                if (state.filterState.fbFormPools.has(cb.value)) cb.checked = true;
            });
            
            document.getElementById('btnSaveFeedback').textContent = 'Сохранить';
        }
    }

    updateLabel('msFbRecordMarkers', 'fbRecordMarkers');
    updateLabel('msFbFormPools', 'fbFormPools');
    modal.classList.add('active');
}

function populateFeedbackModalSelects() {
    const markers = [...new Set(state.processedData.map(r => r.marker).filter(Boolean))].sort();
    const pools = [...new Set(state.processedData.map(r => r.pool).filter(Boolean))].sort();

    const msMarkers = document.getElementById('msFbRecordMarkers_options');
    if (msMarkers) {
        msMarkers.innerHTML = markers.map(m => {
            const safe = escapeHtml(m);
            return `<label class="ms-item"><input type="checkbox" value="${safe}" onchange="onOptionChange('msFbRecordMarkers', 'fbRecordMarkers', this.value, this.checked)"><span style="word-break: break-word;" title="${safe}">${safe}</span></label>`;
        }).join('');
    }

    const msPools = document.getElementById('msFbFormPools_options');
    if (msPools) {
        msPools.innerHTML = pools.map(p => {
            const safe = escapeHtml(p);
            return `<label class="ms-item"><input type="checkbox" value="${safe}" onchange="onOptionChange('msFbFormPools', 'fbFormPools', this.value, this.checked)"><span style="word-break: break-word;" title="${safe}">${safe}</span></label>`;
        }).join('');
    }

    const conductorsList = document.getElementById('conductorsList');
    if (conductorsList) {
        const conductors = [...new Set(state.feedbackData.map(f => f.conductor).filter(Boolean))].sort();
        conductorsList.innerHTML = conductors.map(c => `<option value="${escapeHtml(c)}">`).join('');
    }
}

// ★ ИЗМЕНЕНО: Теперь здесь рассчитывается среднее качество для записи
export function handleSaveFeedback() {
    const dateStr = document.getElementById('fbModalDate').value;
    const project = document.getElementById('fbModalProject').value.trim();
    const timeFrom = document.getElementById('fbModalTimeFrom').value;
    const timeTo = document.getElementById('fbModalTimeTo').value;
    const status = document.getElementById('fbModalStatus').value;
    const typeVKS = document.getElementById('fbModalType').value;
    const conductor = document.getElementById('fbModalConductor').value.trim();
    const markers = Array.from(state.filterState.fbRecordMarkers);
    const pools = Array.from(state.filterState.fbFormPools);

    if (markers.length === 0) {
        alert('Выберите хотя бы одного разметчика');
        return;
    }

    // Считаем среднее качество для сохранения (для отчета)
    let totalQ = 0;
    let countQ = 0;
    for (const m of markers) {
        const relevant = state.processedData.filter(r => {
            if (r.marker !== m || r.quality == null) return false;
            const rProj = (r.project || '').replace(/_validate$/, '').trim();
            if (project && rProj !== project) return false;
            if (pools.length > 0 && !pools.includes(r.pool)) return false;
            return true;
        });

        const uniqueFiles = new Map();
        for (const r of relevant) {
            const key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
            if (!uniqueFiles.has(key)) uniqueFiles.set(key, r.quality);
        }
        
        const vals = Array.from(uniqueFiles.values());
        if (vals.length > 0) {
            totalQ += vals.reduce((a, b) => a + b, 0) / vals.length;
            countQ++;
        }
    }
    const avgQuality = countQ > 0 ? totalQ / countQ : null;

    const newRecord = { 
        date: dateStr, 
        eventType: 'oc',
        project, 
        timeFrom,
        timeTo,
        status, 
        typeVKS, 
        conductor, 
        markers, 
        pools,
        avgQuality,
        marker: markers.join(', ') // Для совместимости со старой таблицей отчета
    };

    if (state.editingFeedbackIndex !== null) {
        state.feedbackData[state.editingFeedbackIndex] = newRecord;
        state.editingFeedbackIndex = null;
    } else {
        state.feedbackData.push(newRecord);
    }

    saveFeedbackToStorage();
    document.getElementById('addFeedbackModal').classList.remove('active');
    renderCalendar();
}

export function deleteFeedbackFromCalendar(idx) {
    if (!confirm('Удалить запись?')) return;
    state.feedbackData.splice(idx, 1);
    saveFeedbackToStorage();
    renderCalendar();
}

// ===== 3. ГЕНЕРАЦИЯ ФИДБЕКА (Kinescope) =====

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

    const reportData = {};
    for (const r of filtered) {
        const proj = r.project ? r.project.replace(/_validate$/, '') : 'Неизвестный проект';
        const pool = r.pool || 'Неизвестный пул';
        const marker = r.marker || 'Неизвестный разметчик';

        if (!reportData[proj]) reportData[proj] = {};
        if (!reportData[proj][pool]) reportData[proj][pool] = {};
        if (!reportData[proj][pool][marker]) {
            reportData[proj][pool][marker] = { errors: [], totalFragments: 0, uniqueFiles: new Set(), fileQualities: {} };
        }

        const mData = reportData[proj][pool][marker];
        const fileKey = r.fileName || 'unknown';
        
        if (!mData.uniqueFiles.has(fileKey)) {
            mData.uniqueFiles.add(fileKey);
            mData.totalFragments += (r.fragments || 0);
            if (r.quality != null && isFinite(r.quality)) mData.fileQualities[fileKey] = r.quality;
        }
        
        if (r.result === 'Ошибка') {
            mData.errors.push({ type: r.errorType || 'Неизвестная', interval: r.interval || '', comment: r.comment || '', fileName: fileKey });
        }
    }

    let bodyHtml = '';
    for (const proj in reportData) {
        bodyHtml += `<h1 class="main-title">Фидбэк по проекту: ${escapeHtml(proj)}</h1>`;
        
        for (const pool in reportData[proj]) {
            bodyHtml += `<h2 class="pool-title">Пул: ${escapeHtml(pool)}</h2>`;
            bodyHtml += `<div class="markers-container">`;

            for (const marker in reportData[proj][pool]) {
                const mData = reportData[proj][pool][marker];
                let filesHtml = '';
                
                mData.uniqueFiles.forEach(file => {
                    const videoUrl = (state.feedbackGeneration.videoLinks[`${marker}|${file}`] || '').trim();
                    
                    let videoContent = '<div class="video-placeholder">Ссылка на видео не указана</div>';
                    if (videoUrl) {
                        if (videoUrl.includes('kinescope.io') || videoUrl.startsWith('<iframe')) {
                            let srcUrl = videoUrl;
                            const match = videoUrl.match(/src="([^"]+)"/);
                            if (match) srcUrl = match[1];
                            
                            videoContent = `
                                <div class="video-embed-container">
                                    <iframe src="${escapeHtml(srcUrl)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen frameborder="0"></iframe>
                                </div>
                            `;
                        } else {
                            videoContent = `<a href="${escapeHtml(videoUrl)}" target="_blank" class="video-button">Скачать/Открыть видео</a>`;
                        }
                    }

                    const fileErrors = mData.errors.filter(e => e.fileName === file);
                    let errorsHtml = '';
                    
                    if (fileErrors.length === 0) {
                        errorsHtml = '<div class="no-errors">Ошибок не выявлено</div>';
                    } else {
                        const errorsByType = {};
                        for (const err of fileErrors) {
                            if (!errorsByType[err.type]) errorsByType[err.type] = [];
                            errorsByType[err.type].push(err);
                        }

                        for (const type in errorsByType) {
                            const errs = errorsByType[type];
                            const weighted = errs.reduce((a, e) => a + (e.type === 'Некритичная ошибка' ? 0.5 : 1), 0);
                            const percent = mData.totalFragments > 0 ? ((weighted / mData.totalFragments) * 100).toFixed(2) : '0.00';
                            
                            let listHtml = '';
                            for (const e of errs) {
                                listHtml += `<li><span class="interval">${escapeHtml(e.interval)}</span>${e.comment ? `<span class="comment">${escapeHtml(e.comment)}</span>` : ''}</li>`;
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
                    }

                    filesHtml += `
                    <div class="file-block">
                        <h3 class="file-name">${escapeHtml(file)}</h3>
                        <div class="video-wrapper">${videoContent}</div>
                        <div class="errors-section">
                            <h4>Разбор ошибок</h4>
                            ${errorsHtml}
                        </div>
                    </div>`;
                });

                let q = '—';
                const qVals = Object.values(mData.fileQualities);
                if (qVals.length > 0) {
                    const avg = qVals.reduce((a, b) => a + b, 0) / qVals.length;
                    q = (avg * 100).toFixed(1) + '%';
                }

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
                    <div class="marker-details">${filesHtml}</div>
                </details>`;
            }
            bodyHtml += `</div>`;
        }
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Фидбэк по проекту</title>
    <style>
        :root { --bg: #f6f4ef; --card: #ede8e0; --text: #1c1c1c; --muted: #8e8e8e; --accent: #1c1c1c; --danger: #e55555; --border: rgba(0,0,0,0.05); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Source Sans 3', -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 30px; text-align: left; }
        .container { width: 100%; max-width: 1200px; margin: 0; }
        .main-title { font-size: 2rem; font-weight: 700; margin-bottom: 10px; color: var(--text); }
        .pool-title { font-size: 1.5rem; font-weight: 600; margin-top: 40px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid var(--text); color: var(--text); }
        .markers-container { display: flex; flex-direction: column; gap: 20px; width: 100%; }
        details.marker-card { background: var(--card); border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); overflow: hidden; border: 1px solid var(--border); width: 100%; }
        details[open].marker-card { border-color: var(--text); }
        summary.marker-summary { display: flex; align-items: center; padding: 20px 25px; cursor: pointer; list-style: none; user-select: none; transition: background 0.2s; }
        summary.marker-summary::-webkit-details-marker { display: none; }
        summary.marker-summary:hover { background: rgba(0,0,0,0.02); }
        .avatar { width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,0.6); color: var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 15px; }
        .avatar svg { width: 24px; height: 24px; }
        .marker-info { flex: 1; display: flex; flex-direction: column; }
        .marker-email { font-weight: 700; font-size: 1.1rem; color: var(--text); }
        .marker-quality { font-size: 0.9rem; color: var(--muted); margin-top: 2px; }
        .toggle-icon { color: var(--muted); font-size: 0.8rem; transition: transform 0.3s; margin-left: 10px; }
        details[open] .toggle-icon { transform: rotate(180deg); }
        .marker-details { padding: 25px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 30px; }
        .file-block { display: flex; flex-direction: column; gap: 15px; }
        .file-name { font-size: 1.1rem; font-weight: 600; color: var(--text); word-break: break-all; margin-bottom: 5px; }
        .video-wrapper { width: 100%; max-width: 600px; }
        .video-embed-container { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; background: #000; }
        .video-embed-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
        .video-button { display: inline-flex; align-items: center; gap: 10px; background: var(--accent); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 1rem; transition: opacity 0.2s; }
        .video-button:hover { opacity: 0.8; }
        .video-placeholder { padding: 15px 20px; color: var(--muted); background: rgba(0,0,0,0.03); border-radius: 8px; font-size: 0.9rem; font-style: italic; }
        .errors-section { background: rgba(255,255,255,0.5); border-radius: 12px; padding: 20px; border: 1px solid var(--border); max-width: 800px; }
        .errors-section h4 { font-size: 1.1rem; margin-bottom: 15px; color: var(--text); }
        .error-group { margin-bottom: 15px; }
        .error-header { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; color: var(--danger); }
        .error-list { list-style: none; padding: 0; margin: 0; }
        .error-list li { padding: 8px 0; border-bottom: 1px dashed var(--border); font-size: 0.9rem; display: flex; gap: 10px; }
        .error-list li:last-child { border-bottom: none; }
        .interval { font-family: monospace; background: #eee; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #333; white-space: nowrap; }
        .comment { color: var(--muted); font-style: italic; }
        .no-errors { color: #4CAF50; font-weight: 600; padding: 10px 0; }
    </style>
</head>
<body>
    <div class="container">${bodyHtml}</div>
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

export function applyFeedbackFilters() {
    const container = document.getElementById('feedbackGenerationBlocks');
    if (!container) return;

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
        container.innerHTML = '<div style="text-align:center; color:var(--muted); padding:20px;">Нет данных для выбранных фильтров.</div>';
        return;
    }

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
        html += `<div class="feedback-gen-block"><div class="feedback-gen-marker">${escapeHtml(marker)}</div>`;
        for (const pool in tree[marker]) {
            html += `<div class="feedback-gen-pool"><div class="feedback-gen-pool-title">Пул: ${escapeHtml(pool)}</div>`;
            const files = Array.from(tree[marker][pool]).sort();
            for (const file of files) {
                const linkKey = `${marker}|${file}`;
                const savedUrl = state.feedbackGeneration.videoLinks[linkKey] || '';
                html += `
                <div class="feedback-link-input-group">
                    <label>${escapeHtml(file)} (Ссылка на видео)</label>
                    <div class="feedback-input-wrapper">
                        <svg class="feedback-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        <input type="text" placeholder="Вставьте прямую ссылку или iframe..." value="${escapeHtml(savedUrl)}" 
                               data-marker="${escapeHtml(marker)}" data-file="${escapeHtml(file)}"
                               oninput="handleVideoLinkInput(this.dataset.marker, this.dataset.file, this.value)">
                    </div>
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

export function initFeedbackForm() {
    if (state._fbFormInitialized) return;
    state._fbFormInitialized = true;

    document.getElementById('btnSaveFeedback').addEventListener('click', handleSaveFeedback);
    document.getElementById('btnSaveEvent').addEventListener('click', handleSaveEvent);
    
    document.getElementById('btnApplyGroup').addEventListener('click', () => {
        if (window.toggleDropdown) window.toggleDropdown('msFbGroup');
        applyFeedbackFilters();
    });

    document.getElementById('btnGenerateFeedback').addEventListener('click', generateFeedbackHtml);
}

window.renderCalendar = renderCalendar;
window.openAddTypeModal = openAddTypeModal;
window.openEventModal = openEventModal;
window.editFeedbackFromCalendar = (idx) => {
    const fb = state.feedbackData[idx];
    if (fb) openAddFeedbackModal(fb.date, idx);
};
window.deleteFeedbackFromCalendar = deleteFeedbackFromCalendar;