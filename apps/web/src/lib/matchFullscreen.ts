const PHONE_QUERY = '(max-width: 767px), (max-height: 767px)';

/**
 * Best-effort, silent: ask for fullscreen + landscape the instant a phone-sized screen taps its
 * way into a match (quick match, practice, host start, join). Both browser APIs only reliably
 * grant themselves when called synchronously inside a real user gesture - by the time a match
 * page's own effect runs after navigation/socket round-trips, Android Chrome no longer treats
 * the call as gesture-triggered and silently ignores it. Calling this first, right in the click
 * handler, gives the same request its best shot before any of that async work happens.
 *
 * MatchPage still carries its own effect as a fallback for entering a match without a fresh
 * click (a page refresh, a direct link) - this never replaces that, only improves the common
 * case.
 */
export function tryLockMatchOrientation(): void {
    if (typeof window === 'undefined' || !window.matchMedia(PHONE_QUERY).matches) return;

    void (async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen?.();
            }
            // `lock` is still missing from TS's lib.dom.d.ts on some TS/lib combos even though
            // every Chromium/Android browser that supports it ships it.
            await (
                screen.orientation as ScreenOrientation & {
                    lock?: (orientation: string) => Promise<void>;
                }
            )?.lock?.('landscape');
        } catch {
            // Not supported or refused - nothing to surface to the player for this.
        }
    })();
}
