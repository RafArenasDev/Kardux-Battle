import type { MatchSummaryWithRole } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { HistoryRow } from './HistoryRow';

/** The full 20-room history, with its own scroll - never a reason to scroll the home page
 *  itself, and never a way back into any of these rooms (see `HistoryRow`: no open button). */
export function HistoryModal({
    open,
    rooms,
    onClose,
}: {
    open: boolean;
    rooms: MatchSummaryWithRole[];
    onClose: () => void;
}): JSX.Element {
    const { t } = useTranslation();
    useBodyScrollLock(open);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return createPortal(
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
                        aria-labelledby="history-title"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.97 }}
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="row row--between">
                            <h2 id="history-title">
                                <Icon name="card-draw" /> {t('home.history.modalTitle')}
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
                            <ul className="room-list">
                                {rooms.map((room) => (
                                    <HistoryRow key={room.matchId} room={room} />
                                ))}
                            </ul>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
