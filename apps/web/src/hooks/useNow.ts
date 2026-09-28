import { useEffect, useState } from 'react';
import { serverNow } from '../lib/clock';

/** Best estimate of the server's clock, refreshed every `intervalMs` while `active`. Drives
 *  countdowns and turn-open checks against server-issued deadlines (`turnOpensAt`,
 *  `turnDeadline`) - using the raw device clock here is what let a skewed phone clock keep
 *  the round leader from ever seeing their turn open. */
export function useNow(intervalMs = 250, active = true): number {
    const [now, setNow] = useState(() => serverNow());

    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setNow(serverNow()), intervalMs);
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
