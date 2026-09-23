import type { IconName } from './icons.generated.js';
import { ICON_PATHS, ICON_VIEWBOX } from './icons.generated.js';

/** Two-stop gradient used for a family's card art and an avatar's badge. */
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

export interface CardArtOptions {
    icon: IconName;
    palette: Palette;
    /** Large corner glyph (e.g. "K" for a playing card); omitted for creature/animal art. */
    rank?: string;
    /** Rank/icon ink color - dark on light palettes (playing cards), gold-ivory otherwise. */
    ink?: string;
}

/**
 * The illustration window of a card (landscape 320x220). The web client frames it with the
 * card's name, code and stat rows - this SVG is only the art, so every deck shares one card
 * layout. Built from an original composition (gradient, radial glow, hatch pattern) plus a
 * game-icons.net glyph, never third-party character art.
 */
export function renderCardArt({ icon, palette, rank, ink = '#f6e7c1' }: CardArtOptions): string {
    const size = 170;
    const scale = size / ICON_VIEWBOX;
    const x = (320 - size) / 2;
    const y = (220 - size) / 2 + 4;
    const rankText = rank
        ? `<text x="22" y="54" font-family="Georgia,serif" font-size="44" font-weight="700" fill="${ink}">${rank}</text>` +
          `<text x="298" y="196" font-family="Georgia,serif" font-size="44" font-weight="700" fill="${ink}" text-anchor="end" transform="rotate(180 276 182)">${rank}</text>`
        : '';

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">` +
        `<defs>` +
        `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.from}"/><stop offset="1" stop-color="${palette.to}"/></linearGradient>` +
        `<radialGradient id="l" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
        `<pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="2" height="14" fill="#000" fill-opacity=".08"/></pattern>` +
        `</defs>` +
        `<rect width="320" height="220" fill="url(#g)"/>` +
        `<rect width="320" height="220" fill="url(#p)"/>` +
        `<rect width="320" height="220" fill="url(#l)"/>` +
        iconPath(icon, `translate(${x} ${y + 6}) scale(${scale})`, '#000', 'fill-opacity=".35"') +
        iconPath(icon, `translate(${x} ${y}) scale(${scale})`, ink) +
        rankText +
        `</svg>`;

    return svgToDataUri(svg);
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
