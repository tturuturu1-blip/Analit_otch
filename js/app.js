// js/app.js — НОВАЯ ЛОГИКА МОДАЛЬНОГО ОКНА ЗАГРУЗКИ И ДОМЕНОВ

import { state, loadFromStorage, loadFeedbackFromStorage, saveToStorage, saveFeedbackToStorage } from './state.js';
import { recomputeDashboard, readExcelFiles, processNewRows } from './data.js';
import {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll, onOptionChange,
    populateAllMultiSelects, triggerFilterUpdate, renderErrorsTable,
    buildProjectTabs, renderMarkersTasksStatus, renderSupersetPage,
    populateRecDatalists, addRecRow,
    onSupersetTaskChange, onSupersetDateChange,
    resetSupersetFilters, onSupersetTableFilterChange,
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
import { buildSuperset, applySupersetFilters, getFilteredSupersetRaw, addNormEntry, getNormForDate } from './superset.js';
import {
    updateProgress, yieldToUI, log, formatDate, escapeHtml, parseExcelDate
} from './utils.js';
import { generateHtmlReport } from './report.js';

// ===== Модальное окно редактирования нормы =====
const normModal = document.getElementById('normModal');
const normInput = document.getElementById('normInput');

const editSupersetNorm = () => {
    const today = new Date().toISOString().slice(0, 10);
    const currentNorm = getNormForDate(today);
    if (normInput) normInput.value = currentNorm;
    if (normModal) normModal.classList.add('active');
};

if (document.getElementById('btnCancelNorm')) {
    document.getElementById('btnCancelNorm').addEventListener('click', () => {
        if (normModal) normModal.classList.remove('active');
    });
}

if (document.getElementById('btnSaveNorm')) {
    document.getElementById('btnSaveNorm').addEventListener('click', () => {
        const val = normInput.value;
        const today = new Date().toISOString().slice(0, 10);
        if (addNormEntry(today, val)) {
            if (normModal) normModal.classList.remove('active');
            triggerFilterUpdate();
            if (state.currentMenu === 'superset') renderSupersetPage();
        } else {
            alert('Введите корректное положительное число');
        }
    });
}

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
        
        if (sidebar.classList.contains('expanded')) {
            sidebarLogoText.textContent = 'Валидатор';
        } else {
            sidebarLogoText.textContent = 'В';
        }
    });
}

// ===== НОВАЯ ЛОГИКА МОДАЛЬНОГО ОКНА ЗАГРУЗКИ =====
const uploadModal = document.getElementById('uploadModal');
const btnSidebarAdd = document.getElementById('btnSidebarAdd');
const btnCloseModalX = document.getElementById('btnCloseModalX');

const viewSelect = document.getElementById('uploadViewSelect');
const viewProgress = document.getElementById('uploadViewProgress');
const viewPreview = document.getElementById('uploadViewPreview');
const viewDone = document.getElementById('uploadViewDone');
const viewError = document.getElementById('uploadViewError');

const modalProgressFill = document.getElementById('modalProgressFill');
const modalProgressText = document.getElementById('modalProgressText');
const previewFilesList = document.getElementById('previewFilesList');
const errorMessage = document.getElementById('errorMessage');
const doneMessage = document.getElementById('doneMessage');

const modalDomainInput = document.getElementById('modalDomainInput');
const domainHistoryList = document.getElementById('domainHistoryList');
const btnApplyDomain = document.getElementById('btnApplyDomain');

let pendingFiles = []; // Временное хранение файлов для предпросмотра
let uploadMode = 'source'; // 'source' или 'db'

function showModalView(view) {
    viewSelect.style.display = view === 'select' ? 'block' : 'none';
    viewProgress.style.display = view === 'progress' ? 'block' : 'none';
    viewPreview.style.display = view === 'preview' ? 'block' : 'none';
    viewDone.style.display = view === 'done' ? 'block' : 'none';
    viewError.style.display = view === 'error' ? 'block' : 'none';
}

function resetUploadModal() {
    showModalView('select');
    pendingFiles = [];
    uploadModal.classList.remove('active');
    
    // Заполняем историю доменов
    if (modalDomainInput) {
        modalDomainInput.value = state.validationBaseUrl || '';
    }
    if (domainHistoryList) {
        domainHistoryList.innerHTML = state.domainHistory.map(d => `<option value="${escapeHtml(d)}">`).join('');
    }
}

if (btnSidebarAdd) {
    btnSidebarAdd.addEventListener('click', () => {
        resetUploadModal();
        uploadModal.classList.add('active');
    });
}

if (btnCloseModalX) {
    btnCloseModalX.addEventListener('click', resetUploadModal);
}

// Применение домена
if (btnApplyDomain) {
    btnApplyDomain.addEventListener('click', () => {
        const val = modalDomainInput.value.trim();
        state.validationBaseUrl = val;
        
        if (val) {
            // Добавляем в историю, если такого еще нет
            if (!state.domainHistory.includes(val)) {
                state.domainHistory.push(val);
                // Ограничиваем историю 10 записями
                if (state.domainHistory.length > 10) state.domainHistory.shift();
            }
        }
        saveToStorage();
        
        // Обновляем datalist
        if (domainHistoryList) {
            domainHistoryList.innerHTML = state.domainHistory.map(d => `<option value="${escapeHtml(d)}">`).join('');
        }
        
        // Показываем быстрый фидбек
        const oldText = btnApplyDomain.textContent;
        btnApplyDomain.textContent = '✓ Сохранено';
        btnApplyDomain.style.background = 'var(--success)';
        setTimeout(() => {
            btnApplyDomain.textContent = oldText;
            btnApplyDomain.style.background = '';
        }, 1500);
    });
}

// Выбор файлов
const btnUploadDB = document.getElementById('btnUploadDB');
const btnUploadSource = document.getElementById('btnUploadSource');
const fileInput = document.getElementById('fileInput');
const importInput = document.getElementById('importInput');

if (btnUploadDB) {
    btnUploadDB.addEventListener('click', () => {
        uploadMode = 'db';
        importInput.click();
    });
}

if (btnUploadSource) {
    btnUploadSource.addEventListener('click', () => {
        uploadMode = 'source';
        fileInput.click();
    });
}

// Обработка выбора файлов (Предпросмотр)
function handleFileSelection(files) {
    if (!files.length) return;
    pendingFiles = Array.from(files);
    
    previewFilesList.innerHTML = pendingFiles.map(f => {
        const sizeMb = (f.size / (1024 * 1024)).toFixed(2);
        return `
            <div class="preview-file-item">
                <div class="preview-file-info">
                    <span class="preview-file-name">📄 ${escapeHtml(f.name)}</span>
                    <span class="preview-file-size">${sizeMb} МБ</span>
                </div>
            </div>
        `;
    }).join('');
    
    showModalView('preview');
}

// Обработчик инпута источников
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        if (files.length > 0) handleFileSelection(files);
    });
}

// Обработчик инпута БД
if (importInput) {
    importInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        if (files.length > 0) handleFileSelection(files);
    });
}

// Кнопки на экране Предпросмотра
document.getElementById('btnPreviewCancel').addEventListener('click', () => {
    resetUploadModal();
});

document.getElementById('btnPreviewContinue').addEventListener('click', async () => {
    if (pendingFiles.length === 0) return;
    
    showModalView('progress');
    modalProgressFill.style.width = '10%';
    modalProgressText.textContent = 'Чтение файлов...';
    await yieldToUI();
    
    try {
        if (uploadMode === 'source') {
            // Логика для источников
            const results = await readExcelFiles(pendingFiles);
            modalProgressFill.style.width = '50%';
            modalProgressText.textContent = 'Обработка данных...';
            await yieldToUI();
            
            if (results.length === 0) throw new Error('Файлы не прочитаны или имеют неверный формат.');
            
            await processNewRows(results);
            
            if (!state.validationBaseUrl) {
                log('⚠️ Домен платформы не указан. Ссылки «Перейти» у загруженных данных не сформируются.', true);
            }
            
            modalProgressFill.style.width = '100%';
            doneMessage.textContent = `Успешно обработано файлов: ${results.length}`;
            showModalView('done');
            
        } else {
            // Логика для БД (Импорт)
            const file = pendingFiles[0];
            const reader = new FileReader();
            
            reader.onload = async (ev) => {
                try {
                    modalProgressFill.style.width = '40%';
                    modalProgressText.textContent = 'Разбор структуры Excel...';
                    await yieldToUI();
                    
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
                    
                    modalProgressFill.style.width = '80%';
                    modalProgressText.textContent = 'Сохранение в базу...';
                    await yieldToUI();
                    
                    saveToStorage();
                    await recomputeDashboard();
                    
                    modalProgressFill.style.width = '100%';
                    doneMessage.textContent = 'База данных успешно восстановлена.';
                    showModalView('done');
                    
                } catch (err) {
                    errorMessage.textContent = err.message;
                    showModalView('error');
                }
            };
            reader.onerror = () => {
                errorMessage.textContent = 'Не удалось прочитать файл. Проверьте его целостность.';
                showModalView('error');
            };
            reader.readAsArrayBuffer(file);
        }
    } catch (err) {
        errorMessage.textContent = err.message;
        showModalView('error');
    }
});

// Кнопки на экранах Успех / Ошибка
document.getElementById('btnDoneClose').addEventListener('click', resetUploadModal);
document.getElementById('btnErrorClose').addEventListener('click', () => {
    showModalView('select'); // Возвращаем на первый экран
});

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
        if (rows.length === 0) { alert('Заполните хотя бы одну строку'); return; }
        // Проверка обязательных полей: дата + почта разметчика
        const invalid = rows.find(r => !r['Дата валидации'] || !r['Почта разметчика']);
        if (invalid) {
            alert('В каждой строке должны быть заполнены «Дата валидации» и «Почта разметчика»');
            return;
        }
        // Сохраняем в отдельный массив
        state.rawRecommendationsManual.push(...rows);
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
        const unsaved = getRecRowsData();
        const saved = state.rawRecommendationsManual || [];
        const rows = saved.concat(unsaved);
        if (rows.length === 0) { alert('Нет рекомендаций для экспорта'); return; }
        try {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Рекомендации");
            XLSX.writeFile(wb, `Рекомендации_${new Date().toISOString().slice(0, 10)}.xlsx`);
            log(`Excel с рекомендациями скачан (${rows.length} шт)`, false);
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

            // Объединяем Excel-ные и ручные рекомендации
            const allRecommendationsForExport = (state.rawRecommendations || []).concat(state.rawRecommendationsManual || []);
            if (allRecommendationsForExport.length > 0) {
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRecommendationsForExport), "Рекомендации (сырые)");
            }

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

// ===== Очистка =====
const btnClear = document.getElementById('btnClear');
if (btnClear) {
    btnClear.addEventListener('click', () => {
        if (!confirm('Удалить все данные?')) return;
        state.rawMarkers = []; state.rawValidation = []; state.rawRecommendations = [];
        state.rawRecommendationsManual = [];
        state.rawFlatValidations = []; state.rawSuperset1 = []; state.rawSuperset2 = [];
        state.rawSuperset3 = []; state.rawEmployeeMap = []; state.processedData = [];
        state.feedbackData = [];
        state.validationBaseUrl = '';
        state.domainHistory = [];
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
        
        // Очищаем поле домена в модалке
        if (modalDomainInput) modalDomainInput.value = '';
        if (domainHistoryList) domainHistoryList.innerHTML = '';
        
        buildSuperset(); // Пересчет norms/employeeMap/table1/table3
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