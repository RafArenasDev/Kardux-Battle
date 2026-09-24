import i18n from '../i18n';

export function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
    if (ms === 0) return i18n.t('format.noLimit');
    const minutes = Math.round(ms / 60_000);
    return minutes >= 60
        ? i18n.t('format.hours', { count: minutes / 60 })
        : i18n.t('format.minutes', { count: minutes });
}

/** Locale-aware number formatting (thousands separators, decimals). */
export function formatNumber(value: number, maximumFractionDigits = 0): string {
    return new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits }).format(value);
}
