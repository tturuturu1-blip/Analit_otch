import { state, loadFromStorage, loadFeedbackFromStorage, saveToStorage } from './state.js';
import { recomputeDashboard, readExcelFiles, processNewRows } from './data.js';
import {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll, onOptionChange,
    populateAllMultiSelects, triggerFilterUpdate, renderErrorsTable, toggleRow,
    buildProjectTabs
} from './ui.js';
import { renderFeedbackTable, editFeedback, deleteFeedback, initFeedbackForm } from './feedback.js';
import {
    progressStartTimer, updateProgress, yieldToUI, log, formatDate
} from './utils.js';
import { generateHtmlReport } from './report.js';

// ===== Экспорт функций в window (нужно для inline-обработчиков в HTML) =====
Object.assign(window, {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll,
    onOptionChange, toggleRow, renderErrorsTable,
    editFeedback, deleteFeedback
});

// ===== Делегирование кликов по табам проектов =====
const projectTabsContainer = document.getElementById('projectTabs');
if (projectTabsContainer) {
    projectTabsContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;
        switchTab(tabEl.dataset.tab, tabEl);
    });
}

// ===== Обновление UI после пересчёта данных =====
window.addEventListener('app:data-updated', () => {
    populateAllMultiSelects();
    buildProjectTabs();
    triggerFilterUpdate();
});

// ===== Закрытие dropdown при клике вне =====
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
        document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    }
});

// ===== Фильтры по дате =====
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
                    "Дата": formattedDate,
                    "Разметчик": f.marker || "",
                    "Статус": f.status || "",
                    "Тип ВКС": f.typeVKS || "",
                    "Провел": f.conductor || "",
                    "Пулы с ошибками": f.pools || "",
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
            for (const name of wb.SheetNames) {
                const json = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
                const lower = name.toLowerCase();
                if (lower.includes('flat') || lower.includes('плоск')) parsedF = json;
                else if (lower.includes('marker') || lower.includes('разметчик')) parsedM = json;
                else if (lower.includes('валидац') || lower.includes('valid')) parsedV = json;
                else if (lower.includes('рекоменд') || lower.includes('recommend')) parsedR = json;
            }
            state.rawMarkers = parsedM;
            state.rawValidation = parsedV;
            state.rawRecommendations = parsedR;
            state.rawFlatValidations = parsedF;
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
    state.processedData = [];
    try { localStorage.removeItem('validation_dashboard_data_v3'); } catch (e) { /* ignore */ }
    buildProjectTabs();
    triggerFilterUpdate();
    updateProgress(0, '', 'Готово');
});

// ===== Пересчёт =====
document.getElementById('btnRelink').addEventListener('click', () => {
    recomputeDashboard();
});

// ===== Скачать HTML-отчёт =====
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

if (state.rawMarkers.length || state.rawValidation.length || state.rawRecommendations.length || state.rawFlatValidations.length) {
    recomputeDashboard().catch(err => {
        console.error('Recompute error:', err);
        buildProjectTabs();
        try { triggerFilterUpdate(); } catch (e2) { /* ignore */ }
    });
} else {
    buildProjectTabs();
    triggerFilterUpdate();
}
