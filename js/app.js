import { state, loadFromStorage, loadFeedbackFromStorage, saveToStorage } from './state.js';
import { recomputeDashboard, readExcelFiles, processNewRows } from './data.js';
import {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll, onOptionChange,
    populateAllMultiSelects, triggerFilterUpdate, renderErrorsTable, toggleRow,
    buildProjectTabs, renderMarkersTasksStatus, renderSupersetPage,
    renderSupersetProjectTabs, renderSupersetFilters, renderSupersetNormCard,
    renderSupersetKPIs, updateSupersetTaskLabel,
    onSupersetTaskChange, onSupersetDateChange, onSupersetProjectTabClick,
    resetSupersetFilters, editSupersetNorm, onSupersetTableFilterChange
} from './ui.js';
import { renderFeedbackTable, editFeedback, deleteFeedback, initFeedbackForm } from './feedback.js';
import { buildSuperset, applySupersetFilters } from './superset.js';
import {
    progressStartTimer, updateProgress, yieldToUI, log, formatDate
} from './utils.js';
import { generateHtmlReport } from './report.js';

// ===== Экспорт в window =====
Object.assign(window, {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll,
    onOptionChange, toggleRow, renderErrorsTable,
    editFeedback, deleteFeedback,
    // Суперсет
    onSupersetTaskChange,
    onSupersetDateChange,
    resetSupersetFilters,
    editSupersetNorm,
    onSupersetTableFilterChange
});

// ===== Делегирование кликов по табам проектов (главная) =====
const projectTabsContainer = document.getElementById('projectTabs');
if (projectTabsContainer) {
    projectTabsContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;
        switchTab(tabEl.dataset.tab, tabEl);
    });
}

// ===== Делегирование кликов по табам суперсета =====
const supersetTabsContainer = document.getElementById('supersetProjectTabs');
if (supersetTabsContainer) {
    supersetTabsContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;
        onSupersetProjectTabClick(tabEl.dataset.project);
    });
}

// ===== Изменение дат на странице Суперсет =====
const supersetDateFrom = document.getElementById('supersetDateFrom');
const supersetDateTo = document.getElementById('supersetDateTo');
if (supersetDateFrom) supersetDateFrom.addEventListener('change', onSupersetDateChange);
if (supersetDateTo) supersetDateTo.addEventListener('change', onSupersetDateChange);

// ===== Обновление UI после пересчёта данных =====
window.addEventListener('app:data-updated', () => {
    // Сброс фильтров суперсета при новых данных
    state.superset.filters.project = 'all';
    state.superset.filters.dateFrom = '';
    state.superset.filters.dateTo = '';
    state.superset.filters.tasks.clear();
    state.superset.tableFilters = { t1: {}, t2: {}, t3: {} };

    buildSuperset();
    populateAllMultiSelects();
    buildProjectTabs();
    renderMarkersTasksStatus();
    triggerFilterUpdate();
    if (state.currentMenu === 'superset') renderSupersetPage();
});

// ===== Закрытие dropdown при клике вне =====
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
        document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    }
});

// ===== Фильтры по дате (главная) =====
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

// ===== Загрузка Excel =====
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

// ===== Экспорт в Excel =====
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

        if (state.rawMarkers.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawMarkers), "Markers (сырые)");
        if (state.rawValidation.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawValidation), "Валидация (сырые)");
        if (state.rawRecommendations.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawRecommendations), "Рекомендации (сырые)");
        if (state.rawFlatValidations.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawFlatValidations), "Плоская валидация");
        if (state.rawSuperset1.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawSuperset1), "Суперсет 1 (сырые)");
        if (state.rawSuperset2.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawSuperset2), "Суперсет 2 (сырые)");
        if (state.rawSuperset3.length > 0)
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawSuperset3), "Суперсет 3 (сырые)");

        XLSX.writeFile(wb, `full_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
        log('Полный экспорт выполнен', false);
    } catch (err) {
        log('Ошибка экспорта: ' + err.message, true);
    }
});

// ===== Импорт =====
document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
            let parsedM = [], parsedV = [], parsedR = [], parsedF = [];
            let parsedS1 = [], parsedS2 = [], parsedS3 = [];
            for (const name of wb.SheetNames) {
                const json = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
                const lower = name.toLowerCase();
                if (lower.includes('суперсет 1') || lower.includes('superset 1')) parsedS1 = json;
                else if (lower.includes('суперсет 2') || lower.includes('superset 2')) parsedS2 = json;
                else if (lower.includes('суперсет 3') || lower.includes('superset 3')) parsedS3 = json;
                else if (lower.includes('flat') || lower.includes('плоск')) parsedF = json;
                else if (lower.includes('marker') || lower.includes('разметчик')) parsedM = json;
                else if (lower.includes('валидац') || lower.includes('valid')) parsedV = json;
                else if (lower.includes('рекоменд') || lower.includes('recommend')) parsedR = json;
            }
            state.rawMarkers = parsedM;
            state.rawValidation = parsedV;
            state.rawRecommendations = parsedR;
            state.rawFlatValidations = parsedF;
            state.rawSuperset1 = parsedS1;
            state.rawSuperset2 = parsedS2;
            state.rawSuperset3 = parsedS3;
            saveToStorage();
            await recomputeDashboard();
        } catch (err) {
            alert('Ошибка импорта: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
});

// ===== Очистка =====
document.getElementById('btnClear').addEventListener('click', () => {
    if (!confirm('Удалить все данные?')) return;
    state.rawMarkers = [];
    state.rawValidation = [];
    state.rawRecommendations = [];
    state.rawFlatValidations = [];
    state.rawSuperset1 = [];
    state.rawSuperset2 = [];
    state.rawSuperset3 = [];
    state.processedData = [];
    state.superset.table1 = [];
    state.superset.table2 = [];
    state.superset.table3 = [];
    state.superset.filteredTable1 = [];
    state.superset.filteredTable2 = [];
    state.superset.filteredTable3 = [];
    state.superset.kpis = { qualityFact: null, qualityPlan: null, ballsPerHour: null, prodPerHour: null, avgTime: null };
    state.superset.norms = { byProjectPool: {}, byProject: {}, globalAvg: null };
    state.superset.filters = { project: 'all', dateFrom: '', dateTo: '', tasks: new Set() };
    state.superset.tableFilters = { t1: {}, t2: {}, t3: {} };
    try { localStorage.removeItem('validation_dashboard_data_v3'); } catch (e) { /* ignore */ }
    buildProjectTabs();
    renderMarkersTasksStatus();
    triggerFilterUpdate();
    if (state.currentMenu === 'superset') renderSupersetPage();
    updateProgress(0, '', 'Готово');
});

document.getElementById('btnRelink').addEventListener('click', () => {
    recomputeDashboard();
});

document.getElementById('btnGenerateReport').addEventListener('click', async () => {
    try {
        log('Формирование HTML-отчёта...', false);
        await generateHtmlReport();
        log('HTML-отчёт сформирован и скачан', false);
    } catch (err) {
        log('Ошибка генерации отчёта: ' + err.message, true);
        console.error(err);
    }
});

// ===== Инициализация =====
initFeedbackForm();
loadFromStorage();
loadFeedbackFromStorage();

if (state.rawMarkers.length || state.rawValidation.length || state.rawRecommendations.length ||
    state.rawFlatValidations.length || state.rawSuperset1.length || state.rawSuperset2.length || state.rawSuperset3.length) {
    recomputeDashboard().catch(err => {
        console.error('Recompute error:', err);
        buildSuperset();
        buildProjectTabs();
        renderMarkersTasksStatus();
        try { triggerFilterUpdate(); } catch (e2) { /* ignore */ }
    });
} else {
    buildSuperset();
    buildProjectTabs();
    renderMarkersTasksStatus();
    triggerFilterUpdate();
}
