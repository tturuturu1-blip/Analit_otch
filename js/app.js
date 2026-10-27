// js/app.js — ЛОГИКА БОКОВОЙ ПАНЕЛИ, МОДАЛЬНОГО ОКНА И СМЕНЫ ЛОГОТИПА

import { state, loadFromStorage, loadFeedbackFromStorage, saveToStorage, saveFeedbackToStorage } from './state.js';
import { recomputeDashboard, readExcelFiles, processNewRows } from './data.js';
import {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll, onOptionChange,
    populateAllMultiSelects, triggerFilterUpdate, renderErrorsTable,
    buildProjectTabs, renderMarkersTasksStatus, renderSupersetPage,
    populateRecDatalists, addRecRow,
    onSupersetTaskChange, onSupersetDateChange,
    resetSupersetFilters, editSupersetNorm, onSupersetTableFilterChange,
    changePage
} from './ui.js';
import { 
    renderFeedbackTable, 
    editFeedback, 
    deleteFeedback, 
    initFeedbackForm, 
    applyFeedbackFilters, 
    handleVideoLinkInput 
} from './feedback.js';
import { buildSuperset, applySupersetFilters, getFilteredSupersetRaw } from './superset.js';
import {
    updateProgress, yieldToUI, log, formatDate, escapeHtml, parseExcelDate
} from './utils.js';
import { generateHtmlReport } from './report.js';

// ===== Экспорт функций в window =====
Object.assign(window, {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll,
    onOptionChange, renderErrorsTable,
    editFeedback, deleteFeedback,
    onSupersetTaskChange, onSupersetDateChange,
    resetSupersetFilters, editSupersetNorm, onSupersetTableFilterChange,
    handleVideoLinkInput,
    changePage
});

// ===== Логика боковой панели и логотипа =====
const sidebar = document.getElementById('sidebar');
const btnSidebarToggle = document.getElementById('btnSidebarToggle');
const sidebarLogoText = document.getElementById('sidebarLogoText');

if (btnSidebarToggle) {
    btnSidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('expanded');
        
        // Меняем текст логотипа
        if (sidebar.classList.contains('expanded')) {
            sidebarLogoText.textContent = 'Валидатор';
        } else {
            sidebarLogoText.textContent = 'В';
        }
    });
}

// ===== Модальное окно загрузки =====
const uploadModal = document.getElementById('uploadModal');
const btnSidebarAdd = document.getElementById('btnSidebarAdd');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnUploadDB = document.getElementById('btnUploadDB');
const btnUploadSource = document.getElementById('btnUploadSource');

if (btnSidebarAdd) {
    btnSidebarAdd.addEventListener('click', () => {
        uploadModal.classList.add('active');
    });
}

const closeModal = () => uploadModal.classList.remove('active');

if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
if (uploadModal) {
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) closeModal();
    });
}

if (btnUploadDB) {
    btnUploadDB.addEventListener('click', () => {
        closeModal();
        document.getElementById('importInput').click();
    });
}

if (btnUploadSource) {
    btnUploadSource.addEventListener('click', () => {
        closeModal();
        document.getElementById('fileInput').click();
    });
}

// ===== Делегирование кликов по табам =====
const projectTabsContainer = document.getElementById('projectTabs');
if (projectTabsContainer) {
    projectTabsContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;
        switchTab(tabEl.dataset.tab, tabEl);
    });
}

// ===== Даты в суперсете =====
const supersetDateFrom = document.getElementById('supersetDateFrom');
const supersetDateTo = document.getElementById('supersetDateTo');
if (supersetDateFrom) supersetDateFrom.addEventListener('change', onSupersetDateChange);
if (supersetDateTo) supersetDateTo.addEventListener('change', onSupersetDateChange);

// ===== Обновление UI =====
window.addEventListener('app:data-updated', () => {
    state.superset.filters.dateFrom = '';
    state.superset.filters.dateTo = '';
    state.superset.filters.tasks.clear();
    state.superset.tableFilters = { t1: {}, t2: {}, t3: {}, t4: {} };

    state.feedbackGeneration.appliedPools.clear();
    state.feedbackGeneration.appliedGroups.clear();
    state.feedbackGeneration.videoLinks = {};

    for (const key in state.pagination) {
        state.pagination[key] = 1;
    }

    buildSuperset();
    populateAllMultiSelects();
    populateRecDatalists();
    buildProjectTabs();
    renderMarkersTasksStatus();
    triggerFilterUpdate();
    
    if (state.currentMenu === 'superset') renderSupersetPage();
    if (state.currentMenu === 'feedback') renderFeedbackTable();
});

// ===== Закрытие dropdown =====
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
        document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    }
});

// ===== Фильтры по дате =====
for (const id of ['filterDateFrom', 'filterDateTo']) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            state.pagination.mainData = 1;
            triggerFilterUpdate();
        });
    }
}

const btnResetFilters = document.getElementById('btnResetFilters');
if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        for (const id of ['msPool', 'msMarker', 'msResult']) {
            document.getElementById(id + '_all').checked = false;
            document.querySelectorAll('#' + id + '_options input').forEach(cb => { cb.checked = false; });
        }
        state.filterState.pool.clear();
        state.filterState.marker.clear();
        state.filterState.result.clear();
        
        state.pagination.mainData = 1;
        
        import('./utils.js').then(({ updateLabel }) => {
            updateLabel('msPool', 'pool');
            updateLabel('msMarker', 'marker');
            updateLabel('msResult', 'result');
        });
        triggerFilterUpdate();
    });
}

// ===== Загрузка Excel =====
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        updateProgress(0, 'Подготовка...', 'Чтение файлов');
        await yieldToUI();
        const results = await readExcelFiles(files);
        if (results.length > 0) await processNewRows(results);
        e.target.value = '';
    });
}

// ===== ТАБЛИЦА РЕКОМЕНДАЦИЙ =====
function getRecRowsData() {
    const rows = [];
    document.querySelectorAll('#recTableBody tr').forEach(tr => {
        const date = tr.querySelector('.rec-date').value;
        const marker = tr.querySelector('.rec-marker').value.trim();
        if (!date && !marker && !tr.querySelector('.rec-comment').value.trim() && !tr.querySelector('.rec-item').value.trim()) return;
        rows.push({
            'Дата валидации': date,
            'Проект': tr.querySelector('.rec-project').value.trim(),
            'Пул': tr.querySelector('.rec-pool').value.trim(),
            'Почта разметчика': marker,
            'item_id': tr.querySelector('.rec-item').value.trim(),
            'Интервал': tr.querySelector('.rec-interval').value.trim(),
            'Комментарий': tr.querySelector('.rec-comment').value.trim(),
            'Почта валидатора': tr.querySelector('.rec-validator').value.trim()
        });
    });
    return rows;
}

const btnAddRecRow = document.getElementById('btnAddRecRow');
if (btnAddRecRow) btnAddRecRow.addEventListener('click', addRecRow);

const btnSaveRecommendations = document.getElementById('btnSaveRecommendations');
if (btnSaveRecommendations) {
    btnSaveRecommendations.addEventListener('click', async () => {
        const rows = getRecRowsData();
        if (rows.length === 0) { alert('Заполните хотя бы одну строку (Дата и Почта разметчика обязательны)'); return; }
        state.rawRecommendations.push(...rows);
        saveToStorage();
        await recomputeDashboard();
        document.getElementById('recTableBody').innerHTML = '';
        addRecRow();
        log(`Добавлено рекомендаций: ${rows.length}`, false);
    });
}

const btnExportRecommendations = document.getElementById('btnExportRecommendations');
if (btnExportRecommendations) {
    btnExportRecommendations.addEventListener('click', () => {
        const rows = getRecRowsData();
        if (rows.length === 0) { alert('Заполните хотя бы одну строку'); return; }
        try {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Рекомендации");
            XLSX.writeFile(wb, `Рекомендации_${new Date().toISOString().slice(0, 10)}.xlsx`);
            log('Excel с рекомендациями скачан', false);
        } catch (err) {
            log('Ошибка экспорта рекомендаций: ' + err.message, true);
        }
    });
}

// ===== Экспорт в Excel =====
const btnExport = document.getElementById('btnExport');
if (btnExport) {
    btnExport.addEventListener('click', () => {
        if (!state.processedData.length && !state.feedbackData.length) {
            alert('Нет данных для экспорта');
            return;
        }
        try {
            const wb = XLSX.utils.book_new();
            if (state.processedData.length > 0) {
                const cleanProcessed = state.processedData.map(r => ({
                    "Дата валидации": r.date ? formatDate(r.date) : "",
                    "Проект": (r.project || "").replace(/_validate$/, ''),
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
            if (state.rawEmployeeMap.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawEmployeeMap), "Сотрудники");
            if (state.rawMarkers.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawMarkers), "Markers (сырые)");
            if (state.rawValidation.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawValidation), "Валидация (сырые)");
            if (state.rawRecommendations.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawRecommendations), "Рекомендации (сырые)");
            if (state.rawFlatValidations.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawFlatValidations), "Плоская валидация");

            const { s1, s2, s3 } = getFilteredSupersetRaw();
            if (s1.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1), "Суперсет 1 (сырые)");
            if (s2.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s2), "Суперсет 2 (сырые)");
            if (s3.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s3), "Суперсет 3 (сырые)");

            XLSX.writeFile(wb, `full_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
            log('Полный экспорт выполнен', false);
        } catch (err) {
            log('Ошибка экспорта: ' + err.message, true);
        }
    });
}

// ===== Импорт =====
const importInput = document.getElementById('importInput');
if (importInput) {
    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
                let parsedM = [], parsedV = [], parsedR = [], parsedF = [], parsedEmp = [];
                let parsedS1 = [], parsedS2 = [], parsedS3 = [], parsedFb = [];
                
                for (const name of wb.SheetNames) {
                    const json = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
                    const lower = name.toLowerCase();
                    if (lower.includes('свод')) continue;
                    if (lower.includes('обратн') || lower.includes('feedback')) parsedFb = json;
                    else if (lower.includes('сотрудник') || lower.includes('employee')) parsedEmp = json;
                    else if (lower.includes('суперсет 1') || lower.includes('superset 1')) parsedS1 = json;
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
                state.rawEmployeeMap = parsedEmp;
                
                if (parsedFb.length > 0) {
                    state.feedbackData = parsedFb.map(row => {
                        let dateStr = row['Дата'];
                        if (dateStr) {
                            const d = parseExcelDate(dateStr);
                            if (d && !isNaN(d.getTime())) dateStr = d.toISOString().slice(0, 10);
                        }
                        let avgQ = row['Ср. качество за период'];
                        if (avgQ === '' || avgQ === undefined) avgQ = null;
                        else if (typeof avgQ === 'string') avgQ = parseFloat(avgQ.replace('%', '').replace(',', '.')) / 100;
                        return {
                            date: dateStr || '', marker: row['Разметчик'] || '', status: row['Статус'] || '',
                            typeVKS: row['Тип ВКС'] || '', conductor: row['Провел'] || '',
                            project: row['Проект'] || '', pools: row['Пулы с ошибками'] || '', avgQuality: avgQ
                        };
                    });
                    saveFeedbackToStorage();
                }
                saveToStorage();
                await recomputeDashboard();
                log('Импорт завершён', false);
            } catch (err) {
                alert('Ошибка импорта: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    });
}

// ===== Очистка =====
const btnClear = document.getElementById('btnClear');
if (btnClear) {
    btnClear.addEventListener('click', () => {
        if (!confirm('Удалить все данные?')) return;
        state.rawMarkers = []; state.rawValidation = []; state.rawRecommendations = [];
        state.rawFlatValidations = []; state.rawSuperset1 = []; state.rawSuperset2 = [];
        state.rawSuperset3 = []; state.rawEmployeeMap = []; state.processedData = [];
        state.feedbackData = [];
        state.superset.table1 = []; state.superset.table2 = []; state.superset.table3 = []; state.superset.table4 = [];
        state.superset.filteredTable1 = []; state.superset.filteredTable2 = []; state.superset.filteredTable3 = []; state.superset.filteredTable4 = [];
        state.superset.kpis = { qualityFact: null, qualityPlan: null, ballsPerHour: null, prodPerHour: null, avgTime: null, avgPrice: null };
        state.superset.norms = { byProjectPool: {}, byProject: {}, globalAvg: null };
        state.superset.employeeMap = { fioToEmail: {}, emailToFio: {} };
        state.superset._mainProjects = null;
        state.superset.filters = { dateFrom: '', dateTo: '', tasks: new Set() };
        state.superset.tableFilters = { t1: {}, t2: {}, t3: {}, t4: {} };
        state.feedbackGeneration.appliedPools.clear(); state.feedbackGeneration.appliedGroups.clear(); state.feedbackGeneration.videoLinks = {};
        const fbGenContainer = document.getElementById('feedbackGenerationBlocks');
        if (fbGenContainer) fbGenContainer.innerHTML = '';
        for (const key in state.pagination) state.pagination[key] = 1;
        try { 
            localStorage.removeItem('validation_dashboard_data_v3'); 
            localStorage.removeItem('validation_feedback_data_v1');
        } catch (e) { /* ignore */ }
        
        const recBody = document.getElementById('recTableBody');
        if (recBody) { recBody.innerHTML = ''; addRecRow(); }
        
        buildProjectTabs(); renderMarkersTasksStatus(); triggerFilterUpdate();
        if (state.currentMenu === 'superset') renderSupersetPage();
        if (state.currentMenu === 'feedback') renderFeedbackTable();
        updateProgress(0, '', 'Готово');
    });
}

// ===== Пересчёт и Отчёт =====
const btnRelink = document.getElementById('btnRelink');
if (btnRelink) btnRelink.addEventListener('click', () => recomputeDashboard());

const btnGenerateReport = document.getElementById('btnGenerateReport');
if (btnGenerateReport) {
    btnGenerateReport.addEventListener('click', async () => {
        try {
            log('Формирование HTML-отчёта...', false);
            await generateHtmlReport();
            log('HTML-отчёт сформирован и скачан', false);
        } catch (err) {
            log('Ошибка генерации отчёта: ' + err.message, true);
            console.error(err);
        }
    });
}

// ===== Инициализация =====
initFeedbackForm();
loadFromStorage();
loadFeedbackFromStorage();
addRecRow();

if (state.rawMarkers.length || state.rawValidation.length || state.rawRecommendations.length ||
    state.rawFlatValidations.length || state.rawSuperset1.length || state.rawSuperset2.length ||
    state.rawSuperset3.length || state.rawEmployeeMap.length) {
    recomputeDashboard().catch(err => {
        console.error('Recompute error:', err);
        buildSuperset(); buildProjectTabs(); renderMarkersTasksStatus();
        try { triggerFilterUpdate(); } catch (e2) { }
    });
} else {
    buildSuperset(); buildProjectTabs(); renderMarkersTasksStatus(); triggerFilterUpdate();
}
