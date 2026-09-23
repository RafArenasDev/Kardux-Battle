import type { JSX } from 'react';

/** The universal show/hide password glyph: an open eye, or the same eye struck through. */
export function EyeIcon({ crossed }: { crossed: boolean }): JSX.Element {
    return (
        <svg
            className="icon"
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M2.1 12.3a1 1 0 0 1 0-.6C3.6 7.9 7.5 5 12 5s8.4 2.9 9.9 6.7a1 1 0 0 1 0 .6C20.4 16.1 16.5 19 12 19s-8.4-2.9-9.9-6.7Z" />
            <circle cx="12" cy="12" r="3" />
            {crossed ? <path d="M3 3l18 18" /> : null}
        </svg>
    );
}
