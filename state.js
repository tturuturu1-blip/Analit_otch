export const STORAGE_KEY = 'validation_dashboard_data_v3';
export const FB_STORAGE_KEY = 'validation_feedback_data_v1';

export const state = {
    rawMarkers: [],
    rawValidation: [],
    rawRecommendations: [],
    processedData: [],
    filteredData: [],
    feedbackData: [],
    editingFeedbackIndex: null,
    charts: {},
    currentTab: 'all',
    currentMenu: 'main',
    filterState: {
        pool: new Set(),
        marker: new Set(),
        result: new Set(),
        feedbackPool: new Set(),
        fbFormPools: new Set()
    }
};

export function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            m: state.rawMarkers,
            v: state.rawValidation,
            r: state.rawRecommendations
        }));
    } catch (e) {
        console.error('Ошибка сохранения:', e.message);
    }
}

export function loadFromStorage() {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object') {
                state.rawMarkers = Array.isArray(parsed.m) ? parsed.m : [];
                state.rawValidation = Array.isArray(parsed.v) ? parsed.v : [];
                state.rawRecommendations = Array.isArray(parsed.r) ? parsed.r : [];
            }
        }
    } catch (e) {
        state.rawMarkers = [];
        state.rawValidation = [];
        state.rawRecommendations = [];
    }
}

export function saveFeedbackToStorage() {
    try {
        localStorage.setItem(FB_STORAGE_KEY, JSON.stringify(state.feedbackData));
    } catch (e) {
        console.error('Ошибка сохранения фидбека:', e.message);
    }
}

export function loadFeedbackFromStorage() {
    try {
        const stored = localStorage.getItem(FB_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) state.feedbackData = parsed;
        }
    } catch (e) {
        state.feedbackData = [];
    }
}