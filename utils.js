import { state } from './state.js';

// ===== Даты и данные =====
export function parseExcelDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000);
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(new Date(s).getTime()) ? null : new Date(s);
}

export function formatDate(d) {
    if (!d) return '';
    return String(d.getDate()).padStart(2, '0') + '.' +
           String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

export function getVal(row, ...names) {
    if (!row) return null;
    for (const n of names) {
        if (row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n];
        const found = Object.keys(row).find(k => k.toLowerCase().trim() === n.toLowerCase().trim());
        if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') return row[found];
    }
    return null;
}

export function stripJson(str) {
    return str ? String(str).replace(/\.json$/i, '') : str;
}

export function formatInterval(start, finish) {
    if (start == null || finish == null) return null;
    const fmt = (val) => {
        const totalMs = Math.round(val * 1000);
        const mins = Math.floor(totalMs / 60000);
        const rem = totalMs - mins * 60000;
        const secs = Math.floor(rem / 1000);
        const ms = rem - secs * 1000;
        return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };
    return `${fmt(start)}-${fmt(finish)}`;
}

export function detectTableType(row) {
    const keys = Object.keys(row).map(k => k.toLowerCase().trim());
    if (keys.includes('assignment_id') || keys.includes('output:marks') || keys.includes('output_marks')) return 'validation';
    if (keys.includes('id разметчика') || keys.includes('id задачи') || keys.includes('фио')) return 'markers';
    if (keys.includes('комментарий') && (keys.includes('почта разметчика') || keys.includes('пул'))) return 'recommendations';
    return 'unknown';
}

export function maskEmail(email) {
    if (!email || typeof email !== 'string') return email;
    if (email.length <= 10) return email;
    return email.substring(0, 3) + "***" + email.slice(-7);
}

// ===== Безопасность (XSS) =====
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===== UI helpers =====
export function updateLabel(containerId, stateKey) {
    const label = document.getElementById(containerId + '_label');
    if (!label) return;
    const count = state.filterState[stateKey].size;
    if (count === 0) {
        label.textContent = (stateKey === 'pool' || stateKey === 'feedbackPool' || stateKey === 'fbFormPools') ? 'Все пулы' : 'Все';
        label.classList.add('empty');
    } else if (count === 1) {
        label.textContent = Array.from(state.filterState[stateKey])[0];
        label.classList.remove('empty');
    } else {
        label.textContent = 'Выбрано: ' + count;
        label.classList.remove('empty');
    }
}

// ===== Progress =====
let _progressStart = 0;

export function progressStartTimer() { _progressStart = Date.now(); }

export function progressETA(percent) {
    if (percent <= 0.5) return '';
    const elapsed = (Date.now() - _progressStart) / 1000;
    const remaining = Math.max(0, (elapsed / (percent / 100)) - elapsed);
    return remaining < 1 ? '' : ' · осталось ~' + remaining.toFixed(1) + ' с';
}

export function updateProgress(percent, stage, title) {
    const fill = document.getElementById('progressFill');
    const pct = document.getElementById('progressPct');
    const stageEl = document.getElementById('progressStage');
    const titleEl = document.getElementById('progressTitle');
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (fill) fill.style.width = clamped + '%';
    if (pct) pct.textContent = clamped + '%';
    if (stage !== undefined && stageEl) stageEl.textContent = stage || '';
    if (title !== undefined && titleEl) titleEl.textContent = title || '';
}

export function yieldToUI() { return new Promise(r => setTimeout(r, 0)); }

export function log(msg, isError) {
    const box = document.getElementById('logBox');
    if (!box) return;
    const div = document.createElement('div');
    div.className = isError ? 'err' : 'ok';
    div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 50) box.removeChild(box.firstChild);
}

// ===== Performance helpers =====
export function debounce(fn, delay = 100) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Уничтожение графика (принимает объект chart для разрушения)
export function destroyChart(chartRef) {
    if (chartRef) { try { chartRef.destroy(); } catch (e) {} }
}