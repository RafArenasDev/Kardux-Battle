import { useEffect, useState } from 'react';

/** Current timestamp, refreshed every `intervalMs` while `active`. Drives countdowns. */
export function useNow(intervalMs = 250, active = true): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(timer);
    }, [intervalMs, active]);

    return now;
}

/** `Page · Kardux Battle` - keeps many open tabs tellable apart. */
export function useDocumentTitle(title: string): void {
    useEffect(() => {
        document.title = title ? `${title} · Kardux Battle` : 'Kardux Battle';
    }, [title]);
}
