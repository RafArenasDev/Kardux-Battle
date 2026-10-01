const PHONE_QUERY = '(max-width: 767px), (max-height: 767px)';

function isPhoneSized(): boolean {
    return typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;
}

/**
 * Best-effort, silent: ask for fullscreen on a phone-sized screen. Call this SYNCHRONOUSLY from
 * the actual tap that starts or joins a match (search a rival, practice vs. the bot, create a
 * room, join by code, "Listo" to begin the countdown) - confirmed live on a real Android phone
 * that `requestFullscreen()` only succeeds inside a real user gesture's "transient activation"
 * window, which is already gone by the time any socket round-trip or React effect would
 * otherwise call it (every one of those click handlers awaits at least one). Only fullscreen,
 * never orientation, here: the lobby/countdown wait still stays in whatever orientation the
 * player is already holding the phone in, same as before - this just secures the one
 * gesture-gated permission early, invisibly (nothing on screen changes beyond the browser's own
 * chrome disappearing), while `tryLockMatchOrientation` below handles the actual landscape lock
 * once the table itself loads.
 */
export function tryEnterFullscreen(): void {
    if (!isPhoneSized() || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/**
 * Best-effort, silent: lock to landscape once the table itself loads. Doesn't need a fresh
 * gesture of its own - `screen.orientation.lock()` only requires the document to already be in
 * fullscreen, which `tryEnterFullscreen` above should have already secured back at whichever
 * entry-point tap led here. Still attempts fullscreen itself first, as a fallback for the one
 * case that never passed through a click entry point (landing on an already-running match from a
 * fresh page load or a rejoin) - that attempt will simply fail silently without a gesture to back
 * it, same as it always has.
 */
export function tryLockMatchOrientation(): void {
    if (!isPhoneSized()) return;

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
