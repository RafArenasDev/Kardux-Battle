import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

const RULES = ['goal', 'deal', 'first', 'round', 'tie', 'leave', 'end'] as const;

/** How to play, straight from the original brief, in the player's language. */
export function RulesDialog({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}): JSX.Element {
    const { t } = useTranslation();

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    className="dialog-scrim"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="dialog panel panel--pad"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rules-title"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.97 }}
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="row row--between">
                            <h2 id="rules-title">
                                <Icon name="scroll-unfurled" /> {t('rules.title')}
                            </h2>
                            <Button
                                size="sm"
                                variant="ghost"
                                icon="cancel"
                                aria-label={t('common.close')}
                                onClick={onClose}
                            />
                        </div>
                        <div className="dialog__body">
                            <ol className="rules">
                                {RULES.map((rule) => (
                                    <li key={rule}>
                                        <strong>{t(`rules.items.${rule}.title`)}</strong>
                                        <span className="text-2">
                                            {t(`rules.items.${rule}.text`)}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
