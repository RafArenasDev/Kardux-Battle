import type { JSX } from 'react';

interface BrandIconProps {
    className?: string;
}

/** Real WhatsApp wordmark glyph - kept separate from the game-icons.net set used by <Icon>,
 *  since that set only covers fantasy glyphs and these need to stay recognizable as the app. */
export function WhatsAppIcon({ className }: BrandIconProps): JSX.Element {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
            <path
                fill="currentColor"
                d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.36.101 11.943c0 2.105.549 4.16 1.595 5.976L0 24l6.335-1.652a11.86 11.86 0 0 0 5.71 1.447h.006c6.58 0 11.94-5.36 11.943-11.944a11.8 11.8 0 0 0-3.474-8.397"
            />
        </svg>
    );
}

/** Telegram's own paper-plane mark, without the circular backdrop its full logo sits in - the
 *  backdrop is what read as a solid filled disc next to the rest of this row's lighter glyphs. */
export function TelegramIcon({ className }: BrandIconProps): JSX.Element {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
    );
}

/** Lightweight envelope outline - the game-icons.net "envelope" glyph used elsewhere is a much
 *  heavier illustrative fill, which read as out of place in this same icon-only row. */
export function MailIcon({ className }: BrandIconProps): JSX.Element {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
            <path
                fill="currentColor"
                d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 4-8 5-8-5V6l8 5 8-5z"
            />
        </svg>
    );
}
