import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { crestUrl } from '../brand/Brand';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import {
    installEvent,
    isIos,
    isStandalone,
    onInstallChange,
    promptInstall,
    wasInstalled,
} from '../../lib/install';

const DISMISSED_KEY = 'kardux.installDismissedAt';
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** A short pause after reaching the home screen, so the invitation never pops up mid-transition. */
const SHOW_AFTER_MS = 1_800;

type Platform = 'native' | 'ios' | null;

function recentlyDismissed(): boolean {
    try {
        const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
        return Date.now() - at < REMIND_AFTER_MS;
    } catch {
        return false;
    }
}

/**
 * Invites the player to install Kardux as an app. Chromium's `beforeinstallprompt` is caught
 * at startup (`lib/install.ts`) and offered here with our own card; iOS Safari has no API, so we
 * explain "Share → Add to Home Screen". Only shown when `enabled` (signed in, outside a match),
 * never when already installed, and not again for a few days after a dismissal.
 */
export function InstallPrompt({ enabled }: { enabled: boolean }): JSX.Element | null {
    const { t } = useTranslation();
    const [available, setAvailable] = useState(() => installEvent() !== null);
    const [platform, setPlatform] = useState<Platform>(null);

    useEffect(() => onInstallChange(() => setAvailable(installEvent() !== null)), []);

    useEffect(() => {
        if (!enabled || isStandalone() || wasInstalled() || recentlyDismissed()) {
            setPlatform(null);
            return;
        }
        const next: Platform = available ? 'native' : isIos() ? 'ios' : null;
        if (!next) return;
        const timer = window.setTimeout(() => setPlatform(next), SHOW_AFTER_MS);
        return () => window.clearTimeout(timer);
    }, [enabled, available]);

    function dismiss(): void {
        try {
            localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        } catch {
            // Storage blocked (private mode) - just hide it for this visit.
        }
        setPlatform(null);
    }

    async function install(): Promise<void> {
        if (await promptInstall()) setPlatform(null);
        else dismiss();
    }

    return (
        <AnimatePresence>
            {platform ? (
                <motion.aside
                    className="install panel"
                    role="dialog"
                    aria-label={t('install.title')}
                    initial={{ opacity: 0, y: 40, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 40, scale: 0.96 }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                >
                    <img src={crestUrl} alt="" className="install__icon" width={56} height={58} />
                    <div className="install__text">
                        <strong>{t('install.title')}</strong>
                        {platform === 'native' ? (
                            <span className="text-2">{t('install.native')}</span>
                        ) : (
                            <span className="text-2">
                                <Trans
                                    i18nKey="install.ios"
                                    components={{ icon: <Icon name="share" />, b: <b /> }}
                                />
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
                                {t('install.install')}
                            </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={dismiss}>
                            {t('common.notNow')}
                        </Button>
                    </div>
                </motion.aside>
            ) : null}
        </AnimatePresence>
    );
}
