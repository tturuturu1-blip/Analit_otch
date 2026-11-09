// js/app.js — ПОЛНАЯ СБОРКА (Обновлено для Календаря, Конфликтов и Загрузки)
// ★ ДОБАВЛЕНО: Кнопка "Объединить данные" в окне конфликтов (btnConflictMergeAll).
// ★ ИЗМЕНЕНО: guessFileType обновлен под новые названия файлов.
// ★ ИЗМЕНЕНО: Экспорт/Импорт Excel сохраняет новые поля календаря (статусы, отпуска).

import { state, loadFromStorage, loadFeedbackFromStorage, saveToStorage, saveFeedbackToStorage } from './state.js';
import { recomputeDashboard, readExcelFiles, processNewRows, commitNewData } from './data.js';
import {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll, onOptionChange,
    populateAllMultiSelects, triggerFilterUpdate, renderErrorsTable,
    buildProjectTabs, renderMarkersTasksStatus, renderSupersetPage,
    populateRecDatalists, addRecRow,
    onSupersetTaskChange, onSupersetDateChange,
    resetSupersetFilters, onSupersetTableFilterChange,
    changePage, renderNotificationsTable
} from './ui.js';
import { 
    initFeedbackForm, 
    applyFeedbackFilters, 
    handleVideoLinkInput,
    renderCalendar,
    openAddFeedbackModal,
    openAddTypeModal,
    openEventModal,
    handleSaveFeedback,
    handleSaveEvent,
    deleteFeedbackFromCalendar
} from './feedback.js';
import { buildSuperset, applySupersetFilters, getFilteredSupersetRaw, addNormEntry, getNormForDate } from './superset.js';
import {
    updateProgress, yieldToUI, log, formatDate, escapeHtml, parseExcelDate, detectTableType
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
            if (state.currentMenu === 'main') {
                applySupersetFilters();
                renderSupersetPage();
            }
        } else {
            alert('Введите корректное положительное число');
        }
    });
}

// ===== Экспорт функций в window =====
Object.assign(window, {
    switchMenu, switchTab, toggleDropdown, filterMsOptions, toggleAll,
    onOptionChange, renderErrorsTable,
    onSupersetTaskChange, onSupersetDateChange,
    resetSupersetFilters, editSupersetNorm, onSupersetTableFilterChange,
    handleVideoLinkInput,
    changePage,
    openAddFeedbackModal,
    openAddTypeModal,
    openEventModal,
    deleteFeedbackFromCalendar,
    editFeedbackFromCalendar: (idx) => {
        const fb = state.feedbackData[idx];
        if (fb) openAddFeedbackModal(fb.date, idx);
    },
    editEventFromCalendar: (idx) => {
        const fb = state.feedbackData[idx];
        if (fb) openEventModal(fb.eventType, idx);
    },
    confirmDeleteEvent: (idx) => {
        state.deleteTargetIndex = idx;
        document.getElementById('confirmDeleteModal').classList.add('active');
    }
});

// ===== Боковая панель =====
const sidebar = document.getElementById('sidebar');
const btnSidebarToggle = document.getElementById('btnSidebarToggle');
const sidebarLogoText = document.getElementById('sidebarLogoText');

if (btnSidebarToggle) {
    btnSidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('expanded');
        sidebarLogoText.textContent = sidebar.classList.contains('expanded') ? 'Валидатор' : 'В';
    });
}

// ===== УТИЛИТЫ САЙДБАРА =====
const btnSidebarDownload = document.getElementById('btnSidebarDownload');
const generateModal = document.getElementById('generateModal');
if (btnSidebarDownload) {
    btnSidebarDownload.addEventListener('click', () => generateModal.classList.add('active'));
}

const btnSidebarRelink = document.getElementById('btnSidebarRelink');
if (btnSidebarRelink) btnSidebarRelink.addEventListener('click', () => recomputeDashboard());

const btnSidebarClear = document.getElementById('btnSidebarClear');
if (btnSidebarClear) btnSidebarClear.addEventListener('click', handleClearAll);

// ===== МОДАЛЬНОЕ ОКНО "СГЕНЕРИРОВАТЬ ФАЙЛЫ" =====
document.getElementById('btnDownloadExcel').addEventListener('click', () => {
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
        
        // ★ ОБНОВЛЕНО: Экспорт ОС с учетом новых полей
        if (state.feedbackData.length > 0) {
            const cleanFeedback = state.feedbackData.map(f => {
                const base = {
                    "Дата": f.date, 
                    "Разметчик": (f.markers || [f.marker || f.marker]).join(', '), 
                    "Статус": f.status || "",
                    "Тип ВКС": f.typeVKS || "", 
                    "Организатор": f.conductor || "",
                    "Проект": f.project || "", 
                    "Пулы с ошибками": (f.pools || []).join(', '),
                    "Время с": f.timeFrom || "",
                    "Время по": f.timeTo || ""
                };
                if (f.eventType === 'task') {
                    base["Тип записи"] = "Задача";
                    base["Описание"] = f.description || "";
                } else if (f.eventType === 'vacation') {
                    base["Тип записи"] = "Отпуск";
                    base["Дата начала"] = f.startDate || "";
                    base["Дата окончания"] = f.endDate || "";
                } else {
                    base["Тип записи"] = "ОС";
                }
                return base;
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cleanFeedback), "Обратная связь");
        }
        
        if (state.rawEmployeeMap.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawEmployeeMap), "Сотрудники");
        if (state.rawMarkers.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawMarkers), "Markers (сырые)");
        if (state.rawValidation.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.rawValidation), "Валидация (сырые)");

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
        generateModal.classList.remove('active');
    } catch (err) {
        alert('Ошибка экспорта: ' + err.message);
    }
});

document.getElementById('btnDownloadReport').addEventListener('click', async () => {
    try {
        await generateHtmlReport();
        generateModal.classList.remove('active');
    } catch (err) {
        alert('Ошибка генерации отчёта: ' + err.message);
    }
});

document.getElementById('btnOpenFeedbackModal').addEventListener('click', () => {
    generateModal.classList.remove('active');
    document.getElementById('feedbackModal').classList.add('active');
});

document.getElementById('btnOpenQualityModal').addEventListener('click', () => {
    generateModal.classList.remove('active');
    document.getElementById('qualityModal').classList.add('active');
});

// ===== МОДАЛЬНОЕ ОКНО "ФАЙЛ С КАЧЕСТВОМ" =====
document.getElementById('btnGenerateQualityExcel').addEventListener('click', () => {
    const proj = document.getElementById('qualProjectInput').value.trim();
    const pool = document.getElementById('qualPoolInput').value.trim();
    
    if (!proj || !pool) {
        alert('Выберите проект и пул для генерации файла.');
        return;
    }

    const qualityMap = {};
    
    for (const r of state.processedData) {
        if (r._type !== 'validation') continue;
        const rProj = (r.project || '').replace(/_validate$/, '').trim();
        if (rProj !== proj) continue;
        if (r.pool !== pool) continue;
        if (!r.marker || r.quality == null) continue;

        const fileKey = (r.marker || '') + '|' + r.fileName + '|' + r.fragments;
        if (!qualityMap[r.marker]) qualityMap[r.marker] = { files: new Set(), qualities: [] };
        
        if (!qualityMap[r.marker].files.has(fileKey)) {
            qualityMap[r.marker].files.add(fileKey);
            qualityMap[r.marker].qualities.push(r.quality);
        }
    }

    const rows = [];
    for (const email in qualityMap) {
        const qArr = qualityMap[email].qualities;
        if (qArr.length === 0) continue;
        
        const avgQ = qArr.reduce((a, b) => a + b, 0) / qArr.length;
        
        let formattedQ = Number(avgQ).toFixed(3);
        formattedQ = formattedQ.replace(/\.?0+$/, ''); 

        rows.push({
            "email": email,
            "quality": Number(formattedQ)
        });
    }

    if (rows.length === 0) {
        alert('Нет данных о качестве для выбранного проекта и пула.');
        return;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Качество");
    XLSX.writeFile(wb, `Quality_${proj}_${pool}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    document.getElementById('qualityModal').classList.remove('active');
});

// ===== МОДАЛЬНОЕ ОКНО КАЛЕНДАРЯ =====
document.getElementById('btnSaveFeedback').addEventListener('click', handleSaveFeedback);
document.getElementById('btnSaveEvent').addEventListener('click', handleSaveEvent);

document.getElementById('btnCalPrev').addEventListener('click', () => {
    state.calendarDayOffset -= 7;
    renderCalendar();
});
document.getElementById('btnCalNext').addEventListener('click', () => {
    state.calendarDayOffset += 7;
    renderCalendar();
});
document.getElementById('btnCalToday').addEventListener('click', () => {
    state.calendarDayOffset = 0;
    renderCalendar();
});

// ===== МОДАЛЬНОЕ ОКНО ЗАГРУЗКИ =====
const uploadModal = document.getElementById('uploadModal');
const btnSidebarAdd = document.getElementById('btnSidebarAdd');
const btnCloseModalX = document.getElementById('btnCloseModalX');

const viewSelect = document.getElementById('uploadViewSelect');
const viewProgress = document.getElementById('uploadViewProgress');
const viewPreview = document.getElementById('uploadViewPreview');
const viewDone = document.getElementById('uploadViewDone');
const viewError = document.getElementById('uploadViewError');

const previewFilesContainer = document.getElementById('previewFilesContainer');
const modalProgressFill = document.getElementById('modalProgressFill');
const modalProgressPct = document.getElementById('modalProgressPct');
const modalProgressStage = document.getElementById('modalProgressStage');
const modalProgressTitle = document.getElementById('modalProgressTitle');

const modalDomainInput = document.getElementById('modalDomainInput');
const domainHistoryList = document.getElementById('domainHistoryList');
const domainErrorMsg = document.getElementById('domainErrorMsg');

let pendingFiles = [];
let uploadMode = 'source';

function showModalView(view) {
    viewSelect.style.display = view === 'select' ? 'block' : 'none';
    viewPreview.style.display = view === 'preview' ? 'block' : 'none';
    viewProgress.style.display = view === 'progress' ? 'block' : 'none';
    viewDone.style.display = view === 'done' ? 'block' : 'none';
    viewError.style.display = view === 'error' ? 'block' : 'none';
}

function resetUploadModal() {
    showModalView('select');
    pendingFiles = [];
    uploadModal.classList.remove('active');
    document.getElementById('logBox').innerHTML = '';
    
    if (modalDomainInput) modalDomainInput.value = state.validationBaseUrl || '';
    if (domainHistoryList) domainHistoryList.innerHTML = state.domainHistory.map(d => `<option value="${escapeHtml(d)}">`).join('');
    
    validateDomainInput();
}

if (btnSidebarAdd) btnSidebarAdd.addEventListener('click', () => { resetUploadModal(); uploadModal.classList.add('active'); });
if (btnCloseModalX) btnCloseModalX.addEventListener('click', resetUploadModal);

// Валидация домена
function validateDomainInput() {
    const val = modalDomainInput.value.trim();
    if (!val) {
        modalDomainInput.classList.add('error');
        modalDomainInput.classList.remove('success');
        if (domainErrorMsg) domainErrorMsg.style.display = 'block';
    } else {
        modalDomainInput.classList.remove('error');
        modalDomainInput.classList.add('success');
        if (domainErrorMsg) domainErrorMsg.style.display = 'none';
        
        state.validationBaseUrl = val;
        if (!state.domainHistory.includes(val)) {
            state.domainHistory.push(val);
            if (state.domainHistory.length > 10) state.domainHistory.shift();
            saveToStorage();
            if (domainHistoryList) domainHistoryList.innerHTML = state.domainHistory.map(d => `<option value="${escapeHtml(d)}">`).join('');
        }
    }
}

if (modalDomainInput) {
    modalDomainInput.addEventListener('input', validateDomainInput);
    modalDomainInput.addEventListener('change', validateDomainInput);
}

// Выбор файлов
const fileInput = document.getElementById('fileInput');
const importInput = document.getElementById('importInput');
document.getElementById('btnUploadSource').addEventListener('click', () => { uploadMode = 'source'; fileInput.click(); });
document.getElementById('btnUploadDB').addEventListener('click', () => { uploadMode = 'db'; importInput.click(); });
document.getElementById('btnAddMoreFiles').addEventListener('click', () => fileInput.click());

// ★ ОБНОВЛЕНО: Новые названия типов файлов
function guessFileType(filename) {
    const n = filename.toLowerCase();
    if (n.includes('marker') || n.includes('разметчик')) return 'Статистика по исполнителям';
    if (n.includes('validation_flat') || n.includes('плоск')) return 'Статистика после валидации';
    if (n.includes('valid') || n.includes('валидац')) return 'Результаты валидации';
    if (n.includes('recommend') || n.includes('рекоменд')) return 'Рекомендации';
    if (n.includes('employee') || n.includes('сотрудник')) return 'Список разметчиков';
    if (n.includes('superset 1') || n.includes('суперсет 1') || n.includes('сет1') || n.includes('отклонен')) return 'Отклонения баллов в час';
    if (n.includes('superset 2') || n.includes('суперсет 2') || n.includes('сет2')) return 'Расшифровка по проектам';
    if (n.includes('superset 3') || n.includes('суперсет 3') || n.includes('сет3')) return 'Расшифровка по разметчикам';
    return 'Другое';
}

function renderPreviewFiles() {
    const groups = {};
    pendingFiles.forEach((file, idx) => {
        const type = guessFileType(file.name);
        if (!groups[type]) groups[type] = [];
        groups[type].push({ file, idx });
    });

    let html = '';
    for (const type in groups) {
        html += `<div style="grid-column: 1 / -1; font-weight: 700; font-size: 0.85rem; color: var(--muted); margin-top: 10px; margin-bottom: -5px; text-transform: uppercase;">${type}</div>`;
        for (const item of groups[type]) {
            const sizeMb = (item.file.size / (1024 * 1024)).toFixed(2);
            html += `
                <div class="preview-file-card">
                    <button class="file-remove-btn" onclick="removePendingFile(${item.idx})">&times;</button>
                    <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
                    <div class="file-type-badge">${sizeMb} МБ</div>
                </div>
            `;
        }
    }
    previewFilesContainer.innerHTML = html || '<div style="color:var(--muted); width:100%; text-align:center;">Нет выбранных файлов</div>';
}

window.removePendingFile = (idx) => {
    pendingFiles.splice(idx, 1);
    renderPreviewFiles();
    if (pendingFiles.length === 0) showModalView('select');
};

function handleFileSelection(files) {
    if (!files.length) return;
    if (uploadMode === 'db' && files.length > 1) {
        alert('Для загрузки БД выберите только один файл.');
        pendingFiles = [files[0]];
    } else {
        pendingFiles.push(...Array.from(files));
    }
    renderPreviewFiles();
    showModalView('preview');
}

fileInput.addEventListener('change', (e) => { const files = Array.from(e.target.files); e.target.value = ''; handleFileSelection(files); });
importInput.addEventListener('change', (e) => { const files = Array.from(e.target.files); e.target.value = ''; handleFileSelection(files); });

document.getElementById('btnPreviewCancel').addEventListener('click', resetUploadModal);

document.getElementById('btnPreviewContinue').addEventListener('click', async () => {
    if (pendingFiles.length === 0) return;
    if (!state.validationBaseUrl) {
        alert('Обязательно укажите домен для создания ссылок!');
        showModalView('select');
        return;
    }
    
    showModalView('progress');
    modalProgressFill.style.width = '10%';
    modalProgressPct.textContent = '10%';
    modalProgressStage.textContent = 'Чтение файлов...';
    modalProgressTitle.textContent = 'Загрузка';
    await yieldToUI();
    
    try {
        if (uploadMode === 'source') {
            const results = await readExcelFiles(pendingFiles);
            if (results.length === 0) throw new Error('Файлы не прочитаны или имеют неверный формат.');
            
            modalProgressStage.textContent = 'Проверка на дубликаты...';
            const procRes = await processNewRows(results);
            
            if (procRes.hasConflicts) {
                uploadModal.classList.remove('active');
                openConflictModal(procRes);
            } else {
                showModalView('done');
                document.getElementById('doneMessage').textContent = `Успешно обработано файлов: ${results.length}`;
            }
        } else {
            const file = pendingFiles[0];
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
                    state.rawMarkers = parsedM; state.rawValidation = parsedV; state.rawRecommendations = parsedR;
                    state.rawFlatValidations = parsedF; state.rawSuperset1 = parsedS1;
                    state.rawSuperset2 = parsedS2; state.rawSuperset3 = parsedS3; state.rawEmployeeMap = parsedEmp;
                    
                    // ★ ОБНОВЛЕНО: Импорт ОС с учетом новых полей
                    if (parsedFb.length > 0) {
                        state.feedbackData = parsedFb.map(row => {
                            let dateStr = row['Дата'];
                            if (dateStr) {
                                const d = parseExcelDate(dateStr);
                                if (d && !isNaN(d.getTime())) dateStr = d.toISOString().slice(0, 10);
                            }
                            
                            let avgQ = row['Ср. качество за период'];
                            if (avgQ === '' || avgQ === undefined) avgQ = null;
                            else if (typeof avgQ === 'string') {
                                avgQ = parseFloat(avgQ.replace('%', '').replace(',', '.')) / 100;
                            }

                            const rec = {
                                date: dateStr || '', 
                                markers: (row['Разметчик'] || '').split(',').map(s=>s.trim()).filter(Boolean), 
                                status: row['Статус'] || '',
                                typeVKS: row['Тип ВКС'] || '', 
                                conductor: row['Организатор'] || '',
                                project: row['Проект'] || '', 
                                pools: (row['Пулы с ошибками'] || '').split(',').map(s=>s.trim()).filter(Boolean),
                                timeFrom: row['Время с'] || '',
                                timeTo: row['Время по'] || '',
                                avgQuality: avgQ,
                                eventType: 'oc'
                            };
                            
                            if (row['Тип записи'] === 'Задача') {
                                rec.eventType = 'task';
                                rec.description = row['Описание'] || '';
                            } else if (row['Тип записи'] === 'Отпуск') {
                                rec.eventType = 'vacation';
                                rec.startDate = row['Дата начала'] || dateStr;
                                rec.endDate = row['Дата окончания'] || dateStr;
                            }
                            
                            return rec;
                        });
                        saveFeedbackToStorage();
                    }
                    saveToStorage();
                    await recomputeDashboard();
                    showModalView('done');
                    document.getElementById('doneMessage').textContent = 'База данных успешно восстановлена.';
                } catch (err) {
                    document.getElementById('errorMessage').textContent = err.message;
                    showModalView('error');
                }
            };
            reader.readAsArrayBuffer(file);
        }
    } catch (err) {
        document.getElementById('errorMessage').textContent = err.message;
        showModalView('error');
    }
});

document.getElementById('btnDoneClose').addEventListener('click', resetUploadModal);
document.getElementById('btnUploadMore').addEventListener('click', () => { pendingFiles = []; showModalView('select'); });
document.getElementById('btnErrorClose').addEventListener('click', () => showModalView('select'));

// ===== МОДАЛЬНОЕ ОКНО КОНФЛИКТОВ =====
const conflictModal = document.getElementById('conflictModal');
const conflictList = document.getElementById('conflictList');

function openConflictModal(procRes) {
    document.getElementById('doneMessage').textContent = `Добавлено новых записей: ${procRes.newCount}. Найдено конфликтов: ${procRes.conflictsCount}.`;
    
    conflictList.innerHTML = state.pendingConflicts.map((c, idx) => {
        let oldDiffs = '';
        let newDiffs = '';
        
        if (c.newRow && c.oldRow) {
            const keys = Object.keys(c.newRow);
            for (const k of keys) {
                if (k.startsWith('_')) continue;
                const oldVal = String(c.oldRow[k] || '').trim();
                const newVal = String(c.newRow[k] || '').trim();
                if (oldVal !== newVal) {
                    oldDiffs += `<div class="conflict-diff" style="margin-bottom: 6px;"><span style="font-weight:700;">${escapeHtml(k)}:</span><br><span style="color:var(--danger);">${escapeHtml(oldVal)}</span></div>`;
                    newDiffs += `<div class="conflict-diff" style="margin-bottom: 6px;"><span style="font-weight:700;">${escapeHtml(k)}:</span><br><span style="color:var(--success);">${escapeHtml(newVal)}</span></div>`;
                }
            }
        }
        
        const proj = (c.newRow && (c.newRow['Проект'] || c.newRow['project'])) || '—';
        const pool = (c.newRow && (c.newRow['Задача'] || c.newRow['Пул'] || c.newRow['pool'])) || '—';

        return `
            <div class="conflict-card" id="conflict-${idx}">
                <div class="conflict-col conflict-old" onclick="toggleConflictChoice(${idx}, 'old')">
                    <h4>Старое (в базе)</h4>
                    <div class="conflict-diff"><span>Проект:</span> ${escapeHtml(proj)}</div>
                    <div class="conflict-diff"><span>Пул:</span> ${escapeHtml(pool)}</div>
                    <div style="margin-top:10px; font-size:0.8rem; color:var(--muted); margin-bottom:10px;">Файл: ${escapeHtml(c.fileName || '—')}</div>
                    ${oldDiffs || '<div style="color:var(--muted); font-size:0.85rem;">Нет отличий</div>'}
                </div>
                <div class="conflict-col conflict-new" onclick="toggleConflictChoice(${idx}, 'new')">
                    <h4 style="color: var(--success);">Новое (из файла)</h4>
                    <div class="conflict-diff"><span>Проект:</span> ${escapeHtml(proj)}</div>
                    <div class="conflict-diff"><span>Пул:</span> ${escapeHtml(pool)}</div>
                    <div style="margin-top:10px; font-size:0.8rem; color:var(--muted); margin-bottom:10px;">Файл: ${escapeHtml(c.fileName || '—')}</div>
                    ${newDiffs || '<div style="color:var(--muted); font-size:0.85rem;">Нет отличий</div>'}
                </div>
            </div>
        `;
    }).join('');
    
    state.pendingConflicts.forEach((c, idx) => {
        c.selOld = true;
        c.selNew = false;
        c.choice = 'old';
        setTimeout(() => {
            const card = document.getElementById(`conflict-${idx}`);
            if (card) card.querySelector('.conflict-old').classList.add('selected');
        }, 0);
    });
    
    conflictModal.classList.add('active');
}

window.toggleConflictChoice = (idx, type) => {
    const c = state.pendingConflicts[idx];
    const card = document.getElementById(`conflict-${idx}`);
    if (!card) return;
    
    const oldCol = card.querySelector('.conflict-old');
    const newCol = card.querySelector('.conflict-new');
    
    if (type === 'old') c.selOld = !c.selOld;
    else c.selNew = !c.selNew;
    
    if (!c.selOld && !c.selNew) {
        if (type === 'old') c.selOld = true;
        else c.selNew = true;
    }
    
    oldCol.classList.toggle('selected', c.selOld);
    newCol.classList.toggle('selected', c.selNew);
    
    if (c.selOld && c.selNew) {
        c.choice = 'merge';
        oldCol.classList.add('merge-active');
        newCol.classList.add('merge-active');
    } else {
        c.choice = c.selOld ? 'old' : 'new';
        oldCol.classList.remove('merge-active');
        newCol.classList.remove('merge-active');
    }
};

document.getElementById('btnConflictKeepOld').addEventListener('click', () => {
    state.pendingConflicts.forEach(c => c.choice = 'old');
    commitNewData(state.pendingConflicts);
    conflictModal.classList.remove('active');
    showModalView('done');
});

// ★ НОВОЕ: Кнопка "Объединить всё"
document.getElementById('btnConflictMergeAll').addEventListener('click', () => {
    state.pendingConflicts.forEach(c => c.choice = 'merge');
    commitNewData(state.pendingConflicts);
    conflictModal.classList.remove('active');
    showModalView('done');
});

document.getElementById('btnConflictApplyAll').addEventListener('click', () => {
    commitNewData(state.pendingConflicts);
    conflictModal.classList.remove('active');
    showModalView('done');
});

// ===== СКРОЛЛ ФИЛЬТРОВ =====
const contentScroll = document.getElementById('mainScrollContainer');
const sectionSuperset = document.getElementById('section-superset-block');
const filtersMain = document.getElementById('filters-main');
const filtersSuperset = document.getElementById('filters-superset');

if (contentScroll && sectionSuperset && filtersMain && filtersSuperset) {
    contentScroll.addEventListener('scroll', () => {
        if (state.currentMenu !== 'main') return;
        
        const rect = sectionSuperset.getBoundingClientRect();
        if (rect.top <= 60) {
            filtersMain.style.display = 'none';
            filtersSuperset.style.display = 'flex';
        } else {
            filtersMain.style.display = 'flex';
            filtersSuperset.style.display = 'none';
        }
    });
}

// ===== ОБЩАЯ ЛОГИКА =====
function handleClearAll() {
    if (!confirm('Удалить все данные?')) return;
    
    state.rawMarkers = []; state.rawValidation = []; state.rawRecommendations = []; state.rawRecommendationsManual = [];
    state.rawFlatValidations = []; state.rawSuperset1 = []; state.rawSuperset2 = []; state.rawSuperset3 = [];
    state.rawEmployeeMap = []; state.processedData = []; state.feedbackData = [];
    state.validationBaseUrl = ''; state.domainHistory = []; state.calendarDayOffset = 0;
    
    state.superset.table1 = []; state.superset.table2 = []; state.superset.table3 = []; state.superset.table4 = [];
    state.superset.filteredTable1 = []; state.superset.filteredTable2 = []; state.superset.filteredTable3 = []; state.superset.filteredTable4 = [];
    state.superset.norms = { byProjectPool: {}, byProject: {}, globalAvg: null };
    state.superset.employeeMap = { fioToEmail: {}, emailToFio: {} };
    state.superset._mainProjects = null;
    state.superset.filters = { dateFrom: '', dateTo: '', tasks: new Set() };
    state.superset.tableFilters = { t1: {}, t2: {}, t3: {}, t4: {} };
    
    state.feedbackGeneration.appliedPools.clear(); state.feedbackGeneration.appliedGroups.clear(); state.feedbackGeneration.videoLinks = {};
    const fbGenContainer = document.getElementById('feedbackGenerationBlocks');
    if (fbGenContainer) fbGenContainer.innerHTML = '';
    
    for (const key in state.pagination) state.pagination[key] = 1;
    try { localStorage.removeItem('validation_dashboard_data_v3'); localStorage.removeItem('validation_feedback_data_v1'); } catch (e) { }
    
    const recBody = document.getElementById('recTableBody');
    if (recBody) { recBody.innerHTML = ''; addRecRow(); }
    
    if (modalDomainInput) modalDomainInput.value = '';
    if (domainHistoryList) domainHistoryList.innerHTML = '';
    
    buildSuperset(); buildProjectTabs(); renderMarkersTasksStatus(); triggerFilterUpdate();
    renderSupersetPage();
    renderCalendar();
    updateProgress(0, '', 'Готово');
}

// Делегирование кликов по табам
const projectTabsContainer = document.getElementById('projectTabs');
if (projectTabsContainer) {
    projectTabsContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;
        switchTab(tabEl.dataset.tab, tabEl);
    });
}

// Даты в суперсете
const supersetDateFrom = document.getElementById('supersetDateFrom');
const supersetDateTo = document.getElementById('supersetDateTo');
if (supersetDateFrom) supersetDateFrom.addEventListener('change', onSupersetDateChange);
if (supersetDateTo) supersetDateTo.addEventListener('change', onSupersetDateChange);

// Обновление UI
window.addEventListener('app:data-updated', () => {
    state.superset.filters.dateFrom = '';
    state.superset.filters.dateTo = '';
    state.superset.filters.tasks.clear();
    state.superset.tableFilters = { t1: {}, t2: {}, t3: {}, t4: {} };

    state.feedbackGeneration.appliedPools.clear();
    state.feedbackGeneration.appliedGroups.clear();
    state.feedbackGeneration.videoLinks = {};

    for (const key in state.pagination) state.pagination[key] = 1;

    buildSuperset();
    populateAllMultiSelects();
    populateRecDatalists();
    buildProjectTabs();
    renderMarkersTasksStatus();
    triggerFilterUpdate();
    if (state.currentMenu === 'main') {
        applySupersetFilters();
        renderSupersetPage();
    }
    renderCalendar();
    renderNotificationsTable();
});

// Закрытие dropdown
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
        document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    }
});

// Фильтры по дате
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

// Таблица рекомендаций
function getRecRowsData() {
    const rows = [];
    document.querySelectorAll('#recTableBody tr').forEach(tr => {
        const date = tr.querySelector('.rec-date').value;
        const marker = tr.querySelector('.rec-marker').value.trim();
        if (!date && !marker && !tr.querySelector('.rec-comment').value.trim() && !tr.querySelector('.rec-item').value.trim()) return;
        rows.push({
            'Дата валидации': date, 'Проект': tr.querySelector('.rec-project').value.trim(),
            'Пул': tr.querySelector('.rec-pool').value.trim(), 'Почта разметчика': marker,
            'item_id': tr.querySelector('.rec-item').value.trim(), 'Интервал': tr.querySelector('.rec-interval').value.trim(),
            'Комментарий': tr.querySelector('.rec-comment').value.trim(), 'Почта валидатора': tr.querySelector('.rec-validator').value.trim()
        });
    });
    return rows;
}

document.getElementById('btnAddRecRow').addEventListener('click', addRecRow);

document.getElementById('btnSaveRecommendations').addEventListener('click', async () => {
    const rows = getRecRowsData();
    if (rows.length === 0) { alert('Заполните хотя бы одну строку'); return; }
    const invalid = rows.find(r => !r['Дата валидации'] || !r['Почта разметчика']);
    if (invalid) { alert('В каждой строке должны быть заполнены «Дата валидации» и «Почта разметчика»'); return; }
    
    state.rawRecommendationsManual.push(...rows);
    saveToStorage();
    await recomputeDashboard();
    document.getElementById('recTableBody').innerHTML = '';
    addRecRow();
    log(`Добавлено рекомендаций: ${rows.length}`, false);
});

document.getElementById('btnExportRecommendations').addEventListener('click', () => {
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
        try { triggerFilterUpdate(); renderSupersetPage(); renderCalendar(); renderNotificationsTable(); } catch (e2) { }
    });
} else {
    buildSuperset(); buildProjectTabs(); renderMarkersTasksStatus(); triggerFilterUpdate();
    renderSupersetPage();
    renderCalendar(); renderNotificationsTable();
}