import type { JSX } from 'react';
import { useEffect, useState } from 'react';

function formatRemaining(ms: number): string {
    const clamped = Math.max(0, ms);
    const totalSeconds = Math.floor(clamped / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface MatchClockProps {
    /** Absolute ms timestamp the match ends at (`RedactedMatchState.endsAt`) - `null` when
     *  `config.matchDurationMs` is 0 (no limit) or the match hasn't started (`startedAt` is
     *  still `null`). */
    endsAt: number | null;
    /** `MatchConfig.matchDurationMs` - used only to tell "sin límite" (0) apart from
     *  "not started yet" (both render `endsAt: null`). */
    matchDurationMs: number;
    started: boolean;
}

/** Counts down live from `matchDurationMs` (CLAUDE.md's default 1h, but fully configurable -
 *  tested down to 30s in dev to prove the "match ends by clock" path without a real hour of
 *  waiting). Ticks off `requestAnimationFrame` at ~1fps equivalent via `setInterval(1000)` -
 *  the display only needs whole-second precision, no need for a tighter loop. */
export default function MatchClock({
    endsAt,
    matchDurationMs,
    started,
}: MatchClockProps): JSX.Element {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!endsAt) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [endsAt]);

    if (matchDurationMs === 0) {
        return (
            <div className="match-clock">
                <span className="match-clock-value">∞</span>
                <span className="faint">sin límite</span>
            </div>
        );
    }

    if (!started || !endsAt) {
        return (
            <div className="match-clock">
                <span className="match-clock-value">{formatRemaining(matchDurationMs)}</span>
                <span className="faint">al iniciar</span>
            </div>
        );
    }

    const remaining = endsAt - now;
    const urgent = remaining < 60_000;

    return (
        <div className={`match-clock${urgent ? ' urgent' : ''}`}>
            <span className="match-clock-value">{formatRemaining(remaining)}</span>
            <span className="faint">restante</span>
        </div>
    );
}
