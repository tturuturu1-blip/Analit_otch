import { state, loadFromStorage, loadFeedbackFromStorage, saveToStorage } from './state.js';
import { recomputeDashboard, readExcelFiles, processNewRows } from './data.js';
import {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll, onOptionChange,
    populateAllMultiSelects, triggerFilterUpdate, renderErrorsTable, toggleRow,
    buildProjectTabs, renderMarkersTasksStatus, renderSupersetPage,
    renderSupersetFilters, renderSupersetKPIs,
    updateSupersetTaskLabel, updateSupersetProjectLabel,
    onSupersetTaskChange, onSupersetProjectChange, onSupersetDateChange,
    resetSupersetFilters, editSupersetNorm, onSupersetTableFilterChange
} from './ui.js';
import { renderFeedbackTable, editFeedback, deleteFeedback, initFeedbackForm } from './feedback.js';
import { buildSuperset, applySupersetFilters } from './superset.js';
import {
    progressStartTimer, updateProgress, yieldToUI, log, formatDate
} from './utils.js';
import { generateHtmlReport } from './report.js';

Object.assign(window, {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll,
    onOptionChange, toggleRow, renderErrorsTable,
    editFeedback, deleteFeedback,
    onSupersetTaskChange,
    onSupersetProjectChange,
    onSupersetDateChange,
    resetSupersetFilters,
    editSupersetNorm,
    onSupersetTableFilterChange
});

const projectTabsContainer = document.getElementById('projectTabs');
if (projectTabsContainer) {
    projectTabsContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;
        switchTab(tabEl.dataset.tab, tabEl);
    });
}

const supersetDateFrom = document.getElementById('supersetDateFrom');
const supersetDateTo = document.getElementById('supersetDateTo');
if (supersetDateFrom) supersetDateFrom.addEventListener('change', onSupersetDateChange);
if (supersetDateTo) supersetDateTo.addEventListener('change', onSupersetDateChange);

window.addEventListener('app:data-updated', () => {
    state.superset.filters.projects.clear();
    state.superset.filters.dateFrom = '';
    state.superset.filters.dateTo = '';
    state.superset.filters.tasks.clear();
    state.superset.tableFilters = { t1: {}, t2: {}, t3: {}, t4: {} };

    buildSuperset();
    populateAllMultiSelects();
    buildProjectTabs();
    renderMarkersTasksStatus();
    triggerFilterUpdate();
    if (state.currentMenu === 'superset') renderSupersetPage();
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
        document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    }
});

for (const id of ['filterDateFrom', 'filterDateTo']) {
    document.getElementById(id).addEventListener('change', triggerFilterUpdate);
}

document.getElementById('btnResetFilters').addEventListener('click', () => {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    for (const id of ['msPool', 'msMarker', 'msResult']) {
        document.getElementById(id + '_all').checked = false;
        document.querySelectorAll('#' + id + '_options input').forEach(cb => { cb.checked = false; });
    }
    state.filterState.pool.clear();
    state.filterState.marker.clear();
    state.filterState.result.clear();
    import('./utils.js').then(({ updateLabel }) => {
        updateLabel('msPool', 'pool');
        updateLabel('msMarker', 'marker');
        updateLabel('msResult', 'result');
    });
    triggerFilterUpdate();
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    progressStartTimer();
    updateProgress(0, 'Подготовка...', 'Чтение файлов');
    await yieldToUI();
    const results = await readExcelFiles(files);
    if (results.length > 0) await processNewRows(results);
    e.target.value = '';
});

document.getElementById('btnExport').addEventListener('click', () => {
    if (!state.processedData.length && !state.feedbackData.length) {
        alert('Нет данных для экспорта');
        return;
    }
    try {
        const wb = XLSX.utils.book_new();

        if (state.processedData.length > 0) {
            const cleanProcessed = state.processedData.map(r => ({
                "Дата валидации": r.date ? formatDate(r.date) : "",
                "Проект": (r.project || "").replace('_validate', ''),
                "Пул": r.pool || "",
                "Почта разметчика": r.marker || "",
                "Наименование файла": r.fileName || "",
                "Итог": r.result || "",
                "Тип ошибки": r.errorType || "",
                "Комментарий": r.comment || "",
                "Временной интервал": r.interval || "",
                "Качество по задаче": r.quality,
                "Почта валидатора": r.validator || "",
                "Всего фрагментов": r.fragments || 0
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cleanProcessed), "Свод валидации");
        }

        if (state.feedbackData.length > 0) {
            const cleanFeedback = state.feedbackData.map(f => {
                let formattedDate = f.date;
                if (f.date) {
                    const d = new Date(f.date);
                    if (!isNaN(d.getTime())) formattedDate = formatDate(d);
                }
                return {
                    "Дата": formattedDate, "Разметчик": f.marker || "", "Статус": f.status || "",
                    "Тип ВКС": f.typeVKS || "", "Провел": f.conductor || "",
                    "Проект": f.project || "", "Пулы с ошибками": f.pools || "",
                    "Ср. качество за период": f.avgQuality ?? ""
                };
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cleanFeedback), "Обратная связь");
        }

        if (state.rawEmployeeMap.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawEmployeeMap), "Сотрудники");
        if (state.rawMarkers.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawMarkers), "Markers (сырые)");
        if (state.rawValidation.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawValidation), "Валидация (сырые)");
        if (state.rawRecommendations.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawRecommendations), "Рекомендации (сырые)");
        if (state.rawFlatValidations.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawFlatValidations
