import { state, loadFromStorage, loadFeedbackFromStorage } from './state.js';
import { recomputeDashboard, readExcelFiles, processNewRows } from './data.js';
import {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll, onOptionChange,
    populateAllMultiSelects, triggerFilterUpdate, renderErrorsTable, toggleRow
} from './ui.js';
import { renderFeedbackTable, editFeedback, deleteFeedback, initFeedbackForm } from './feedback.js';
import {
    progressStartTimer, updateProgress, yieldToUI, log, formatDate
} from './utils.js';

// ===== Экспорт функций в window (нужно для inline-обработчиков в HTML) =====
Object.assign(window, {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll,
    onOptionChange, toggleRow, renderErrorsTable,
    editFeedback, deleteFeedback
});

// ===== Обновление UI после пересчёта данных =====
window.addEventListener('app:data-updated', () => {
    populateAllMultiSelects();
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
    // Импорт updateLabel через utils
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

// ===== Экспорт =====
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
            let parsedM = [], parsedV = [], parsedR = [];
            for (const name of wb.SheetNames) {
                const json = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
                const lower = name.toLowerCase();
                if (lower.includes('marker') || lower.includes('разметчик')) parsedM = json;
                else if (lower.includes('валидац') || lower.includes('valid')) parsedV = json;
                else if (lower.includes('рекоменд') || lower.includes('recommend')) parsedR = json;
            }
            state.rawMarkers = parsedM;
            state.rawValidation = parsedV;
            state.rawRecommendations = parsedR;
            const { saveToStorage } = await import('./state.js');
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
    state.processedData = [];
    try { localStorage.removeItem('validation_dashboard_data_v3'); } catch (e) {}
    triggerFilterUpdate();
    updateProgress(0, '', 'Готово');
});

// ===== Пересчёт =====
document.getElementById('btnRelink').addEventListener('click', () => {
    recomputeDashboard();
});

// ⚠️ Кнопка «Скачать HTML-отчет» (btnGenerateReport) — намеренно без обработчика
// (по требованию: функционал отчёта отключён)

// ===== Инициализация =====
initFeedbackForm();
loadFromStorage();
loadFeedbackFromStorage();

if (state.rawMarkers.length || state.rawValidation.length || state.rawRecommendations.length) {
    recomputeDashboard().catch(err => {
        console.error('Recompute error:', err);
        try { triggerFilterUpdate(); } catch (e2) {}
    });
} else {
    triggerFilterUpdate();
}