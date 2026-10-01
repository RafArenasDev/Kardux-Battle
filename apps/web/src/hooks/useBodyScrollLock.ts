import { useEffect } from 'react';

let lockCount = 0;

/** Freezes the page behind any open modal/dialog/sheet - scrolling inside it must never also
 *  scroll the app underneath. Counted (not a single boolean) so two modals open at once (e.g.
 *  a confirm dialog over another dialog) don't have the first one's close prematurely unlock
 *  the page while the second is still up. */
export function useBodyScrollLock(active: boolean): void {
    useEffect(() => {
        if (!active) return undefined;

        lockCount += 1;
        if (lockCount === 1) document.body.classList.add('scroll-locked');

        return () => {
            lockCount = Math.max(0, lockCount - 1);
            if (lockCount === 0) document.body.classList.remove('scroll-locked');
        };
    }, [active]);
}
