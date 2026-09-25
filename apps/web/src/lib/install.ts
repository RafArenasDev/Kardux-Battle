/** Chrome/Edge/Android's install event - not in the standard DOM typings yet. */
export interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();

function notify(): void {
    for (const listener of listeners) listener();
}

/**
 * Chromium fires `beforeinstallprompt` once, early - often before React has rendered anything.
 * This module is imported by `main.tsx`, so the event is caught at startup and kept until the
 * player is somewhere it makes sense to offer the install (after signing in, never mid-match).
 */
window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
});

window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
});

export function installEvent(): BeforeInstallPromptEvent | null {
    return deferred;
}

export function wasInstalled(): boolean {
    return installed;
}

export function onInstallChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Shows the browser's own install dialog; resolves to whether the player accepted. */
export async function promptInstall(): Promise<boolean> {
    const event = deferred;
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
}

export function isStandalone(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

export function isIos(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}
