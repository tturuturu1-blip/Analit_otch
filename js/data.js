import { state, saveToStorage } from './state.js';
import {
    parseExcelDate, getVal, stripJson, formatInterval,
    detectTableType, updateProgress, log, yieldToUI
} from './utils.js';

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

export async function processNewRows(results) {
    let addedM = 0, addedV = 0, addedR = 0, addedF = 0;
    let addedS1 = 0, addedS2 = 0, addedS3 = 0;

    for (const { file, rows } of results) {
        const hasRadioColumn = detectRadioColumn(rows);

        for (const row of rows) {
            if (Object.values(row).filter(v => v !== null && v !== '').length < 2) continue;
            const type = detectTableType(row);

            if (type === 'markers') { state.rawMarkers.push(row); addedM++; }
            else if (type === 'validation') { state.rawValidation.push(row); addedV++; }
            else if (type === 'recommendations') { state.rawRecommendations.push(row); addedR++; }
            else if (type === 'validation_flat') {
                const rowWithMeta = Object.assign({}, row);
                if (getVal(rowWithMeta, 'Проект') == null) {
                    const meta = parseFileProjectPool(file);
                    if (meta.project) rowWithMeta['Проект'] = meta.project;
                    if (meta.pool) rowWithMeta['Пул'] = meta.pool;
                } else if (getVal(rowWithMeta, 'Пул') == null) {
                    const meta = parseFileProjectPool(file);
                    if (meta.pool) rowWithMeta['Пул'] = meta.pool;
                }
                rowWithMeta._hasRadio = hasRadioColumn;
                state.rawFlatValidations.push(rowWithMeta);
                addedF++;
            }
            else if (type === 'superset1') { state.rawSuperset1.push(row); addedS1++; }
            else if (type === 'superset2') { state.rawSuperset2.push(row); addedS2++; }
            else if (type === 'superset3') { state.rawSuperset3.push(row); addedS3++; }
        }
    }

    log(`Добавлено: Markers (${addedM}), Валидация (${addedV}), Рекомендации (${addedR}), Плоская (${addedF}), Сет1 (${addedS1}), Сет2 (${addedS2}), Сет3 (${addedS3})`);
    saveToStorage();
    await recomputeDashboard();
}

function processFlatValidations() {
    if (!state.rawFlatValidations || state.rawFlatValidations.length === 0) return;

    const groups = {};
    for (const r of state.rawFlatValidations) {
        if (!r) continue;
        const url = getVal(r, 'url задания') || '';
        const email = getVal(r, 'email') || '';
        const fileNameRaw = getVal(r, 'file_name') || '';
        const dateRaw = getVal(r, 'дата разметки') || '';
        const key = [url, email, fileNameRaw, String(dateRaw)].join('|');
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    }

    let addedRows = 0;
    let processedTasks = 0;

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
        const quality = (totalFragments === 0 || mistakes.length === 0)
            ? 1
            : 1 - (sumWeights / totalFragments);

        if (mistakes.length === 0) {
            state.processedData.push({
                _id: 'vf_' + Math.random().toString(36).slice(2, 9),
                _type: 'validation', _linked: null,
                date, pool, marker, validator, project, fileName,
                result: 'Ошибки не выявлены', errorType: null, comment: null,
                quality: 1, interval: null, fragments: totalFragments
            });
            addedRows++;
        } else {
            for (const mis of mistakes) {
                state.processedData.push({
                    _id: 'vf_' + Math.random().toString(36).slice(2, 9),
                    _type: 'validation', _linked: null,
                    date, pool, marker, validator, project, fileName,
                    result: 'Ошибка', errorType: mis.typ, comment: null,
                    quality, interval: null, fragments: totalFragments
                });
                addedRows++;
            }
        }
    }
    log(`Плоский формат: обработано заданий (${processedTasks}), записей (${addedRows})`);
}

export async function recomputeDashboard() {
    state.processedData = [];
    updateProgress(10, 'Построение словаря разметчиков...', 'Пересчет');
    await yieldToUI();

    const markerDict = {};
    for (const m of state.rawMarkers) {
        if (!m || typeof m !== 'object') continue;
        const taskStr = getVal(m, 'Задача');
        let pool = null, marker = null;
        if (taskStr) {
            const parts = taskStr.split('Гимнастки август_');
            if (parts.length > 1) {
                const subParts = parts[1].split('_validate_');
                pool = subParts[0] || null;
                marker = subParts[1] || null;
            }
        }
        const taskId = getVal(m, 'ID задачи');
        const markerId = getVal(m, 'ID разметчика');
        const project = getVal(m, 'Проект');
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
        const aid = getVal(v, 'assignment_id');
        if (aid) valDict[aid] = v;
    }
    const childrenToRemove = new Set();
    for (const v of state.rawValidation) {
        if (!v) continue;
        const origId = getVal(v, 'original_assignment_id');
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
        const taskId = getVal(v, 'task_id');
        const markerId = getVal(v, 'marker_id');
        const fileName = stripJson(getVal(v, 'file_name', 'Наименование файла'));
        const date = parseExcelDate(getVal(v, 'start_date', 'Дата валидации'));
        const mInfo = markerDict[`${taskId}|${markerId}`] || { pool: null, marker: null, validator: null, project: null };

        const jsonStr = getVal(v, 'OUTPUT:marks');
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

        const sumWeights = mistakes.reduce((a, b) => a + b.weight, 0);
        const quality = (totalFragments === 0 || mistakes.length === 0) ? 1 : 1 - (sumWeights / totalFragments);

        if (mistakes.length === 0) {
            state.processedData.push({
                _id: 'v_' + Math.random().toString(36).slice(2, 9),
                _type: 'validation', _linked: null,
                date, pool: mInfo.pool, marker: mInfo.marker, validator: mInfo.validator, project: mInfo.project,
                fileName, result: 'Ошибки не выявлены', errorType: null, comment: null,
                quality: 1, interval: null, fragments: totalFragments
            });
        } else {
            for (const mis of mistakes) {
                state.processedData.push({
                    _id: 'v_' + Math.random().toString(36).slice(2, 9),
                    _type: 'validation', _linked: null,
                    date, pool: mInfo.pool, marker: mInfo.marker, validator: mInfo.validator, project: mInfo.project,
                    fileName, result: 'Ошибка', errorType: mis.typ, comment: mis.comm,
                    quality, interval: mis.interval, fragments: totalFragments
                });
            }
        }
    }

    updateProgress(65, 'Обработка плоского формата...', 'Пересчет');
    await yieldToUI();
    processFlatValidations();

    updateProgress(80, 'Обработка рекомендаций...', 'Пересчет');
    await yieldToUI();

    for (const r of state.rawRecommendations) {
        if (!r) continue;
        state.processedData.push({
            _id: 'r_' + Math.random().toString(36).slice(2, 9),
            _type: 'recommendations', _linked: null,
            date: parseExcelDate(getVal(r, 'Дата валидации')),
            pool: getVal(r, 'Пул'),
            marker: getVal(r, 'Почта разметчика'),
            validator: getVal(r, 'Почта валидатора'),
            fileName: stripJson(getVal(r, 'Наименование файла')),
            result: 'Рекомендация', errorType: null,
            comment: getVal(r, 'Комментарий'),
            quality: null,
            interval: getVal(r, 'Временной интервал фрагмента'),
            fragments: 0
        });
    }

    updateProgress(90, 'Связывание...', 'Пересчет');
    await yieldToUI();

    const valIndex = {};
    for (const v of state.processedData) {
        if (v._type === 'validation') {
            const key = `${v.pool || ''}|${v.marker || ''}|${v.validator || ''}|${v.fileName || ''}`;
            if (!valIndex[key]) valIndex[key] = v;
        }
    }
    for (const r of state.processedData) {
        if (r._type === 'recommendations') {
            const key = `${r.pool || ''}|${r.marker || ''}|${r.validator || ''}|${r.fileName || ''}`;
            if (valIndex[key]) {
                r._linked = valIndex[key]._id;
                r.quality = valIndex[key].quality;
            }
        }
    }

    updateProgress(100, 'Готово', 'Пересчет');
    window.dispatchEvent(new CustomEvent('app:data-updated'));
}

export function matchesTab(r) {
    if (state.currentTab === 'all') return true;
    const project = (r.project || '').replace(/_validate$/, '').trim();
    return project === state.currentTab;
}

export function applyFilters() {
    const from = document.getElementById('filterDateFrom').value;
    const to = document.getElementById('filterDateTo').value;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (toDate) toDate.setDate(toDate.getDate() + 1);

    const { pool, marker, result } = state.filterState;
    const poolEmpty = pool.size === 0;
    const markerEmpty = marker.size === 0;
    const resultEmpty = result.size === 0;

    state.filteredData = state.processedData.filter(r => {
        if (!matchesTab(r)) return false;
        if (!poolEmpty && !pool.has(r.pool || '')) return false;
        if (!markerEmpty && !marker.has(r.marker || '')) return false;
        if (!resultEmpty && !result.has(r.result || '')) return false;
        if (fromDate && r.date && r.date < fromDate) return false;
        if (toDate && r.date && r.date >= toDate) return false;
        return true;
    });
}
