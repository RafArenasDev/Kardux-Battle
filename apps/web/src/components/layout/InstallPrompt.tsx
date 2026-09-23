import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { crestUrl } from '../brand/Brand';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

/** Chrome/Edge/Android's install event - not in the standard DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'kardux.installDismissedAt';
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

type Platform = 'native' | 'ios' | null;

function isStandalone(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

function isIos(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}

function recentlyDismissed(): boolean {
    try {
        const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
        return Date.now() - at < REMIND_AFTER_MS;
    } catch {
        return false;
    }
}

/**
 * Invites the player to install Kardux as an app. Browsers never surface this on their own in a
 * noticeable way: Chromium fires `beforeinstallprompt` (we keep it and show our own card),
 * iOS Safari has no API at all (we explain "Compartir → Agregar a inicio"). Hidden when already
 * running installed, and after a dismissal for a few days (a per-device convenience only).
 */
export function InstallPrompt(): JSX.Element | null {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [platform, setPlatform] = useState<Platform>(null);

    useEffect(() => {
        if (isStandalone() || recentlyDismissed()) return;

        function onPrompt(event: Event): void {
            event.preventDefault();
            setDeferred(event as BeforeInstallPromptEvent);
            setPlatform('native');
        }
        function onInstalled(): void {
            setPlatform(null);
            setDeferred(null);
        }
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);

        const iosTimer = isIos() ? window.setTimeout(() => setPlatform('ios'), 2_500) : undefined;

        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
            window.clearTimeout(iosTimer);
        };
    }, []);

    function dismiss(): void {
        try {
            localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        } catch {
            // Storage blocked (private mode) - just hide it for this visit.
        }
        setPlatform(null);
    }

    async function install(): Promise<void> {
        if (!deferred) return;
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        setDeferred(null);
        if (outcome === 'accepted') setPlatform(null);
        else dismiss();
    }

    return (
        <AnimatePresence>
            {platform ? (
                <motion.aside
                    className="install panel"
                    role="dialog"
                    aria-label="Instalar Kardux Battle"
                    initial={{ opacity: 0, y: 40, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 40, scale: 0.96 }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                >
                    <img src={crestUrl} alt="" className="install__icon" width={56} height={58} />
                    <div className="install__text">
                        <strong>Instala Kardux Battle</strong>
                        {platform === 'native' ? (
                            <span className="text-2">
                                Juega a pantalla completa, desde tu escritorio o tu pantalla de
                                inicio.
                            </span>
                        ) : (
                            <span className="text-2">
                                Toca <Icon name="share" /> <b>Compartir</b> y luego{' '}
                                <b>Agregar a inicio</b>.
                            </span>
                        )}
                    </div>
                    <div className="install__actions">
                        {platform === 'native' ? (
                            <Button
                                size="sm"
                                variant="gold"
                                icon="card-pickup"
                                onClick={() => void install()}
                            >
                                Instalar
                            </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={dismiss}>
                            Ahora no
                        </Button>
                    </div>
                </motion.aside>
            ) : null}
        </AnimatePresence>
    );
}
