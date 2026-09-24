import type { IconName } from './icons.generated.js';
import { ICON_PATHS, ICON_VIEWBOX } from './icons.generated.js';

/** Two-stop gradient used for an avatar's badge. */
export interface Palette {
    from: string;
    to: string;
}

/** Encodes an SVG as a `data:` URI - no network round-trip, works offline, and passes
 *  `z.string().url()` like any other image URL. */
export function svgToDataUri(svg: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function iconPath(icon: IconName, transform: string, fill: string, extra = ''): string {
    return `<path transform="${transform}" fill="${fill}" ${extra} d="${ICON_PATHS[icon]}"/>`;
}

/** Round avatar badge: gradient disc + gold ring + icon. Square 128x128 viewBox. */
export function renderAvatar(icon: IconName, palette: Palette): string {
    const size = 84;
    const scale = size / ICON_VIEWBOX;
    const offset = (128 - size) / 2;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
        `<defs>` +
        `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.from}"/><stop offset="1" stop-color="${palette.to}"/></linearGradient>` +
        `<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d98b"/><stop offset="1" stop-color="#8a6a2c"/></linearGradient>` +
        `</defs>` +
        `<circle cx="64" cy="64" r="62" fill="url(#r)"/>` +
        `<circle cx="64" cy="64" r="56" fill="url(#g)"/>` +
        iconPath(
            icon,
            `translate(${offset} ${offset + 3}) scale(${scale})`,
            '#000',
            'fill-opacity=".3"',
        ) +
        iconPath(icon, `translate(${offset} ${offset}) scale(${scale})`, '#fbf1d6') +
        `</svg>`;

    return svgToDataUri(svg);
}
