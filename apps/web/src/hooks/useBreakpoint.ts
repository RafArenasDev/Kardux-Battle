import { useSyncExternalStore } from 'react';

/** Layout breakpoints shared with the CSS media queries (768 / 1100). */
export const BREAKPOINTS = { tablet: 768, desktop: 1100 } as const;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function subscribe(callback: () => void): () => void {
    window.addEventListener('resize', callback);
    window.addEventListener('orientationchange', callback);
    return () => {
        window.removeEventListener('resize', callback);
        window.removeEventListener('orientationchange', callback);
    };
}

function currentBreakpoint(): Breakpoint {
    const width = window.innerWidth;
    if (width >= BREAKPOINTS.desktop) return 'desktop';
    if (width >= BREAKPOINTS.tablet) return 'tablet';
    return 'mobile';
}

/** Re-renders only when the breakpoint changes, not on every resized pixel. */
export function useBreakpoint(): Breakpoint {
    return useSyncExternalStore(subscribe, currentBreakpoint, () => 'desktop');
}

export interface Viewport {
    width: number;
    height: number;
    isPortrait: boolean;
    /** Phones held sideways: short viewport, so the table compacts vertically. */
    isShort: boolean;
}

let cachedViewport: Viewport | undefined;

function readViewport(): Viewport {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (cachedViewport && cachedViewport.width === width && cachedViewport.height === height) {
        return cachedViewport;
    }
    cachedViewport = { width, height, isPortrait: height >= width, isShort: height < 560 };
    return cachedViewport;
}

/** Exact viewport size (stable object between renders when unchanged). */
export function useViewport(): Viewport {
    return useSyncExternalStore(subscribe, readViewport, readViewport);
}

export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (callback) => {
            const list = window.matchMedia(query);
            list.addEventListener('change', callback);
            return () => list.removeEventListener('change', callback);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}
