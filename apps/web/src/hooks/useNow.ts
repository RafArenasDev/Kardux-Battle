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

/** Tab title: always "Kardux Battle", optionally prefixed with a room code - never a player
 *  name (tabs are visible to anyone looking at the screen). */
export function useDocumentTitle(title: string): void {
    useEffect(() => {
        document.title = title ? `Kardux Battle · ${title}` : 'Kardux Battle';
    }, [title]);
}
