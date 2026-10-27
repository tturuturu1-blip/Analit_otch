// js/ui.js — ЧИСТКА КОДА
// Удалено: toggleRow (не используется)

import { state, ITEMS_PER_PAGE } from './state.js';
import { applyFilters, matchesTab } from './data.js';
import { formatDate, updateLabel, escapeHtml, destroyChart, getVal, getValidationUrl } from './utils.js';
import { renderFeedbackTable, renderFeedbackTableHome } from './feedback.js';
import {
    applySupersetFilters, formatPeriod, getNormForDate, getNormsForPeriod,
    addNormEntry, getTable1Config, getTable2Config, getTable3Config, getTable4Config
} from './superset.js';

const CHART_COLORS = ['#f9d7d7', '#fce4c8', '#e1d9f9', '#d3e9fb', '#d4ebd9'];

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
    if (menuId === 'feedback') {
        renderFeedbackTable();
        state.pagination.fbTable = 1;
    }
    if (menuId === 'superset') {
        applySupersetFilters();
        renderSupersetPage();
    }
}

export function switchTab(tabId, btn) {
    state.currentTab = tabId;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    state.pagination.mainData = 1;
    state.pagination.fbHome = 1;
    state.pagination.fbTable = 1;
    state.pagination.superset1 = 1;
    state.pagination.superset2 = 1;
    state.pagination.superset3 = 1;
    state.pagination.superset4 = 1;

    if (state.currentMenu === 'main') triggerFilterUpdate();
    if (state.currentMenu === 'errors') renderErrorsTable();
    if (state.currentMenu === 'feedback') renderFeedbackTable();
    if (state.currentMenu === 'superset') {
        applySupersetFilters();
        renderSupersetPage();
    }
}

export function buildProjectTabs() {
    const tabsContainer = document.getElementById('projectTabs');
    if (!tabsContainer) return;

    const projectSet = new Set();
    for (const r of state.processedData) {
        if (!r.project) continue;
        const name = String(r.project).replace(/_validate$/, '').trim();
        if (name) projectSet.add(name);
    }

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
        if (projectSet.has(parent)) projectSet.add(sp);
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
        + '<span style="color:var(--success)">✅ ' + withVal + '</span>'
        + '<span style="color:var(--danger)">❌ ' + withoutVal + '</span>'
        + '<span style="margin-left:auto; color:var(--muted)">Всего задач: ' + tasks.length + '</span>'
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
    if (stateKey !== 'feedbackPool' && stateKey !== 'fbFormPools' && stateKey !== 'feedbackGroup') triggerFilterUpdate();
}

export function onOptionChange(containerId, stateKey, value, isChecked) {
    if (isChecked) state.filterState[stateKey].add(value);
    else state.filterState[stateKey].delete(value);
    const allCheckbox = document.getElementById(containerId + '_all');
    const checkboxes = document.querySelectorAll('#' + containerId + '_options input[type="checkbox"]');
    allCheckbox.checked = Array.from(checkboxes).every(cb => cb.checked);
    updateLabel(containerId, stateKey);
    if (stateKey !== 'feedbackPool' && stateKey !== 'fbFormPools' && stateKey !== 'feedbackGroup') triggerFilterUpdate();
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

export function populateRecDatalists() {
    const projects = new Set();
    const pools = new Set();
    const markers = new Set();
    const validators = new Set();

    for (const r of state.processedData) {
        if (r.project) {
            const p = r.project.replace(/_validate$/, '').trim();
            if (p) projects.add(p);
        }
        if (r.pool) pools.add(r.pool);
        if (r.marker) markers.add(r.marker);
        if (r.validator) validators.add(r.validator);
    }

    const fill = (id, set) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = Array.from(set).sort().map(v => `<option value="${escapeHtml(v)}">`).join('');
    };

    fill('recProjectsList', projects);
    fill('recPoolsList', pools);
    fill('recMarkersList', markers);
    fill('recValidatorsList', validators);
}

// ===== ПАГИНАЦИЯ =====
export function changePage(tableKey, page) {
    state.pagination[tableKey] = page;
    if (tableKey === 'mainData') buildTable();
    else if (tableKey === 'superset1') renderSupersetTable1();
    else if (tableKey === 'superset2') renderSupersetTable2();
    else if (tableKey === 'superset3') renderSupersetTable3();
    else if (tableKey === 'superset4') renderSupersetTable4();
    else if (tableKey === 'fbHome' || tableKey === 'fbTable') {
        if (window.renderFeedbackTableHome) window.renderFeedbackTableHome();
        if (window.renderFeedbackTable) window.renderFeedbackTable();
    }
}

function renderPaginationControls(controlsId, infoId, totalItems, tableKey) {
    const container = document.getElementById(controlsId);
    const info = document.getElementById(infoId);
    if (!container || !info) return;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    let currentPage = state.pagination[tableKey] || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    state.pagination[tableKey] = currentPage;

    const start = totalItems === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
    info.textContent = totalItems === 0 ? 'Показано 0 из 0' : `Показано ${start}-${end} из ${totalItems}`;

    let html = '';
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage('${tableKey}', ${currentPage - 1})">&lt;</button>`;
    
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
            if (i === 3) html += `<span style="padding: 0 5px; color: var(--muted); align-self: center;">...</span>`;
            continue;
        }
        html += `<button class="page-btn ${currentPage === i ? 'active' : ''}" onclick="changePage('${tableKey}', ${i})">${i}</button>`;
    }
    
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage('${tableKey}', ${currentPage + 1})">&gt;</button>`;

    container.innerHTML = html;
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
        const fileKey = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '') + '|' + r.fragments;
        if (!uniqueFiles.has(fileKey)) {
            uniqueFiles.add(fileKey);
            totalFragments += (r.fragments || 0);
        }
    }

    const uniqueMarkers = new Set();
    let weightedErrorsCount = 0;
    const qualityKeys = new Set();
    let qualitySum = 0, qualityCount = 0;

    for (const r of state.filteredData) {
        if (r.marker) uniqueMarkers.add(r.marker);
        
        if (r.result === 'Ошибка') {
            const weight = r.errorType === 'Некритичная ошибка' ? 0.5 : 1;
            weightedErrorsCount += weight;
        }
        
        if (r.quality != null && isFinite(r.quality)) {
            const key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
            if (!qualityKeys.has(key)) {
                qualityKeys.add(key);
                qualitySum += r.quality;
                qualityCount++;
            }
        }
    }

    const errorPercent = totalFragments > 0 ? (weightedErrorsCount / totalFragments) * 100 : 0;
    const avgQ = qualityCount ? qualitySum / qualityCount : null;
    const avgQPct = avgQ !== null ? avgQ * 100 : 0;
    
    const target = state.superset.norms.globalAvg;

    const elTotalFragments = document.getElementById('kpiTotalFragments');
    const elTotalMarkers = document.getElementById('kpiTotalMarkers');
    const elErrorsPercent = document.getElementById('kpiErrorsPercent');
    const elQuality = document.getElementById('kpiQuality');
    const elTargetQuality = document.getElementById('kpiTargetQuality');

    elTotalFragments.textContent = totalFragments;
    elTotalMarkers.textContent = uniqueMarkers.size;
    elErrorsPercent.textContent = errorPercent.toFixed(2) + '%';
    elQuality.textContent = avgQ !== null ? avgQPct.toFixed(1) + '%' : '—';
    elTargetQuality.textContent = target != null ? target.toFixed(1) + '%' : '—';

    [elTotalFragments, elTotalMarkers, elErrorsPercent, elQuality, elTargetQuality].forEach(el => {
        if (el) el.classList.remove('val-brown', 'val-red', 'val-green');
    });

    if (elTotalFragments) elTotalFragments.classList.add('val-brown');
    if (elTotalMarkers) elTotalMarkers.classList.add('val-brown');
    if (elTargetQuality) elTargetQuality.classList.add('val-brown');

    const isRed = (target != null) && (errorPercent > 5) && (avgQPct < target);
    const isGreen = (target != null) && (errorPercent <= 5) && (avgQPct >= target);

    if (isRed) {
        if (elErrorsPercent) elErrorsPercent.classList.add('val-red');
        if (elQuality) elQuality.classList.add('val-red');
    } else if (isGreen) {
        if (elErrorsPercent) elErrorsPercent.classList.add('val-green');
        if (elQuality) elQuality.classList.add('val-green');
    } else {
        if (elErrorsPercent) elErrorsPercent.classList.add('val-brown');
        if (elQuality) elQuality.classList.add('val-brown');
    }
}

function targetLinesForLabels(labels) {
    const target = state.superset.norms.globalAvg;
    if (target != null) {
        return [{ label: 'Целевое (суперсет)', data: Array(labels.length).fill(target), type: 'line', borderDash: [5, 5], borderColor: '#1f1f1f', borderWidth: 2, pointRadius: 0, order: 1 }];
    }
    return [];
}

export function buildQualityChart() {
    destroyChart(state.charts.quality);
    const byMarker = {};
    const qualityKeys = new Set();
    for (const r of state.filteredData) {
        if (r.marker && r.quality != null && isFinite(r.quality)) {
            const key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
            if (!qualityKeys.has(key)) {
                qualityKeys.add(key);
                (byMarker[r.marker] = byMarker[r.marker] || []).push(r.quality);
            }
        }
    }
    const labels = Object.keys(byMarker).sort();
    const values = labels.map(m => (byMarker[m].reduce((a, b) => a + b, 0) / byMarker[m].length) * 100);
    const datasets = [
        { label: 'Ср. качество, %', data: values, backgroundColor: '#d4ebd9', borderRadius: 8, order: 2 },
        ...targetLinesForLabels(labels)
    ];
    state.charts.quality = new Chart(document.getElementById('chartQuality'), {
        type: 'bar',
        data: { labels: labels.map(l => l.length > 25 ? l.slice(0, 22) + '…' : l), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#1f1f1f' } } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: '#f0f0f0' }, ticks: { callback: v => v + '%', color: '#7a7a7a' } }, x: { grid: { display: false }, ticks: { color: '#7a7a7a' } } } }
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
        data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#1f1f1f' } } } }
    });
}

export function buildPoolQualityChart() {
    destroyChart(state.charts.poolQuality);
    const byPool = {};
    const qualityKeys = new Set();
    for (const r of state.filteredData) {
        if (r.pool && r.quality != null && isFinite(r.quality)) {
            const key = (r.pool || '') + '|' + (r.marker || '') + '|' + (r.project || '') + '|' + (r.fileName || '');
            if (!qualityKeys.has(key)) {
                qualityKeys.add(key);
                (byPool[r.pool] = byPool[r.pool] || []).push(r.quality);
            }
        }
    }
    const labels = Object.keys(byPool).sort();
    const values = labels.map(p => (byPool[p].reduce((a, b) => a + b, 0) / byPool[p].length) * 100);
    const datasets = [
        { label: 'Ср. качество, %', data: values, backgroundColor: '#d3e9fb', borderRadius: 8, order: 2 },
        ...targetLinesForLabels(labels)
    ];
    state.charts.poolQuality = new Chart(document.getElementById('chartPoolQuality'), {
        type: 'bar',
        data: { labels: labels.map(l => l.length > 30 ? l.slice(0, 27) + '…' : l), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#1f1f1f' } } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: '#f0f0f0' }, ticks: { callback: v => v + '%', color: '#7a7a7a' } }, x: { grid: { display: false }, ticks: { color: '#7a7a7a' } } } }
    });
}

export function buildDayQualityChart() {
    destroyChart(state.charts.dayQuality);
    const byDate = {};
    const qualityKeys = new Set();
    for (const r of state.filteredData) {
        if (r.date && r.quality != null && isFinite(r.quality)) {
            const k = formatDate(r.date);
            const key = k + '|' + (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
            if (!qualityKeys.has(key)) {
                qualityKeys.add(key);
                (byDate[k] = byDate[k] || []).push(r.quality);
            }
        }
    }
    const labels = Object.keys(byDate).sort((a, b) =>
        a.split('.').reverse().join('-').localeCompare(b.split('.').reverse().join('-')));
    const values = labels.map(d => (byDate[d].reduce((a, b) => a + b, 0) / byDate[d].length) * 100);

    const target = state.superset.norms.globalAvg;
    const datasets = [
        { label: 'Ср. качество, %', data: values, borderColor: '#1f1f1f', backgroundColor: 'rgba(31, 31, 31, 0.05)', tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderWidth: 2, order: 2 }
    ];
    if (target != null) {
        datasets.push({ label: 'Целевое качество (суперсет)', data: labels.map(() => target), borderColor: '#e55555', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, order: 1 });
    }

    state.charts.dayQuality = new Chart(document.getElementById('chartDayQuality'), {
        type: 'line',
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#1f1f1f' } } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: '#f0f0f0' }, ticks: { callback: v => v + '%', color: '#7a7a7a' } }, x: { grid: { display: false }, ticks: { color: '#7a7a7a' } } } }
    });
}

export function buildErrorsByMarkerChart() {
    destroyChart(state.charts.errorsByMarker);
    const markers = [...new Set(state.filteredData.map(r => r.marker).filter(Boolean))].sort();
    const errorTypes = [...new Set(state.filteredData.map(r => r.errorType).filter(Boolean))].sort();
    
    const datasets = errorTypes.map((type, idx) => ({
        label: type,
        data: markers.map(m => state.filteredData.filter(r => r.marker === m && r.errorType === type).length),
        backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
        borderRadius: 4
    }));
    
    state.charts.errorsByMarker = new Chart(document.getElementById('chartErrorsByMarker'), {
        type: 'bar',
        data: { labels: markers.map(m => m.length > 20 ? m.slice(0, 18) + '…' : m), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#1f1f1f' } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: '#7a7a7a' } }, y: { stacked: true, beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { color: '#7a7a7a' } } } }
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
            { label: 'Ошибки', data: labels.map(l => byDate[l].errors), borderColor: '#e55555', backgroundColor: 'rgba(229, 85, 85, 0.1)', tension: .4, fill: true },
            { label: 'Рекомендации', data: labels.map(l => byDate[l].recs), borderColor: '#FFC107', backgroundColor: 'rgba(255, 193, 7, 0.1)', tension: .4, fill: true }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#1f1f1f' } } }, scales: { y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { color: '#7a7a7a' } }, x: { grid: { display: false }, ticks: { color: '#7a7a7a' } } } }
    });
}

export function buildTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const grouped = {};
    for (const r of state.filteredData) {
        const key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
        if (!grouped[key]) {
            grouped[key] = {
                date: r.date,
                project: r.project,
                pool: r.pool,
                marker: r.marker,
                fileName: r.fileName,
                quality: r.quality,
                fragments: r.fragments,
                url: r.url,
                orgId: r.orgId,
                assignmentId: r.assignmentId,
                itemId: r.itemId,
                _type: r._type,
                _linked: r._linked,
                items: []
            };
        }
        if (r.result === 'Ошибка' || r.result === 'Рекомендация') {
            grouped[key].items.push({
                result: r.result,
                errorType: r.errorType,
                comment: r.comment,
                interval: r.interval
            });
        } else if (r.result === 'Ошибки не выявлены' && grouped[key].items.length === 0) {
            grouped[key].items.push({
                result: r.result,
                errorType: r.errorType,
                comment: r.comment,
                interval: r.interval
            });
        }
    }

    const groupedArray = Object.values(grouped);
    const totalItems = groupedArray.length;
    const currentPage = state.pagination.mainData;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const rows = groupedArray.slice(startIndex, endIndex);

    tbody.innerHTML = rows.map(g => {
        let valLink = '—';
        let hasLink = false;
        let linkUrl = '';

        if (g.url) {
            linkUrl = g.url;
            hasLink = true;
        } else if (g._type === 'validation' && g.orgId && g.assignmentId && g.itemId) {
            linkUrl = getValidationUrl(g.orgId, g.assignmentId, g.itemId);
            if (linkUrl) hasLink = true;
        }

        if (hasLink) {
            valLink = `<a href="${linkUrl}" target="_blank" class="badge-link">Перейти</a>`;
        }

        const fileName = g.fileName ? escapeHtml(g.fileName.slice(0, 40)) : '';
        const fileNameTitle = escapeHtml(g.fileName || '');
        
        const resBadges = g.items.map(item => {
            const badgeClass = item.result === 'Ошибка' ? 'badge-error' : item.result === 'Рекомендация' ? 'badge-rec' : 'badge-ok';
            return `<span class="badge ${badgeClass}" style="margin-bottom: 4px; display: inline-block;">${escapeHtml(item.result || '')}</span>`;
        }).join('<br>');

        const errTypes = g.items.map(item => escapeHtml(item.errorType || '')).join('<br>');
        const comments = g.items.map(item => {
            const c = item.comment ? escapeHtml(item.comment.slice(0, 100)) : '';
            return c ? `<span title="${escapeHtml(item.comment)}">${c}</span>` : '';
        }).join('<br>');
        const intervals = g.items.map(item => escapeHtml(item.interval || '')).join('<br>');

        const link = g._type === 'recommendations'
            ? (g._linked ? '<span class="badge badge-linked">связано</span>' : '<span class="badge" style="background:#fde8e8;color:#e55555">нет пары</span>')
            : '—';

        return `<tr>
            <td>${g.date ? formatDate(g.date) : ''}</td>
            <td>${escapeHtml(g.project || '')}</td>
            <td>${escapeHtml(g.pool || '')}</td>
            <td>${escapeHtml(g.marker || '')}</td>
            <td title="${fileNameTitle}">${fileName}</td>
            <td style="vertical-align: top;">${resBadges}</td>
            <td style="vertical-align: top;">${errTypes}</td>
            <td style="vertical-align: top;">${comments}</td>
            <td style="vertical-align: top;">${intervals}</td>
            <td>${g.quality !== null && !isNaN(g.quality) ? (g.quality * 100).toFixed(1) + '%' : ''}</td>
            <td>${valLink}</td>
            <td>${link}</td>
        </tr>`;
    }).join('');

    renderPaginationControls('pagination-data-controls', 'pagination-data-info', totalItems, 'mainData');
}

// ============================================================
// ============ СТРАНИЦА "ТОП ОШИБОК" (КАРТОЧКИ) ==============
// ============================================================

export function renderErrorsTable() {
    const container = document.getElementById('errorsCardsContainer');
    if (!container) return;

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
    
    for (const r of filtered) {
        if (!r.marker) continue;
        if (!markerStats[r.marker]) {
            markerStats[r.marker] = { 
                totalErrors: 0, 
                totalFragments: 0, 
                errorTypes: {},
                projectQuality: {} 
            };
        }
        
        const fileKey = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '') + '|' + r.fragments;
        if (!markerStats[r.marker]._files) markerStats[r.marker]._files = new Set();
        if (!markerStats[r.marker]._files.has(fileKey)) {
            markerStats[r.marker]._files.add(fileKey);
            markerStats[r.marker].totalFragments += (r.fragments || 0);
        }

        if (r.project && r.quality != null && isFinite(r.quality)) {
            if (!markerStats[r.marker].projectQuality[r.project]) {
                markerStats[r.marker].projectQuality[r.project] = new Set();
            }
            markerStats[r.marker].projectQuality[r.project].add(r.fileName);
        }

        if (r.result === 'Ошибка') {
            const weight = r.errorType === 'Некритичная ошибка' ? 0.5 : 1;
            markerStats[r.marker].totalErrors += weight;
            
            const type = r.errorType || 'Неизвестная';
            if (!markerStats[r.marker].errorTypes[type]) {
                markerStats[r.marker].errorTypes[type] = { count: 0, pools: {} };
            }
            markerStats[r.marker].errorTypes[type].count += weight;
            
            const pool = r.pool || 'Неизвестный пул';
            if (!markerStats[r.marker].errorTypes[type].pools[pool]) {
                markerStats[r.marker].errorTypes[type].pools[pool] = { count: 0, comments: [] };
            }
            markerStats[r.marker].errorTypes[type].pools[pool].count += weight;
            if (r.comment && !markerStats[r.marker].errorTypes[type].pools[pool].comments.includes(r.comment)) {
                markerStats[r.marker].errorTypes[type].pools[pool].comments.push(r.comment);
            }
        }
    }

    const emailToFio = {};
    for (const emp of state.rawEmployeeMap) {
        const email = getVal(emp, 'Почта', 'Почта разметчика', 'Email', 'email');
        const fio = getVal(emp, 'ФИО', 'Фио', 'ФИО разметчика');
        if (email && fio) emailToFio[String(email).trim().toLowerCase()] = String(fio).trim();
    }

    let html = '';
    const sortedMarkers = Object.keys(markerStats).filter(m => markerStats[m].totalErrors > 0).sort();

    if (sortedMarkers.length === 0) {
        container.innerHTML = '<div style="text-align:center; color: var(--muted); padding: 20px;">Нет данных об ошибках за выбранный период.</div>';
        return;
    }

    for (const markerEmail of sortedMarkers) {
        const stats = markerStats[markerEmail];
        const fio = emailToFio[markerEmail.toLowerCase()] || markerEmail;
        const errorRate = stats.totalFragments > 0 ? (stats.totalErrors / stats.totalFragments) * 100 : 0;

        const uniqueFileQuality = {};
        for (const r of filtered) {
            if (r.marker === markerEmail && r.project && r.quality != null && isFinite(r.quality)) {
                uniqueFileQuality[(r.project || '') + '|' + (r.fileName || '')] = r.quality;
            }
        }

        let qualityHtml = '<ul class="project-quality-list">';
        for (const proj in stats.projectQuality) {
            const fileNames = stats.projectQuality[proj];
            let sumQ = 0, cntQ = 0;
            for (const fn of fileNames) {
                if (uniqueFileQuality[proj + '|' + fn] !== undefined) {
                    sumQ += uniqueFileQuality[proj + '|' + fn];
                    cntQ++;
                }
            }
            if (cntQ > 0) {
                qualityHtml += `<li><span>${escapeHtml(proj)}:</span> <strong>${((sumQ/cntQ)*100).toFixed(1)}%</strong></li>`;
            }
        }
        qualityHtml += '</ul>';
        if (Object.keys(stats.projectQuality).length === 0) {
            qualityHtml = '<div style="font-size:0.85rem; color:var(--muted);">Нет данных</div>';
        }

        let typesHtml = '';
        const sortedTypes = Object.keys(stats.errorTypes).sort((a, b) => stats.errorTypes[b].count - stats.errorTypes[a].count);
        
        for (const type of sortedTypes) {
            const typeData = stats.errorTypes[type];
            const typeRate = (typeData.count / stats.totalErrors) * 100;
            
            let poolListHtml = '<ul class="pool-list">';
            const sortedPools = Object.keys(typeData.pools).sort((a, b) => typeData.pools[b].count - typeData.pools[a].count);
            
            for (const pool of sortedPools) {
                const poolData = typeData.pools[pool];
                const poolRate = (poolData.count / typeData.count) * 100;
                const comments = poolData.comments.map(c => `<div class="pool-comment">— ${escapeHtml(c)}</div>`).join('');
                
                poolListHtml += `<li class="pool-item">
                    <div class="pool-header">
                        <span>${escapeHtml(pool)}</span>
                        <span>${poolRate.toFixed(1)}% (${poolData.count})</span>
                    </div>
                    ${comments}
                </li>`;
            }
            poolListHtml += '</ul>';

            typesHtml += `
                <div class="error-type-block">
                    <div class="error-type-header">
                        <span>${escapeHtml(type)}</span>
                    </div>
                    <div class="error-type-rate">${typeRate.toFixed(1)}% от всех ошибок</div>
                    ${poolListHtml}
                </div>
            `;
        }

        html += `
            <div class="marker-card">
                <div class="marker-header">
                    <div class="avatar">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                    <div class="marker-info">
                        <div class="marker-name" title="${escapeHtml(fio)}">${escapeHtml(fio)}</div>
                        <div class="marker-email" title="${escapeHtml(markerEmail)}">${escapeHtml(markerEmail)}</div>
                    </div>
                </div>

                <div class="inner-cards-container">
                    <div class="inner-card">
                        <div class="inner-card-title">Качество по проектам</div>
                        ${qualityHtml}
                    </div>

                    <div class="inner-card">
                        <div class="inner-card-title">Процент ошибок</div>
                        <div class="inner-card-value" style="color: var(--danger);">${errorRate.toFixed(2)}%</div>
                        <div style="font-size: 0.75rem; color: var(--muted); margin-top: 4px;">${stats.totalErrors.toFixed(1)} из ${stats.totalFragments} фрагментов</div>
                    </div>

                    <div class="inner-card">
                        <div class="inner-card-title">Процент ошибок по типам</div>
                        ${typesHtml}
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
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
    
    state.pagination.superset1 = 1;
    state.pagination.superset2 = 1;
    state.pagination.superset3 = 1;
    state.pagination.superset4 = 1;

    applySupersetFilters();
    renderSupersetPage();
}

export function onSupersetDateChange() {
    state.superset.filters.dateFrom = document.getElementById('supersetDateFrom').value;
    state.superset.filters.dateTo = document.getElementById('supersetDateTo').value;
    
    state.pagination.superset1 = 1;
    state.pagination.superset2 = 1;
    state.pagination.superset3 = 1;
    state.pagination.superset4 = 1;

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

    state.pagination.superset1 = 1;
    state.pagination.superset2 = 1;
    state.pagination.superset3 = 1;
    state.pagination.superset4 = 1;

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

    const normCard = `<div class="kpi-card" style="background: var(--card-pink);">
        <button class="norm-edit-btn" onclick="editSupersetNorm()" title="Редактировать">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <div class="label">Норма у.е. в час</div>
        ${normValuesHtml}
    </div>`;

    const otherCards = [
        { label: 'Цена', value: k.avgPrice != null ? k.avgPrice.toFixed(2) : '—', bg: 'var(--card-peach)' },
        { label: 'Качество факт', value: k.qualityFact != null ? (k.qualityFact * 100).toFixed(1) + '%' : '—', bg: 'var(--card-purple)' },
        { label: 'Качество план', value: k.qualityPlan != null ? k.qualityPlan.toFixed(1) + '%' : '—', bg: 'var(--card-blue)' },
        { label: 'Факт у.е. в час', value: k.ballsPerHour != null ? k.ballsPerHour.toFixed(1) : '—', bg: 'var(--card-mint)' },
        { label: 'Коэффициент', value: k.prodPerHour != null ? k.prodPerHour.toFixed(2) : '—', bg: '#f5f5f5' },
        { label: 'Среднее время разметки', value: k.avgTime != null ? k.avgTime.toFixed(1) + ' мин' : '—', bg: '#f5f5f5' }
    ];

    container.innerHTML = normCard + otherCards.map(c => `
        <div class="kpi-card" style="background: ${c.bg};">
            <div class="label">${escapeHtml(c.label)}</div>
            <div class="value">${escapeHtml(c.value)}</div>
        </div>
    `).join('');
}

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

        return `<th style="padding: 8px 10px;">
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

    state.pagination.superset1 = 1;
    state.pagination.superset2 = 1;
    state.pagination.superset3 = 1;
    state.pagination.superset4 = 1;

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

    const allRows = state.superset.filteredTable1 || [];
    const totalItems = allRows.length;
    const currentPage = state.pagination.superset1;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const rows = allRows.slice(startIndex, endIndex);

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; color: var(--muted); padding: 30px;">Нет данных.</td></tr>';
    } else {
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

    renderPaginationControls('pagination-superset1-controls', 'pagination-superset1-info', totalItems, 'superset1');
}

function renderSupersetTable2() {
    const tbody = document.getElementById('supersetTable2Body');
    const filtersRow = document.getElementById('supersetTable2Filters');
    if (!tbody) return;

    const configs = getTable2Config();
    if (filtersRow) {
        filtersRow.innerHTML = renderTableFilters('t2', configs, state.superset.table2 || []);
    }

    const allRows = state.superset.filteredTable2 || [];
    const totalItems = allRows.length;
    const currentPage = state.pagination.superset2;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const rows = allRows.slice(startIndex, endIndex);

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--muted); padding: 30px;">Нет данных.</td></tr>';
    } else {
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

    renderPaginationControls('pagination-superset2-controls', 'pagination-superset2-info', totalItems, 'superset2');
}

function renderSupersetTable3() {
    const tbody = document.getElementById('supersetTable3Body');
    const filtersRow = document.getElementById('supersetTable3Filters');
    if (!tbody) return;

    const configs = getTable3Config();
    if (filtersRow) {
        filtersRow.innerHTML = renderTableFilters('t3', configs, state.superset.table3 || []);
    }

    const allRows = state.superset.filteredTable3 || [];
    const totalItems = allRows.length;
    const currentPage = state.pagination.superset3;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const rows = allRows.slice(startIndex, endIndex);

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted); padding: 30px;">Нет данных.</td></tr>';
    } else {
        tbody.innerHTML = rows.map(r => `<tr>
            <td>${r.date ? formatDate(r.date) : ''}</td>
            <td>${escapeHtml(r.project)}</td>
            <td>${escapeHtml(String(r.price))}</td>
        </tr>`).join('');
    }

    renderPaginationControls('pagination-superset3-controls', 'pagination-superset3-info', totalItems, 'superset3');
}

function renderSupersetTable4() {
    const tbody = document.getElementById('supersetTable4Body');
    const filtersRow = document.getElementById('supersetTable4Filters');
    if (!tbody) return;

    const configs = getTable4Config();
    if (filtersRow) {
        filtersRow.innerHTML = renderTableFilters('t4', configs, state.superset.table4 || []);
    }

    const allRows = state.superset.filteredTable4 || [];
    const totalItems = allRows.length;
    const currentPage = state.pagination.superset4;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const rows = allRows.slice(startIndex, endIndex);

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted); padding: 30px;">Нет данных.</td></tr>';
    } else {
        tbody.innerHTML = rows.map(r => `<tr>
            <td>${escapeHtml(r.fio)}</td>
            <td>${r.factQuality != null ? (r.factQuality * 100).toFixed(1) + '%' : '—'}</td>
            <td>${r.normQuality != null ? r.normQuality.toFixed(1) + '%' : '—'}</td>
        </tr>`).join('');
    }

    renderPaginationControls('pagination-superset4-controls', 'pagination-superset4-info', totalItems, 'superset4');
}
