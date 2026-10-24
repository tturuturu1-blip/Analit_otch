import { state } from './state.js';
import { applyFilters, matchesTab } from './data.js';
import { formatDate, updateLabel, escapeHtml, destroyChart, getVal } from './utils.js';
import { renderFeedbackTable, renderFeedbackTableHome } from './feedback.js';
import {
    applySupersetFilters, formatPeriod, getNormForDate, getNormsForPeriod,
    addNormEntry, getTable1Config, getTable2Config, getTable3Config, getTable4Config
} from './superset.js';

// ===== Навигация =====
export function switchMenu(menuId, btn) {
    state.currentMenu = menuId;
    document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById('section-' + menuId);
    if (sec) sec.classList.add('active');

    const topBar = document.getElementById('topBar');
    topBar.style.display = (menuId === 'data') ? 'none' : 'flex';

    if (menuId === 'main') triggerFilterUpdate();
    if (menuId === 'errors') renderErrorsTable();
    if (menuId === 'feedback') renderFeedbackTable();
    if (menuId === 'superset') {
        applySupersetFilters();
        renderSupersetPage();
    }
}

export function switchTab(tabId, btn) {
    state.currentTab = tabId;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (state.currentMenu === 'main') triggerFilterUpdate();
    if (state.currentMenu === 'errors') renderErrorsTable();
    if (state.currentMenu === 'feedback') renderFeedbackTable();
    if (state.currentMenu === 'superset') {
        applySupersetFilters();
        renderSupersetPage();
    }
}

// ▼▼▼ Авто-формируемые табы: базовые + _validate-варианты (если для них есть «родитель») ▼▼▼
export function buildProjectTabs() {
    const tabsContainer = document.getElementById('projectTabs');
    if (!tabsContainer) return;

    const projectSet = new Set();

    // 1. Проекты из processedData (как есть — с _validate и без)
    for (const r of state.processedData) {
        if (!r.project) continue;
        const name = String(r.project).trim();
        if (name) projectSet.add(name);
    }

    // 2. Дополнительно — проекты Суперсета с _validate, у которых есть «родитель»
    const supersetProjects = new Set();
    for (const arr of [state.rawSuperset1, state.rawSuperset2, state.rawSuperset3]) {
        for (const r of arr) {
            const proj = getVal(r, 'Проект');
            if (proj) supersetProjects.add(String(proj).trim());
        }
    }
    for (const sp of supersetProjects) {
        if (!sp.endsWith('_validate')) continue;
        const parent = sp.substring(0, sp.length - '_validate'.length).trim();
        if (projectSet.has(parent)) {
            projectSet.add(sp);
        }
    }

    const projects = Array.from(projectSet).sort();
    state.projects = projects;

    if (projects.length <= 1) {
        tabsContainer.style.display = 'none';
        tabsContainer.innerHTML = '';
        state.currentTab = 'all';
        return;
    }

    tabsContainer.style.display = 'flex';
    if (state.currentTab !== 'all' && !projects.includes(state.currentTab)) state.currentTab = 'all';

    let html = '<div class="tab ' + (state.currentTab === 'all' ? 'active' : '') + '" data-tab="all">Все</div>';
    for (const p of projects) {
        const safe = escapeHtml(p);
        const active = state.currentTab === p ? 'active' : '';
        html += '<div class="tab ' + active + '" data-tab="' + safe + '">' + safe + '</div>';
    }
    tabsContainer.innerHTML = html;
}
// ▲▲▲

export function renderMarkersTasksStatus() {
    const container = document.getElementById('markersStatusList');
    if (!container) return;
    if (!state.rawMarkers || state.rawMarkers.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const valKeys = new Set();
    for (const v of state.rawValidation) {
        const taskId = getVal(v, 'task_id');
        const markerId = getVal(v, 'marker_id');
        if (taskId != null && markerId != null) {
            valKeys.add(String(taskId).trim() + '|' + String(markerId).trim());
        }
    }

    const tasksMap = new Map();
    for (const m of state.rawMarkers) {
        const taskName = getVal(m, 'Задача');
        if (!taskName) continue;
        const taskId = getVal(m, 'ID задачи');
        const markerId = getVal(m, 'ID разметчика');
        const key = (taskId != null && markerId != null)
            ? String(taskId).trim() + '|' + String(markerId).trim()
            : null;
        if (!tasksMap.has(taskName)) tasksMap.set(taskName, { pairs: new Set(), matched: new Set() });
        const entry = tasksMap.get(taskName);
        if (key) {
            entry.pairs.add(key);
            if (valKeys.has(key)) entry.matched.add(key);
        }
    }

    const tasks = [];
    for (const [name, entry] of tasksMap) {
        tasks.push({
            name,
            hasVal: entry.matched.size > 0,
            totalPairs: entry.pairs.size,
            matchedPairs: entry.matched.size
        });
    }

    tasks.sort((a, b) => {
        if (a.hasVal === b.hasVal) return a.name.localeCompare(b.name);
        return a.hasVal ? 1 : -1;
    });

    const withVal = tasks.filter(t => t.hasVal).length;
    const withoutVal = tasks.length - withVal;

    let html = '<div class="markers-status-summary">'
        + '<span class="markers-status-ok">✅ ' + withVal + '</span>'
        + '<span class="markers-status-bad">❌ ' + withoutVal + '</span>'
        + '<span class="markers-status-total">Всего задач: ' + tasks.length + '</span>'
        + '</div><ul class="markers-status-items">';
    for (const t of tasks) {
        const icon = t.hasVal ? '✅' : '❌';
        const cls = t.hasVal ? 'ok' : 'bad';
        const pairsInfo = t.totalPairs > 0
            ? '<span class="markers-status-pairs">(' + t.matchedPairs + '/' + t.totalPairs + ')</span>'
            : '';
        html += '<li class="markers-status-item ' + cls + '" title="' + escapeHtml(t.name) + '">'
            + '<span class="markers-status-icon">' + icon + '</span>'
            + '<span class="markers-status-name">' + escapeHtml(t.name) + '</span>'
            + pairsInfo + '</li>';
    }
    html += '</ul>';

    container.innerHTML = html;
    container.style.display = 'block';
}

// ===== Multi-select =====
export function toggleDropdown(id) {
    const dropdown = document.getElementById(id + '_dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    if (!isOpen) {
        dropdown.classList.add('open');
        const searchInput = dropdown.querySelector('.ms-search');
        if (searchInput) {
            searchInput.value = '';
            filterMsOptions(searchInput);
            setTimeout(() => searchInput.focus(), 50);
        }
    }
}

export function filterMsOptions(inputEl) {
    const dropdown = inputEl.closest('.ms-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.ms-item');
    const query = inputEl.value.toLowerCase();
    for (const item of items) {
        if (item.classList.contains('ms-all')) continue;
        item.style.display = item.textContent.toLowerCase().includes(query) ? 'flex' : 'none';
    }
}

export function toggleAll(containerId, stateKey) {
    const allCheckbox = document.getElementById(containerId + '_all');
    const checkboxes = document.querySelectorAll('#' + containerId + '_options input[type="checkbox"]');
    state.filterState[stateKey].clear();
    for (const cb of checkboxes) {
        cb.checked = allCheckbox.checked;
        if (cb.checked) state.filterState[stateKey].add(cb.value);
    }
    updateLabel(containerId, stateKey);
    if (stateKey !== 'feedbackPool' && stateKey !== 'fbFormPools') triggerFilterUpdate();
}

export function onOptionChange(containerId, stateKey, value, isChecked) {
    if (isChecked) state.filterState[stateKey].add(value);
    else state.filterState[stateKey].delete(value);
    const allCheckbox = document.getElementById(containerId + '_all');
    const checkboxes = document.querySelectorAll('#' + containerId + '_options input[type="checkbox"]');
    allCheckbox.checked = Array.from(checkboxes).every(cb => cb.checked);
    updateLabel(containerId, stateKey);
    if (stateKey !== 'feedbackPool' && stateKey !== 'fbFormPools') triggerFilterUpdate();
}

export function populateMultiSelect(containerId, stateKey, values) {
    const optionsContainer = document.getElementById(containerId + '_options');
    if (!optionsContainer) return;
    state.filterState[stateKey].clear();
    document.getElementById(containerId + '_all').checked = false;
    optionsContainer.innerHTML = values.map(val => {
        const safe = escapeHtml(val);
        return `<label class="ms-item"><input type="checkbox" value="${safe}" onchange="onOptionChange('${containerId}', '${stateKey}', this.value, this.checked)"><span style="word-break: break-word;" title="${safe}">${safe}</span></label>`;
    }).join('');
    updateLabel(containerId, stateKey);
}

export function populateAllMultiSelects() {
    const pools = [...new Set(state.processedData.map(r => r.pool).filter(Boolean))].sort();
    const markers = [...new Set(state.processedData.map(r => r.marker).filter(Boolean))].sort();
    populateMultiSelect('msPool', 'pool', pools);
    populateMultiSelect('msMarker', 'marker', markers);
    populateMultiSelect('msResult', 'result', ['Ошибка', 'Рекомендация', 'Ошибки не выявлены']);
    populateMultiSelect('msFbPool', 'feedbackPool', pools);
    populateMultiSelect('msFbFormPools', 'fbFormPools', pools);
}

export function triggerFilterUpdate() {
    if (state.currentMenu !== 'main') return;
    applyFilters();
    updateKPI();
    buildQualityChart();
    buildErrorChart();
    buildPoolQualityChart();
    buildDayQualityChart();
    buildErrorsByMarkerChart();
    buildTrendChart();
    buildTable();
    renderFeedbackTableHome();
}

export function updateKPI() {
    const uniqueFiles = new Set();
    let totalFragments = 0;
    for (const r of state.filteredData) {
        if (r._type !== 'validation') continue;
        const fileKey = r.marker + '|' + r.fileName + '|' + r.fragments;
        if (!uniqueFiles.has(fileKey)) {
            uniqueFiles.add(fileKey);
            totalFragments += (r.fragments || 0);
        }
    }

    const uniqueMarkers = new Set();
    let errorsCount = 0;
    let qualitySum = 0, qualityCount = 0;
    for (const r of state.filteredData) {
        if (r.marker) uniqueMarkers.add(r.marker);
        if (r.result === 'Ошибка') errorsCount++;
        if (r.quality !== null && !isNaN(r.quality) && r.quality > 0) {
            qualitySum += r.quality;
            qualityCount++;
        }
    }

    const errorPercent = totalFragments > 0 ? (errorsCount / totalFragments) * 100 : 0;
    const avgQ = qualityCount ? qualitySum / qualityCount : null;

    document.getElementById('kpiTotalFragments').textContent = totalFragments;
    document.getElementById('kpiTotalMarkers').textContent = uniqueMarkers.size;
    document.getElementById('kpiErrorsPercent').textContent = errorPercent.toFixed(2) + '%';
    document.getElementById('kpiQuality').textContent = avgQ !== null ? (avgQ * 100).toFixed(1) + '%' : '—';

    const target = state.superset.norms.globalAvg;
    const targetEl = document.getElementById('kpiTargetQuality');
    if (targetEl) targetEl.textContent = target != null ? target.toFixed(1) + '%' : '—';
}

function targetLinesForLabels(labels) {
    const target = state.superset.norms.globalAvg;
    if (target != null) {
        return [{ label: 'Целевое (суперсет)', data: Array(labels.length).fill(target), type: 'line', borderDash: [5, 5], borderColor: '#1d9bf0', borderWidth: 2, pointRadius: 0, order: 1 }];
    }
    return [
        { label: 'Норма 98%', data: Array(labels.length).fill(98), type: 'line', borderDash: [5, 5], borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, order: 1 },
        { label: 'Норма 99%', data: Array(labels.length).fill(99), type: 'line', borderDash: [5, 5], borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, order: 1 }
    ];
}

export function buildQualityChart() {
    destroyChart(state.charts.quality);
    const byMarker = {};
    for (const r of state.filteredData) {
        if (r.marker && r.quality !== null && !isNaN(r.quality) && r.quality > 0) {
            (byMarker[r.marker] = byMarker[r.marker] || []).push(r.quality);
        }
    }
    const labels = Object.keys(byMarker).sort();
    const values = labels.map(m => (byMarker[m].reduce((a, b) => a + b, 0) / byMarker[m].length) * 100);
    const datasets = [
        { label: 'Ср. качество, %', data: values, backgroundColor: values.map(v => v < 98 ? '#ef4444' : v < 99 ? '#f59e0b' : '#10b981'), borderRadius: 4, order: 2 },
        ...targetLinesForLabels(labels)
    ];
    state.charts.quality = new Chart(document.getElementById('chartQuality'), {
        type: 'bar',
        data: { labels: labels.map(l => l.length > 25 ? l.slice(0, 22) + '…' : l), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%', color: '#2e1065' } }, x: { ticks: { color: '#2e1065' } } } }
    });
}

export function buildErrorChart() {
    destroyChart(state.charts.errors);
    const byType = {};
    for (const r of state.filteredData) {
        if (r.errorType) byType[r.errorType] = (byType[r.errorType] || 0) + 1;
    }
    state.charts.errors = new Chart(document.getElementById('chartErrors'), {
        type: 'doughnut',
        data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType), backgroundColor: ['#1d9bf0', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'] }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } } }
    });
}

export function buildPoolQualityChart() {
    destroyChart(state.charts.poolQuality);
    const byPool = {};
    for (const r of state.filteredData) {
        if (r.pool && r.quality !== null && !isNaN(r.quality) && r.quality > 0) {
            (byPool[r.pool] = byPool[r.pool] || []).push(r.quality);
        }
    }
    const labels = Object.keys(byPool).sort();
    const values = labels.map(p => (byPool[p].reduce((a, b) => a + b, 0) / byPool[p].length) * 100);
    const datasets = [
        { label: 'Ср. качество, %', data: values, backgroundColor: values.map(v => v < 98 ? '#ef4444' : v < 99 ? '#f59e0b' : '#10b981'), borderRadius: 4, order: 2 },
        ...targetLinesForLabels(labels)
    ];
    state.charts.poolQuality = new Chart(document.getElementById('chartPoolQuality'), {
        type: 'bar',
        data: { labels: labels.map(l => l.length > 30 ? l.slice(0, 27) + '…' : l), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%', color: '#2e1065' } }, x: { ticks: { color: '#2e1065' } } } }
    });
}

export function buildDayQualityChart() {
    destroyChart(state.charts.dayQuality);
    const byDate = {};
    for (const r of state.filteredData) {
        if (r.date && r.quality !== null && !isNaN(r.quality) && r.quality > 0) {
            const k = formatDate(r.date);
            (byDate[k] = byDate[k] || []).push(r.quality);
        }
    }
    const labels = Object.keys(byDate).sort((a, b) =>
        a.split('.').reverse().join('-').localeCompare(b.split('.').reverse().join('-')));
    const values = labels.map(d => (byDate[d].reduce((a, b) => a + b, 0) / byDate[d].length) * 100);

    const target = state.superset.norms.globalAvg;
    let targetData, targetLabel, targetColor;
    if (target != null) {
        targetData = labels.map(() => target);
        targetLabel = 'Целевое качество (суперсет)';
        targetColor = '#1d9bf0';
    } else {
        targetData = labels.map(d => {
            const p = d.split('.');
            return new Date(p[2], p[1] - 1, p[0]) < new Date(2026, 9, 20) ? 98 : 99;
        });
        targetLabel = 'Контрольная линия';
        targetColor = '#ef4444';
    }

    state.charts.dayQuality = new Chart(document.getElementById('chartDayQuality'), {
        type: 'line',
        data: { labels, datasets: [
            { label: 'Ср. качество, %', data: values, borderColor: '#1d9bf0', backgroundColor: 'rgba(29, 155, 240, 0.1)', tension: .3, fill: true, pointRadius: 4, order: 2 },
            { label: targetLabel, data: targetData, borderColor: targetColor, borderDash: [5, 5], borderWidth: 2, pointRadius: 0, stepped: target == null, order: 1 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%', color: '#2e1065' } }, x: { ticks: { color: '#2e1065' } } } }
    });
}

export function buildErrorsByMarkerChart() {
    destroyChart(state.charts.errorsByMarker);
    const markers = [...new Set(state.filteredData.map(r => r.marker).filter(Boolean))].sort();
    const errorTypes = [...new Set(state.filteredData.map(r => r.errorType).filter(Boolean))].sort();
    const colors = ['#ef4444', '#f59e0b', '#1d9bf0', '#10b981', '#8b5cf6', '#ec4899'];
    const datasets = errorTypes.map((type, idx) => ({
        label: type,
        data: markers.map(m => state.filteredData.filter(r => r.marker === m && r.errorType === type).length),
        backgroundColor: colors[idx % colors.length]
    }));
    state.charts.errorsByMarker = new Chart(document.getElementById('chartErrorsByMarker'), {
        type: 'bar',
        data: { labels: markers.map(m => m.length > 20 ? m.slice(0, 18) + '…' : m), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } }, scales: { x: { stacked: true, ticks: { color: '#2e1065' } }, y: { stacked: true, beginAtZero: true, ticks: { color: '#2e1065' } } } }
    });
}

export function buildTrendChart() {
    destroyChart(state.charts.trend);
    const byDate = {};
    for (const r of state.filteredData) {
        if (!r.date) continue;
        const k = formatDate(r.date);
        if (!byDate[k]) byDate[k] = { errors: 0, recs: 0 };
        if (r.result === 'Ошибка') byDate[k].errors++;
        if (r.result === 'Рекомендация') byDate[k].recs++;
    }
    const labels = Object.keys(byDate).sort((a, b) =>
        a.split('.').reverse().join('-').localeCompare(b.split('.').reverse().join('-')));
    state.charts.trend = new Chart(document.getElementById('chartTrend'), {
        type: 'line',
        data: { labels, datasets: [
            { label: 'Ошибки', data: labels.map(l => byDate[l].errors), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: .3, fill: true },
            { label: 'Рекомендации', data: labels.map(l => byDate[l].recs), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: .3, fill: true }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } }, scales: { y: { beginAtZero: true, ticks: { color: '#2e1065' } }, x: { ticks: { color: '#2e1065' } } } }
    });
}

export function buildTable() {
    const tbody = document.getElementById('tableBody');
    const rows = state.filteredData.slice(0, 300);
    tbody.innerHTML = rows.map(r => {
        const badgeClass = r.result === 'Ошибка' ? 'badge-error' : r.result === 'Рекомендация' ? 'badge-rec' : 'badge-ok';
        const link = r.result === 'Рекомендация'
            ? (r._linked ? '<span class="badge badge-linked">связано</span>' : '<span class="badge" style="background:#fee2e2;color:#ef4444">нет пары</span>')
            : '';
        const fileName = r.fileName ? escapeHtml(r.fileName.slice(0, 40)) : '';
        const fileNameTitle = escapeHtml(r.fileName || '');
        const comment = r.comment ? escapeHtml(r.comment.slice(0, 60)) : '';
        const commentTitle = escapeHtml(r.comment || '');
        return `<tr>
            <td>${r.date ? formatDate(r.date) : ''}</td>
            <td>${escapeHtml(r.project || '')}</td>
            <td>${escapeHtml(r.pool || '')}</td>
            <td>${escapeHtml(r.marker || '')}</td>
            <td title="${fileNameTitle}">${fileName}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(r.result || '')}</span></td>
            <td>${escapeHtml(r.errorType || '')}</td>
            <td title="${commentTitle}">${comment}</td>
            <td>${escapeHtml(r.interval || '')}</td>
            <td>${r.quality !== null && !isNaN(r.quality) ? (r.quality * 100).toFixed(1) + '%' : ''}</td>
            <td>${link}</td>
        </tr>`;
    }).join('');
}

export function renderErrorsTable() {
    const tbody = document.getElementById('errorsTableBody');
    const from = document.getElementById('errFilterDateFrom').value;
    const to = document.getElementById('errFilterDateTo').value;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (toDate) toDate.setDate(toDate.getDate() + 1);

    const filtered = state.processedData.filter(r => {
        if (r._type !== 'validation') return false;
        if (!matchesTab(r)) return false;
        if (fromDate && r.date && r.date < fromDate) return false;
        if (toDate && r.date && r.date >= toDate) return false;
        return true;
    });

    const markerStats = {};
    const processedFiles = new Set();

    for (const r of filtered) {
        if (!r.marker) continue;
        if (!markerStats[r.marker]) markerStats[r.marker] = { totalErrors: 0, totalFragments: 0, errorTypes: {} };
        const fileKey = r.marker + '|' + r.fileName + '|' + r.fragments;
        if (!processedFiles.has(fileKey)) {
            processedFiles.add(fileKey);
            markerStats[r.marker].totalFragments += (r.fragments || 0);
        }
        if (r.result === 'Ошибка') {
            markerStats[r.marker].totalErrors++;
            const type = r.errorType || 'Неизвестная';
            if (!markerStats[r.marker].errorTypes[type]) markerStats[r.marker].errorTypes[type] = { count: 0, pools: {} };
            markerStats[r.marker].errorTypes[type].count++;
            const pool = r.pool || 'Неизвестный пул';
            if (!markerStats[r.marker].errorTypes[type].pools[pool]) markerStats[r.marker].errorTypes[type].pools[pool] = { count: 0, comments: [] };
            markerStats[r.marker].errorTypes[type].pools[pool].count++;
            if (r.comment) markerStats[r.marker].errorTypes[type].pools[pool].comments.push(r.comment);
        }
    }

    let html = '';
    const sortedMarkers = Object.keys(markerStats).filter(m => markerStats[m].totalErrors > 0).sort();

    sortedMarkers.forEach((marker, mIdx) => {
        const stats = markerStats[marker];
        const rate = stats.totalFragments > 0 ? (stats.totalErrors / stats.totalFragments) * 100 : 0;
        const markerId = `m_${mIdx}`;
        html += `<tr class="expandable-row l1-row" onclick="toggleRow('${markerId}_details', this, event)">
            <td><span class="toggle-icon">▶</span> <b>${escapeHtml(marker)}</b></td>
            <td><b>${rate.toFixed(2)}%</b> <span style="font-weight:normal;color:var(--muted)">(${stats.totalErrors} из ${stats.totalFragments})</span></td>
        </tr>`;

        let l2Html = '';
        const sortedTypes = Object.keys(stats.errorTypes).sort((a, b) => stats.errorTypes[b].count - stats.errorTypes[a].count);
        sortedTypes.forEach((type, tIdx) => {
            const typeData = stats.errorTypes[type];
            const typeRate = (typeData.count / stats.totalErrors) * 100;
            const typeId = `${markerId}_t_${tIdx}`;
            l2Html += `<tr class="expandable-row l2-row" id="${typeId}" onclick="toggleRow('${typeId}_details', this, event)">
                <td style="padding-left: 30px;"><span class="toggle-icon">▶</span> ${escapeHtml(type)}</td>
                <td>${typeRate.toFixed(2)}% <span style="color:var(--muted)">(${typeData.count})</span></td>
            </tr>`;
            let l3Html = '';
            const sortedPools = Object.keys(typeData.pools).sort((a, b) => typeData.pools[b].count - typeData.pools[a].count);
            sortedPools.forEach((pool, pIdx) => {
                const poolData = typeData.pools[pool];
                const poolRate = (poolData.count / typeData.count) * 100;
                const poolId = `${typeId}_p_${pIdx}`;
                l3Html += `<tr class="expandable-row l3-row" id="${poolId}" onclick="toggleRow('${poolId}_details', this, event)">
                    <td style="padding-left: 60px;"><span class="toggle-icon">▶</span> ${escapeHtml(pool)}</td>
                    <td>${poolRate.toFixed(2)}% <span style="color:var(--muted)">(${poolData.count})</span></td>
                </tr>`;
                let commentsHtml = poolData.comments.map(c => `<li>${escapeHtml(c)}</li>`).join('');
                if (!commentsHtml) commentsHtml = '<li>Нет комментариев</li>';
                l3Html += `<tr class="details-row" id="${poolId}_details" style="display:none;">
                    <td colspan="2" style="padding-left: 90px; background: #f8fafc;">
                        <ul class="comment-list">${commentsHtml}</ul>
                    </td>
                </tr>`;
            });
            l2Html += `<tr class="details-row" id="${typeId}_details" style="display:none;">
                <td colspan="2" style="padding:0;">
                    <table style="margin:0; box-shadow:none; border:none;"><tbody>${l3Html}</tbody></table>
                </td>
            </tr>`;
        });
        html += `<tr class="details-row" id="${markerId}_details" style="display:none;">
            <td colspan="2" style="padding:0;">
                <table style="margin:0; box-shadow:none; border:none;"><tbody>${l2Html}</tbody></table>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

export function toggleRow(id, rowElement, event) {
    if (event) event.stopPropagation();
    const el = document.getElementById(id);
    if (!el) return;
    const icon = rowElement.querySelector('.toggle-icon');
    const isHidden = el.style.display === 'none' || el.style.display === '' || window.getComputedStyle(el).display === 'none';
    if (isHidden) { el.style.display = 'table-row'; if (icon) icon.classList.add('open'); }
    else { el.style.display = 'none'; if (icon) icon.classList.remove('open'); }
}

// ============================================================
// ============ СТРАНИЦА СУПЕРСЕТ ==============================
// ============================================================

export function renderSupersetPage() {
    renderSupersetFilters();
    renderSupersetKPIs();
    renderSupersetTable1();
    renderSupersetTable2();
    renderSupersetTable3();
    renderSupersetTable4();
}

export function renderSupersetFilters() {
    const dateFromEl = document.getElementById('supersetDateFrom');
    const dateToEl = document.getElementById('supersetDateTo');
    if (dateFromEl) dateFromEl.value = state.superset.filters.dateFrom || '';
    if (dateToEl) dateToEl.value = state.superset.filters.dateTo || '';

    const tasksSet = new Set();
    for (const r of state.superset.table1) if (r.task) tasksSet.add(r.task);
    for (const r of state.superset.table2) if (r.task) tasksSet.add(r.task);
    const tasks = Array.from(tasksSet).sort();

    const taskOptions = document.getElementById('msSupersetTask_options');
    if (taskOptions) {
        for (const t of Array.from(state.superset.filters.tasks)) {
            if (!tasks.includes(t)) state.superset.filters.tasks.delete(t);
        }
        taskOptions.innerHTML = tasks.map(t => {
            const safe = escapeHtml(t);
            const checked = state.superset.filters.tasks.has(t) ? 'checked' : '';
            return `<label class="ms-item"><input type="checkbox" value="${safe}" onchange="onSupersetTaskChange(this.value, this.checked)" ${checked}><span style="word-break: break-word;" title="${safe}">${safe}</span></label>`;
        }).join('');
    }
    updateSupersetTaskLabel();
}

export function updateSupersetTaskLabel() {
    const label = document.getElementById('msSupersetTask_label');
    if (!label) return;
    const count = state.superset.filters.tasks.size;
    if (count === 0) {
        label.textContent = 'Все задачи';
        label.classList.add('empty');
    } else if (count === 1) {
        label.textContent = Array.from(state.superset.filters.tasks)[0];
        label.classList.remove('empty');
    } else {
        label.textContent = 'Выбрано: ' + count;
        label.classList.remove('empty');
    }
}

export function onSupersetTaskChange(value, isChecked) {
    if (isChecked) state.superset.filters.tasks.add(value);
    else state.superset.filters.tasks.delete(value);
    updateSupersetTaskLabel();
    applySupersetFilters();
    renderSupersetPage();
}

export function onSupersetDateChange() {
    state.superset.filters.dateFrom = document.getElementById('supersetDateFrom').value;
    state.superset.filters.dateTo = document.getElementById('supersetDateTo').value;
    applySupersetFilters();
    renderSupersetPage();
}

export function resetSupersetFilters() {
    state.superset.filters.dateFrom = '';
    state.superset.filters.dateTo = '';
    state.superset.filters.tasks.clear();
    state.superset.tableFilters = { t1: {}, t2: {}, t3: {}, t4: {} };

    const df = document.getElementById('supersetDateFrom');
    const dt = document.getElementById('supersetDateTo');
    if (df) df.value = '';
    if (dt) dt.value = '';
    document.querySelectorAll('#msSupersetTask_options input').forEach(cb => { cb.checked = false; });
    updateSupersetTaskLabel();

    applySupersetFilters();
    renderSupersetPage();
}

export function editSupersetNorm() {
    const today = new Date().toISOString().slice(0, 10);
    const currentNorm = getNormForDate(today);
    const input = prompt('Введите новое значение нормы у.е. в час:', String(currentNorm));
    if (input === null) return;
    const num = parseFloat(input);
    if (isNaN(num) || num <= 0) {
        alert('Введите положительное число');
        return;
    }
    if (addNormEntry(today, num)) {
        applySupersetFilters();
        renderSupersetPage();
    }
}

export function renderSupersetKPIs() {
    const container = document.getElementById('supersetKpis');
    if (!container) return;
    const k = state.superset.kpis || {};

    const { dateFrom, dateTo } = state.superset.filters;
    const norms = getNormsForPeriod(dateFrom, dateTo);

    let normValuesHtml = '';
    if (norms.length === 1) {
        normValuesHtml = `<div class="value">${norms[0].value.toFixed(0)}</div>`;
    } else {
        normValuesHtml = '<div class="norm-values-multi">';
        for (const n of norms) {
            normValuesHtml += `<div class="norm-value-item">
                <div class="value">${n.value.toFixed(0)}</div>
                ${n.label ? `<div class="norm-label">${escapeHtml(n.label)}</div>` : ''}
            </div>`;
        }
        normValuesHtml += '</div>';
    }

    const normCard = `<div class="kpi-card">
        <button class="norm-edit-btn" onclick="editSupersetNorm()" title="Редактировать">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <div class="label">Норма у.е. в час</div>
        ${normValuesHtml}
    </div>`;

    const otherCards = [
        { label: 'Цена', value: k.avgPrice != null ? k.avgPrice.toFixed(2) : '—' },
        { label: 'Качество факт', value: k.qualityFact != null ? (k.qualityFact * 100).toFixed(1) + '%' : '—' },
        { label: 'Качество план', value: k.qualityPlan != null ? k.qualityPlan.toFixed(1) + '%' : '—' },
        { label: 'Факт у.е. в час', value: k.ballsPerHour != null ? k.ballsPerHour.toFixed(1) : '—' },
        { label: 'Коэффициент', value: k.prodPerHour != null ? k.prodPerHour.toFixed(2) : '—' },
        { label: 'Среднее время разметки', value: k.avgTime != null ? k.avgTime.toFixed(1) + ' мин' : '—' }
    ];

    container.innerHTML = normCard + otherCards.map(c => `
        <div class="kpi-card">
            <div class="label">${escapeHtml(c.label)}</div>
            <div class="value">${escapeHtml(c.value)}</div>
        </div>
    `).join('');
}

// ===== Фильтры столбцов =====
function renderTableFilters(tableId, configs, fullRows) {
    return configs.map(cfg => {
        const values = new Set();
        for (const r of fullRows) {
            const v = cfg.get(r) || '';
            if (v !== '') values.add(v);
        }
        const sorted = Array.from(values).sort();

        const sel = (state.superset.tableFilters[tableId] && state.superset.tableFilters[tableId][cfg.key]) || new Set();
        const cnt = sel.size;
        const label = cnt === 0 ? 'Все' : (cnt === 1 ? Array.from(sel)[0] : 'Выбрано: ' + cnt);
        const emptyCls = cnt === 0 ? 'empty' : '';

        const id = `ms-${tableId}-${cfg.key}`;

        const optionsHtml = sorted.map(v => {
            const safe = escapeHtml(String(v));
            const checked = sel.has(v) ? 'checked' : '';
            return `<label class="ms-item ms-item-compact"><input type="checkbox" value="${safe}" onchange="onSupersetTableFilterChange('${tableId}', '${cfg.key}', this.value, this.checked)" ${checked}><span style="word-break: break-word;" title="${safe}">${safe}</span></label>`;
        }).join('');

        return `<th style="padding: 4px 6px;">
            <div class="multi-select ms-compact" id="${id}">
                <div class="ms-header ms-header-compact" onclick="toggleDropdown('${id}')">
                    <span class="ms-label ${emptyCls}" id="${id}_label">${escapeHtml(label)}</span>
                    <span class="ms-arrow">▼</span>
                </div>
                <div class="ms-dropdown ms-dropdown-compact" id="${id}_dropdown">
                    <input type="text" class="ms-search" placeholder="Поиск..." onkeyup="filterMsOptions(this)">
                    <div>${optionsHtml || '<div class="ms-item" style="color:var(--muted);cursor:default;padding:8px;">Нет данных</div>'}</div>
                </div>
            </div>
        </th>`;
    }).join('');
}

export function onSupersetTableFilterChange(tableId, colKey, value, isChecked) {
    if (!state.superset.tableFilters[tableId]) state.superset.tableFilters[tableId] = {};
    if (!state.superset.tableFilters[tableId][colKey]) state.superset.tableFilters[tableId][colKey] = new Set();
    const set = state.superset.tableFilters[tableId][colKey];
    if (isChecked) set.add(value);
    else set.delete(value);

    const id = `ms-${tableId}-${colKey}`;
    const label = document.getElementById(id + '_label');
    if (label) {
        const cnt = set.size;
        if (cnt === 0) {
            label.textContent = 'Все';
            label.classList.add('empty');
        } else if (cnt === 1) {
            label.textContent = Array.from(set)[0];
            label.classList.remove('empty');
        } else {
            label.textContent = 'Выбрано: ' + cnt;
            label.classList.remove('empty');
        }
    }

    applySupersetFilters();
    renderSupersetPage();
}

function renderSupersetTable1() {
    const tbody = document.getElementById('supersetTable1Body');
    const filtersRow = document.getElementById('supersetTable1Filters');
    if (!tbody) return;

    const configs = getTable1Config();
    if (filtersRow) {
        filtersRow.innerHTML = renderTableFilters('t1', configs, state.superset.table1 || []);
    }

    const rows = state.superset.filteredTable1 || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; color: var(--muted);">Нет данных.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${escapeHtml(r.project)}</td>
        <td>${escapeHtml(r.task)}</td>
        <td>${escapeHtml(String(r.fragments))}</td>
        <td>${escapeHtml(String(r.normQuality))}</td>
        <td>${escapeHtml(String(r.quality))}</td>
        <td>${escapeHtml(String(r.comment))}</td>
        <td>${escapeHtml(String(r.withoutQuality))}</td>
        <td>${escapeHtml(String(r.ballsPerHour))}</td>
        <td>${escapeHtml(String(r.prodPerHour))}</td>
        <td>${escapeHtml(String(r.price))}</td>
        <td>${escapeHtml(String(r.taskType))}</td>
        <td>${escapeHtml(formatPeriod(r.dateStart, r.dateEnd))}</td>
    </tr>`).join('');
}

function renderSupersetTable2() {
    const tbody = document.getElementById('supersetTable2Body');
    const filtersRow = document.getElementById('supersetTable2Filters');
    if (!tbody) return;

    const configs = getTable2Config();
    if (filtersRow) {
        filtersRow.innerHTML = renderTableFilters('t2', configs, state.superset.table2 || []);
    }

    const rows = state.superset.filteredTable2 || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--muted);">Нет данных.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${r.date ? formatDate(r.date) : ''}</td>
        <td>${escapeHtml(r.fio)}</td>
        <td>${escapeHtml(r.project)}</td>
        <td>${escapeHtml(r.task)}</td>
        <td>${escapeHtml(String(r.fragments))}</td>
        <td>${escapeHtml(String(r.balls))}</td>
        <td>${escapeHtml(String(r.qualitySuperset))}</td>
        <td>${r.qualityFact != null ? (r.qualityFact * 100).toFixed(1) + '%' : '—'}</td>
        <td>${escapeHtml(String(r.norm))}</td>
        <td>${escapeHtml(String(r.withoutQuality))}</td>
    </tr>`).join('');
}

function renderSupersetTable3() {
    const tbody = document.getElementById('supersetTable3Body');
    const filtersRow = document.getElementById('supersetTable3Filters');
    if (!tbody) return;

    const configs = getTable3Config();
    if (filtersRow) {
        filtersRow.innerHTML = renderTableFilters('t3', configs, state.superset.table3 || []);
    }

    const rows = state.superset.filteredTable3 || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted);">Нет данных.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${r.date ? formatDate(r.date) : ''}</td>
        <td>${escapeHtml(r.project)}</td>
        <td>${escapeHtml(String(r.price))}</td>
    </tr>`).join('');
}

function renderSupersetTable4() {
    const tbody = document.getElementById('supersetTable4Body');
    const filtersRow = document.getElementById('supersetTable4Filters');
    if (!tbody) return;

    const configs = getTable4Config();
    if (filtersRow) {
        filtersRow.innerHTML = renderTableFilters('t4', configs, state.superset.table4 || []);
    }

    const rows = state.superset.filteredTable4 || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted);">Нет данных.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${escapeHtml(r.fio)}</td>
        <td>${r.factQuality != null ? (r.factQuality * 100).toFixed(1) + '%' : '—'}</td>
        <td>${r.normQuality != null ? r.normQuality.toFixed(1) + '%' : '—'}</td>
    </tr>`).join('');
}
