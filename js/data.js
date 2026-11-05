// js/data.js — ДОБАВЛЕНА ЛОГИКА ПРОВЕРКИ НА ДУБЛИКАТЫ И КОНФЛИКТЫ
// ★ ИЗМЕНЕНО: processNewRows теперь не сохраняет данные сразу, а ищет дубликаты и конфликты.
// ★ ДОБАВЛЕНО: commitNewData — применяет новые данные и разрешает конфликты.
// Ранее добавленное: полное название пула (без обрезания проекта), _domain, пропуск 0 фрагментов.

import { state, saveToStorage } from './state.js';
import {
    parseExcelDate, getVal, stripJson, formatInterval,
    detectTableType, updateProgress, log, yieldToUI
} from './utils.js';

// ★ ФУНКЦИЯ: Приводит ID (task_id, marker_id и т.д.) к единому виду, убирая .0
function normalizeId(id) {
    if (id == null) return '';
    const s = String(id).trim();
    if (/^\d+\.0+$/.test(s)) {
        return s.split('.')[0];
    }
    return s;
}

function readOneExcelFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws, { defval: null });
                resolve({ ok: true, file: file.name, rows: json });
            } catch (err) { resolve({ ok: false, file: file.name, error: err.message }); }
        };
        reader.onerror = () => resolve({ ok: false, file: file.name, error: 'FileReader error' });
        reader.readAsArrayBuffer(file);
    });
}

export async function readExcelFiles(files) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
        const pct = (i / files.length) * 100;
        updateProgress(pct, 'Чтение: ' + files[i].name, 'Чтение файлов');
        await yieldToUI();
        const r = await readOneExcelFile(files[i]);
        if (r.ok) log('✓ ' + r.file + ' — прочитан');
        else log('✗ ' + r.file + ' — ошибка: ' + r.error, true);
        results.push(r);
    }
    return results.filter(r => r.ok);
}

function parseFileProjectPool(filename) {
    if (!filename) return { project: null, pool: null };
    const base = String(filename).replace(/\.(xlsx|xls)$/i, '').trim();
    const idx = base.indexOf('_');
    if (idx <= 0) return { project: base || null, pool: null };
    const project = base.substring(0, idx).trim().replace(/_validate$/, '') || null;
    const pool = base.substring(idx + 1).trim() || null;
    return { project, pool };
}

function detectRadioColumn(rows) {
    if (!rows || rows.length === 0) return false;
    const keys = Object.keys(rows[0]);
    for (const k of keys) {
        const lk = k.toLowerCase().trim();
        if (lk === 'radio' || lk === 'радио') return true;
    }
    return false;
}

// ===== ЛОГИКА ПОИСКА КОНФЛИКТОВ =====
function getRowKey(type, row) {
    if (!row) return null;
    if (type === 'validation') return normalizeId(getVal(row, 'assignment_id'));
    if (type === 'markers') return normalizeId(getVal(row, 'ID задачи')) + '|' + normalizeId(getVal(row, 'ID разметчика'));
    if (type === 'recommendations') return normalizeId(getVal(row, 'item_id')) + '|' + (getVal(row, 'Почта разметчика') || '').trim();
    if (type === 'employee_map') return (getVal(row, 'ФИО') || '').trim() + '|' + (getVal(row, 'Почта') || '').trim();
    if (type === 'validation_flat') return (getVal(row, 'url задания') || '') + '|' + (getVal(row, 'email') || '');
    if (type === 'superset1') return (getVal(row, 'Проект') || '').trim() + '|' + (getVal(row, 'Задача') || '').trim();
    if (type === 'superset2') return (getVal(row, 'Проект') || '').trim() + '|' + (getVal(row, 'Задача') || '').trim() + '|' + (getVal(row, 'Дата начала') || '') + '|' + (getVal(row, 'Дата окончания') || '');
    if (type === 'superset3') return (getVal(row, 'ФИО') || '').trim() + '|' + (getVal(row, 'Дата') || '') + '|' + (getVal(row, 'Проект') || '').trim() + '|' + (getVal(row, 'Задача') || '').trim();
    return JSON.stringify(row);
}

function normalizeForCompare(obj) {
    if (!obj) return '';
    const cleanObj = {};
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
        if (k.startsWith('_')) continue; // Игнорируем служебные поля (например, _domain)
        let val = obj[k];
        if (val === null || val === undefined) val = '';
        cleanObj[k] = String(val).trim();
    }
    return JSON.stringify(cleanObj);
}

function isRowEqual(rowA, rowB) {
    return normalizeForCompare(rowA) === normalizeForCompare(rowB);
}

// ★ Обновленная функция обработки новых данных
export async function processNewRows(results) {
    state.pendingNewData = { markers: [], validation: [], recommendations: [], flat: [], superset1: [], superset2: [], superset3: [], employee: [] };
    state.pendingConflicts = [];

    const currentDomain = state.validationBaseUrl || '';

    for (const { file, rows } of results) {
        const hasRadioColumn = detectRadioColumn(rows);

        for (const row of rows) {
            if (Object.values(row).filter(v => v !== null && v !== '').length < 2) continue;
            const type = detectTableType(row);

            let rawArray = [];
            let pendingKey = '';
            if (type === 'markers') { rawArray = state.rawMarkers; pendingKey = 'markers'; }
            else if (type === 'validation') { rawArray = state.rawValidation; pendingKey = 'validation'; }
            else if (type === 'recommendations') { rawArray = state.rawRecommendations; pendingKey = 'recommendations'; }
            else if (type === 'employee_map') { rawArray = state.rawEmployeeMap; pendingKey = 'employee'; }
            else if (type === 'validation_flat') { rawArray = state.rawFlatValidations; pendingKey = 'flat'; }
            else if (type === 'superset1') { rawArray = state.rawSuperset1; pendingKey = 'superset1'; }
            else if (type === 'superset2') { rawArray = state.rawSuperset2; pendingKey = 'superset2'; }
            else if (type === 'superset3') { rawArray = state.rawSuperset3; pendingKey = 'superset3'; }

            if (!rawArray) continue;

            // Для плоской валидации добавляем мета-данные
            let processedRow = Object.assign({}, row);
            if (type === 'validation') processedRow._domain = currentDomain;
            if (type === 'validation_flat') {
                if (getVal(processedRow, 'Проект') == null) {
                    const meta = parseFileProjectPool(file);
                    if (meta.project) processedRow['Проект'] = meta.project;
                    if (meta.pool) processedRow['Пул'] = meta.pool;
                } else if (getVal(processedRow, 'Пул') == null) {
                    const meta = parseFileProjectPool(file);
                    if (meta.pool) processedRow['Пул'] = meta.pool;
                }
                processedRow._hasRadio = hasRadioColumn;
            }

            const newKey = getRowKey(type, processedRow);
            if (!newKey) continue;

            const existingRow = rawArray.find(r => getRowKey(type, r) === newKey);

            if (!existingRow) {
                // Данных нет — добавляем в список на сохранение
                state.pendingNewData[pendingKey].push(processedRow);
            } else if (!isRowEqual(existingRow, processedRow)) {
                // Данные есть, но они ОТЛИЧАЮТСЯ (конфликт / обновление)
                state.pendingConflicts.push({
                    type,
                    pendingKey,
                    key: newKey,
                    oldRow: existingRow,
                    newRow: processedRow,
                    fileName: file
                });
            }
            // Если isRowEqual === true, значит данные полностью идентичны — просто игнорируем (защита от дублей)
        }
    }

    // Если есть конфликты — возвращаем их, чтобы app.js показал модальное окно
    const totalNew = Object.values(state.pendingNewData).reduce((a, b) => a + b.length, 0);
    if (state.pendingConflicts.length > 0) {
        return { hasConflicts: true, newCount: totalNew, conflictsCount: state.pendingConflicts.length };
    }

    // Если конфликтов нет — сохраняем всё сразу
    if (totalNew > 0) {
        commitNewData();
        log(`Добавлено новых записей: ${totalNew}`, false);
    } else {
        log(`Все загруженные данные уже есть в базе (дубликаты).`, false);
        state.pendingNewData = null;
    }
    return { hasConflicts: false };
}

// ★ Функция применения данных (вызывается либо сразу, либо после выбора в модалке)
export function commitNewData(resolvedConflicts = []) {
    if (!state.pendingNewData) return;

    // 1. Добавляем новые данные
    state.rawMarkers.push(...state.pendingNewData.markers);
    state.rawValidation.push(...state.pendingNewData.validation);
    state.rawRecommendations.push(...state.pendingNewData.recommendations);
    state.rawEmployeeMap.push(...state.pendingNewData.employee);
    state.rawFlatValidations.push(...state.pendingNewData.flat);
    state.rawSuperset1.push(...state.pendingNewData.superset1);
    state.rawSuperset2.push(...state.pendingNewData.superset2);
    state.rawSuperset3.push(...state.pendingNewData.superset3);

    // 2. Применяем разрешенные конфликты (где выбрали "Новое")
    const arrays = {
        markers: state.rawMarkers, validation: state.rawValidation, recommendations: state.rawRecommendations,
        employee: state.rawEmployeeMap, flat: state.rawFlatValidations, superset1: state.rawSuperset1,
        superset2: state.rawSuperset2, superset3: state.rawSuperset3
    };

    for (const conflict of resolvedConflicts) {
        if (conflict.choice === 'new') {
            const arr = arrays[conflict.pendingKey];
            if (arr) {
                const idx = arr.findIndex(r => getRowKey(conflict.type, r) === conflict.key);
                if (idx !== -1) {
                    arr[idx] = conflict.newRow;
                }
            }
        }
    }

    state.pendingNewData = null;
    state.pendingConflicts = [];
    saveToStorage();
    recomputeDashboard(); // Пересчитываем дашборд после обновления
}

// ===== Стандартные функции парсинга =====

function computeQuality(sumWeights, totalFragments, mistakesCount) {
    if (mistakesCount === 0) return 1;
    if (totalFragments === 0) return 0;
    let q = 1 - (sumWeights / totalFragments);
    if (!isFinite(q) || isNaN(q)) return 0;
    if (q < 0) return 0;
    if (q > 1) return 1;
    return q;
}

function processFlatValidations() {
    if (!state.rawFlatValidations || state.rawFlatValidations.length === 0) return;

    const groups = {};
    for (const r of state.rawFlatValidations) {
        if (!r) continue;
        const email = getVal(r, 'email') || '';
        const fileNameRaw = getVal(r, 'file_name') || '';
        const projectKey = getVal(r, 'Проект') || '';
        const poolKey = getVal(r, 'Пул') || '';
        const key = [email, fileNameRaw, projectKey, poolKey].join('|');
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    }

    let addedRows = 0;
    let processedTasks = 0;
    let skippedFlat = 0;

    for (const key in groups) {
        const rows = groups[key];
        const first = rows[0];
        processedTasks++;

        const project = (getVal(first, 'Проект') || '').replace(/_validate$/, '').trim() || null;
        const pool = (getVal(first, 'Пул') || '').trim() || null;
        const fileName = stripJson(getVal(first, 'file_name'));
        const date = parseExcelDate(getVal(first, 'дата разметки'));
        const marker = getVal(first, 'email');
        const validator = getVal(first, 'email проверяющего');
        const totalFragments = Number(getVal(first, 'меток с учетом предразметки')) || 0;
        const declaredErrors = Number(getVal(first, 'некорректных меток')) || 0;
        const taskUrl = getVal(first, 'url задания');

        if (totalFragments === 0) {
            log(`⚠️ Плоский формат: пропущено задание ${fileName || '(без имени)'} — 0 фрагментов.`, true);
            skippedFlat++;
            continue;
        }

        const flag = first._hasRadio;
        let hasRadio;
        if (flag === true || flag === 'true' || flag === 1 || flag === '1') hasRadio = true;
        else if (flag === false || flag === 'false' || flag === 0 || flag === '0') hasRadio = false;
        else {
            hasRadio = rows.some(r => {
                const radio = getVal(r, 'radio', 'радио');
                if (radio == null) return false;
                const s = String(radio).trim();
                return s !== '' && s !== '-';
            });
        }

        const mistakes = [];
        if (hasRadio) {
            for (const r of rows) {
                const radio = getVal(r, 'radio', 'радио');
                if (radio == null) continue;
                const s = String(radio).trim();
                if (s === '' || s === '-') continue;
                const weight = s === 'Некритичная ошибка' ? 0.5 : 1;
                mistakes.push({ typ: s, weight });
            }
        }
        if (hasRadio && declaredErrors > mistakes.length) {
            for (let k = mistakes.length; k < declaredErrors; k++) {
                mistakes.push({ typ: 'Неизвестная ошибка', weight: 1 });
            }
        }

        const sumWeights = mistakes.reduce((a, b) => a + b.weight, 0);
        const quality = computeQuality(sumWeights, totalFragments, mistakes.length);

        if (mistakes.length === 0) {
            state.processedData.push({
                _id: 'vf_' + Math.random().toString(36).slice(2, 9),
                _type: 'validation', _linked: null,
                date, pool, marker, validator, project, fileName,
                result: 'Ошибки не выявлены', errorType: null, comment: null,
                quality: 1, interval: null, fragments: totalFragments,
                url: taskUrl
            });
            addedRows++;
        } else {
            for (const mis of mistakes) {
                state.processedData.push({
                    _id: 'vf_' + Math.random().toString(36).slice(2, 9),
                    _type: 'validation', _linked: null,
                    date, pool, marker, validator, project, fileName,
                    result: 'Ошибка', errorType: mis.typ, comment: null,
                    quality, interval: null, fragments: totalFragments,
                    url: taskUrl
                });
                addedRows++;
            }
        }
    }
    log(`Плоский формат: обработано заданий (${processedTasks}), записей (${addedRows})${skippedFlat ? `, пропущено (${skippedFlat})` : ''}`);
}

export async function recomputeDashboard() {
    state.processedData = [];
    const skippedFragments = [];
    updateProgress(10, 'Построение словаря разметчиков...', 'Пересчет');
    await yieldToUI();

    const markerDict = {};
    for (const m of state.rawMarkers) {
        if (!m || typeof m !== 'object') continue;
        const taskStr = getVal(m, 'Задача');
        let pool = null, marker = null;
        
        if (taskStr) {
            const idx = taskStr.lastIndexOf('_validate_');
            if (idx !== -1) {
                marker = taskStr.substring(idx + '_validate_'.length).trim();
                // ★ ИЗМЕНЕНО: сохраняем полное название задачи (пула) без обрезания проекта
                pool = taskStr.substring(0, idx).trim(); 
            }
        }
        
        const taskId = normalizeId(getVal(m, 'ID задачи'));
        const markerId = normalizeId(getVal(m, 'ID разметчика'));
        const project = (getVal(m, 'Проект') || '').replace(/_validate$/, '').trim() || null;
        
        if (taskId && markerId) {
            markerDict[`${taskId}|${markerId}`] = {
                pool, marker, validator: getVal(m, 'Email'), project
            };
        }
    }

    updateProgress(30, 'Обработка исправлений...', 'Пересчет');
    await yieldToUI();

    const valDict = {};
    for (const v of state.rawValidation) {
        if (!v) continue;
        const aid = normalizeId(getVal(v, 'assignment_id'));
        if (aid) valDict[aid] = v;
    }
    const childrenToRemove = new Set();
    for (const v of state.rawValidation) {
        if (!v) continue;
        const origId = normalizeId(getVal(v, 'original_assignment_id'));
        if (origId && origId !== '') {
            const parent = valDict[origId];
            if (parent) parent['OUTPUT:marks'] = v['OUTPUT:marks'];
            childrenToRemove.add(v);
        }
    }
    const validValidations = state.rawValidation.filter(v => v && !childrenToRemove.has(v));

    updateProgress(50, 'Парсинг JSON...', 'Пересчет');
    await yieldToUI();

    for (const v of validValidations) {
        const taskId = normalizeId(getVal(v, 'task_id'));
        const markerId = normalizeId(getVal(v, 'marker_id'));
        const fileName = stripJson(getVal(v, 'file_name', 'Наименование файла'));
        const date = parseExcelDate(getVal(v, 'start_date', 'Дата валидации'));

        const orgId = getVal(v, 'organization_id');
        const assignmentId = normalizeId(getVal(v, 'assignment_id'));
        const itemId = normalizeId(getVal(v, 'item_id'));

        const mInfo = markerDict[`${taskId}|${markerId}`] || { pool: null, marker: null, validator: null, project: null };

        const jsonStr = getVal(v, 'OUTPUT:marks', 'output_marks');
        let totalFragments = 0, mistakes = [];

        if (jsonStr) {
            try {
                const data = JSON.parse(jsonStr);
                if (Array.isArray(data)) {
                    const segments = data.filter(d => d.type === 'segment');
                    totalFragments = segments.filter(d => d.entityId !== 'mistake').length;
                    mistakes = segments.filter(d => d.entityId === 'mistake').map(m => {
                        const typ = m.fields?.radio?.value || 'Неизвестная ошибка';
                        const comm = m.fields?.comment?.value || '';
                        const weight = typ === 'Некритичная ошибка' ? 0.5 : 1;
                        return { typ, comm, weight, interval: formatInterval(m.position?.start, m.position?.finish) };
                    });
                }
            } catch (e) { /* ignore */ }
        }

        if (totalFragments === 0) {
            skippedFragments.push({
                fileName,
                date,
                marker: mInfo.marker,
                reason: '0 фрагментов'
            });
            continue;
        }

        const sumWeights = mistakes.reduce((a, b) => a + b.weight, 0);
        const quality = computeQuality(sumWeights, totalFragments, mistakes.length);
        const domain = v._domain || '';

        if (mistakes.length === 0) {
            state.processedData.push({
                _id: 'v_' + Math.random().toString(36).slice(2, 9),
                _type: 'validation', _linked: null,
                date, pool: mInfo.pool, marker: mInfo.marker, validator: mInfo.validator, project: mInfo.project,
                fileName, result: 'Ошибки не выявлены', errorType: null, comment: null,
                quality: 1, interval: null, fragments: totalFragments,
                orgId, assignmentId, itemId,
                _domain: domain
            });
        } else {
            for (const mis of mistakes) {
                state.processedData.push({
                    _id: 'v_' + Math.random().toString(36).slice(2, 9),
                    _type: 'validation', _linked: null,
                    date, pool: mInfo.pool, marker: mInfo.marker, validator: mInfo.validator, project: mInfo.project,
                    fileName, result: 'Ошибка', errorType: mis.typ, comment: mis.comm,
                    quality, interval: mis.interval, fragments: totalFragments,
                    orgId, assignmentId, itemId,
                    _domain: domain
                });
            }
        }
    }

    updateProgress(65, 'Обработка плоского формата...', 'Пересчет');
    await yieldToUI();
    processFlatValidations();

    updateProgress(80, 'Обработка рекомендаций...', 'Пересчет');
    await yieldToUI();

    const allRecommendations = [
        ...state.rawRecommendations,
        ...(state.rawRecommendationsManual || [])
    ];
    for (const r of allRecommendations) {
        if (!r) continue;
        state.processedData.push({
            _id: 'r_' + Math.random().toString(36).slice(2, 9),
            _type: 'recommendations', _linked: null,
            date: parseExcelDate(getVal(r, 'Дата валидации')),
            pool: getVal(r, 'Пул') || null,
            marker: getVal(r, 'Почта разметчика') || null,
            validator: getVal(r, 'Почта валидатора') || null,
            project: getVal(r, 'Проект') || null,
            fileName: stripJson(getVal(r, 'Наименование файла')) || null,
            result: 'Рекомендация', errorType: null,
            comment: getVal(r, 'Комментарий'),
            quality: null,
            interval: getVal(r, 'Временной интервал фрагмента', 'Интервал') || null,
            fragments: 0,
            itemId: normalizeId(getVal(r, 'item_id', 'ID задания', 'ID item')) || null
        });
    }

    updateProgress(90, 'Связывание...', 'Пересчет');
    await yieldToUI();

    const valIndexByFile = {};
    const valIndexByItem = {};
    
    for (const v of state.processedData) {
        if (v._type === 'validation') {
            const key = `${v.pool || ''}|${v.marker || ''}|${v.validator || ''}|${v.fileName || ''}`;
            if (!valIndexByFile[key]) valIndexByFile[key] = v;
            
            if (v.itemId) {
                if (!valIndexByItem[v.itemId]) valIndexByItem[v.itemId] = v;
            }
        }
    }
    
    for (const r of state.processedData) {
        if (r._type === 'recommendations') {
            let linkedVal = null;
            
            if (r.itemId && valIndexByItem[r.itemId]) {
                linkedVal = valIndexByItem[r.itemId];
            } else {
                const key = `${r.pool || ''}|${r.marker || ''}|${r.validator || ''}|${r.fileName || ''}`;
                if (valIndexByFile[key]) linkedVal = valIndexByFile[key];
            }

            if (linkedVal) {
                r._linked = linkedVal._id;
                r.quality = linkedVal.quality;
                if (!r.project) r.project = linkedVal.project;
                if (!r.fileName) r.fileName = linkedVal.fileName;
            }
        }
    }

    if (skippedFragments.length > 0) {
        log(`⚠️ Пропущено ${skippedFragments.length} заданий — 0 фрагментов (аномалия выгрузки). Загружены только корректные данные.`, true);
        const examples = skippedFragments.slice(0, 5).map(s =>
            `• ${s.fileName || '(без имени)'}${s.marker ? ' — ' + s.marker : ''}`
        );
        if (examples.length) log('Примеры: ' + examples.join(' | '), true);
    }

    updateProgress(100, 'Готово', 'Пересчет');
    window.dispatchEvent(new CustomEvent('app:data-updated'));
}

export function matchesTab(r) {
    if (state.currentTab === 'all') return true;
    const project = (r.project || '').trim();
    return project === state.currentTab;
}

export function applyFilters() {
    const from = document.getElementById('filterDateFrom').value;
    const to = document.getElementById('filterDateTo').value;

    const { pool, marker, result } = state.filterState;
    const poolEmpty = pool.size === 0;
    const markerEmpty = marker.size === 0;
    const resultEmpty = result.size === 0;

    state.filteredData = state.processedData.filter(r => {
        if (!matchesTab(r)) return false;
        if (!poolEmpty && !pool.has(r.pool || '')) return false;
        if (!markerEmpty && !marker.has(r.marker || '')) return false;
        if (!resultEmpty && !result.has(r.result || '')) return false;
        
        if (r.date) {
            const d = new Date(r.date);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const rDateStr = `${y}-${m}-${day}`;

                if (from && rDateStr < from) return false;
                if (to && rDateStr > to) return false;
            }
        }
        
        return true;
    });
}