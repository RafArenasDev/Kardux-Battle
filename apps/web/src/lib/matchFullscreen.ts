const PHONE_QUERY = '(max-width: 767px), (max-height: 767px)';

/**
 * Best-effort, silent: ask for fullscreen + landscape on a phone-sized screen. Called only once,
 * from MatchPage's own effect exactly when the table itself loads - never from a lobby/countdown
 * wait or any entry-point click, since those are a deliberately normal portrait screen and the
 * table is the only part of the app that ever asks for landscape.
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
