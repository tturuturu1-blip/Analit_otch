import { state, saveFeedbackToStorage } from './state.js';
import { formatDate, maskEmail, escapeHtml, updateLabel } from './utils.js';
import { matchesTab } from './data.js';

// ===== Определение проекта по пулам записи =====
// Используется, если в записи нет поля project (старые записи)
// или если пользователь выбрал пулы для новой записи.
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

// ===== Общий рендер строк таблицы обратной связи =====
// tbodyId       — id контейнера <tbody>, куда рендерить
// includeActions — true → добавить колонку с кнопками "Редактировать/Удалить"
function renderFeedbackRows(tbodyId, includeActions) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    // Маркеры, у которых есть данные в выбранном проекте (fallback для старых записей без project)
    const validMarkers = new Set();
    if (state.currentTab !== 'all') {
        for (const r of state.processedData) {
            if (matchesTab(r) && r.marker) validMarkers.add(r.marker);
        }
    }

    // Фильтр по проекту (приоритет — поле project, fallback — маркер)
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
            const statusColor = f.status === 'Проведена' ? '#10b981'
                : f.status === 'Отменена' ? '#ef4444'
                : f.status === 'Перенесена' ? '#f59e0b'
                : '#1d9bf0';
            const avgQText = f.avgQuality !== undefined && f.avgQuality !== null
                ? (f.avgQuality * 100).toFixed(1) + '%'
                : '—';
            const displayProject = f.project || deriveProjectFromPools(f.pools) || '—';

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
                <td>${escapeHtml(f.date || '')}</td>
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

// ===== Полная таблица на странице "Обратная связь" (с кнопками) =====
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

    renderFeedbackRows('fbTableBody', true);
    renderFeedbackRows('fbTableBodyHome', false);
}

// ===== Только таблица на главной (без кнопок) =====
export function renderFeedbackTableHome() {
    renderFeedbackRows('fbTableBodyHome', false);
}

// ===== Редактирование записи =====
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

// ===== Удаление записи =====
export function deleteFeedback(idx) {
    if (!confirm('Удалить запись?')) return;
    state.feedbackData.splice(idx, 1);
    saveFeedbackToStorage();
    renderFeedbackTable();
}

// ===== Добавление / сохранение записи =====
function handleAddFeedback() {
    const marker = document.getElementById('fbMarker').value;
    const dateStr = document.getElementById('fbDate').value;
    const status = document.getElementById('fbStatus').value;
    const typeVKS = document.getElementById('fbType').value;
    const conductor = document.getElementById('fbConductor').value;
    const pools = Array.from(state.filterState.fbFormPools).join(', ');

    if (!marker || !dateStr) { alert('Выберите разметчика и дату'); return; }
    if (!pools) { alert('Выберите хотя бы один пул с ошибками'); return; }

    // Проект выводим из пулов (первый найденный)
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

// ===== Генерация фидбеков по пулам (Excel) =====
export async function generateFeedback() {
    const selectedPools = Array.from(state.filterState.feedbackPool);
    if (selectedPools.length === 0) {
        alert('Выберите хотя бы один пул для формирования фидбека.');
        return;
    }

    const markerPoolQualityMap = {};
    for (const r of state.processedData) {
        if (r.pool && r.marker && r.quality > 0) {
            const key = `${r.pool}|${r.marker}`;
            if (!markerPoolQualityMap[key]) markerPoolQualityMap[key] = { sum: 0, count: 0 };
            markerPoolQualityMap[key].sum += r.quality;
            markerPoolQualityMap[key].count++;
        }
    }
    const getMarkerPoolQuality = (pool, marker) => {
        const data = markerPoolQualityMap[`${pool}|${marker}`];
        return data ? (data.sum / data.count) : null;
    };

    for (const pool of selectedPools) {
        const poolData = state.processedData.filter(r => r.pool === pool);
        const rows = poolData.map(r => ({
            "Дата валидации": r.date ? formatDate(r.date) : "",
            "Пул": r.pool || "",
            "Почта разметчика": maskEmail(r.marker),
            "Наименование файла": r.fileName || "",
            "Итог": r.result || "",
            "Тип ошибки": r.errorType || "",
            "Комментарий": r.comment || "",
            "Временной интервал фрагмента": r.interval || "",
            "Почта валидатора": maskEmail(r.validator),
            "Качество по задаче": r.quality !== null ? r.quality : "",
            "Качество по пулу": getMarkerPoolQuality(r.pool, r.marker)
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        let baseName = pool.replace(/[\[\]*?/\\:]/g, '').substring(0, 28);
        if (!baseName) baseName = "Пул";
        XLSX.utils.book_append_sheet(wb, ws, baseName);
        XLSX.writeFile(wb, `feedback_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`);

        await new Promise(r => setTimeout(r, 300));
    }
    const { log } = await import('./utils.js');
    log('Фидбеки сформированы (по файлу на пул)', false);
}

// ===== Инициализация формы =====
export function initFeedbackForm() {
    document.getElementById('btnAddFeedback').addEventListener('click', handleAddFeedback);
    document.getElementById('btnGenerateFeedback').addEventListener('click', generateFeedback);
}
