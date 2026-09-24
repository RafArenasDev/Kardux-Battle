import { AnimatePresence, motion } from 'framer-motion';
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';

type Tone = 'info' | 'success' | 'error';

interface ToastItem {
    id: number;
    tone: Tone;
    message: string;
}

interface ToastApi {
    show: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON = { info: 'magic-portal', success: 'laurels-trophy', error: 'cancel' } as const;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
    const [items, setItems] = useState<ToastItem[]>([]);
    const nextId = useRef(1);

    const show = useCallback((message: string, tone: Tone = 'info') => {
        const id = nextId.current++;
        setItems((current) =>
            [...current.filter((item) => item.message !== message), { id, tone, message }].slice(
                -3,
            ),
        );
        window.setTimeout(
            () => {
                setItems((current) => current.filter((item) => item.id !== id));
            },
            tone === 'error' ? 5_000 : 3_200,
        );
    }, []);

    const api = useMemo(() => ({ show }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="toasts" role="status" aria-live="polite">
                <AnimatePresence initial={false}>
                    {items.map((item) => (
                        <motion.div
                            key={item.id}
                            className={`toast toast--${item.tone}`}
                            // Appears lower on screen and glides up into place at the top.
                            initial={{ opacity: 0, y: 120, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -24, scale: 0.96 }}
                            transition={{ type: 'spring', bounce: 0.15, duration: 0.6 }}
                            layout
                        >
                            <Icon
                                name={TONE_ICON[item.tone]}
                                className="toast__icon"
                                style={{
                                    color:
                                        item.tone === 'error'
                                            ? 'var(--lose)'
                                            : item.tone === 'success'
                                              ? 'var(--win)'
                                              : 'var(--gold-300)',
                                }}
                            />
                            <span>{item.message}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastApi {
    const api = useContext(ToastContext);
    if (!api) throw new Error('useToast must be used inside <ToastProvider>.');
    return api;
}
