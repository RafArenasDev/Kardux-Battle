import { motion, useReducedMotion } from 'framer-motion';
import type { JSX, ReactNode } from 'react';

/** Wraps each route's element so navigation reads as a soft materialization instead of a hard
 *  cut. Used inside an `<AnimatePresence mode="wait">` that lives once at the `App` level
 *  (keyed on `location.pathname`) - this component only supplies the per-page motion values.
 *  `prefers-reduced-motion` collapses it to a plain 120ms cross-fade (CLAUDE.md's animation
 *  table, applied to page-level chrome too, not just in-match moments). */
export default function PageTransition({ children }: { children: ReactNode }): JSX.Element {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
            transition={
                reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 300, damping: 30 }
            }
            style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
        >
            {children}
        </motion.div>
    );
}
