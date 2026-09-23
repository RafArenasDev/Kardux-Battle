import type { Palette } from './art.js';
import { renderAvatar } from './art.js';
import type { IconName } from './icons.generated.js';

export interface AvatarIcon {
    id: IconName;
    label: string;
}

export interface AvatarColor {
    id: string;
    label: string;
    palette: Palette;
}

/** Characters a registered player picks from - a mix of helmets, masks and faces so everyone
 *  can choose how they want to be represented instead of getting one assigned. */
export const AVATAR_ICONS: readonly AvatarIcon[] = [
    { id: 'visored-helm', label: 'Caballero' },
    { id: 'spartan-helmet', label: 'Espartano' },
    { id: 'samurai-helmet', label: 'Samurái' },
    { id: 'viking-helmet', label: 'Vikingo' },
    { id: 'centurion-helmet', label: 'Centurión' },
    { id: 'black-knight-helm', label: 'Paladín oscuro' },
    { id: 'ninja-head', label: 'Ninja' },
    { id: 'hooded-figure', label: 'Encapuchado' },
    { id: 'pirate-captain', label: 'Capitán pirata' },
    { id: 'wizard-face', label: 'Mago' },
    { id: 'witch-face', label: 'Hechicera' },
    { id: 'woman-elf-face', label: 'Elfa' },
    { id: 'dwarf-face', label: 'Enano' },
    { id: 'barbarian', label: 'Bárbaro' },
    { id: 'monk-face', label: 'Monje' },
    { id: 'viking-head', label: 'Guerrero nórdico' },
    { id: 'astronaut-helmet', label: 'Astronauta' },
    { id: 'robot-golem', label: 'Autómata' },
    { id: 'jester-hat', label: 'Bufón' },
    { id: 'dragon-head', label: 'Dragón' },
    { id: 'wolf-head', label: 'Lobo' },
    { id: 'eagle-head', label: 'Águila' },
    { id: 'fox-head', label: 'Zorro' },
    { id: 'owl', label: 'Búho' },
];

export const AVATAR_COLORS: readonly AvatarColor[] = [
    { id: 'ember', label: 'Brasa', palette: { from: '#ff8a4c', to: '#8f1d1d' } },
    { id: 'gold', label: 'Oro', palette: { from: '#e8b94f', to: '#6b4a12' } },
    { id: 'jade', label: 'Jade', palette: { from: '#3fd6a4', to: '#0b4d3f' } },
    { id: 'ice', label: 'Hielo', palette: { from: '#6fd2ff', to: '#123a6b' } },
    { id: 'amethyst', label: 'Amatista', palette: { from: '#c28bff', to: '#3d1670' } },
    { id: 'rose', label: 'Rubí', palette: { from: '#ff6f91', to: '#6b0f2e' } },
    { id: 'steel', label: 'Acero', palette: { from: '#a9b4cc', to: '#2c3346' } },
    { id: 'night', label: 'Noche', palette: { from: '#4b5a8f', to: '#11142a' } },
];

export interface ResolvedAvatar {
    icon: AvatarIcon;
    color: AvatarColor;
    seed: string;
}

/** Stable FNV-1a hash, used to map legacy/random seeds onto the catalog deterministically. */
export function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export function buildAvatarSeed(iconId: string, colorId: string): string {
    return `${iconId}:${colorId}`;
}

/** True only for an explicit `icon:color` pair from the catalog - what `POST /auth/register`
 *  accepts, so a client can't store an arbitrary string as its avatar. */
export function isCatalogAvatarSeed(seed: string): boolean {
    const [iconId, colorId] = seed.split(':');
    return (
        AVATAR_ICONS.some((icon) => icon.id === iconId) &&
        AVATAR_COLORS.some((color) => color.id === colorId)
    );
}

/** Any seed resolves to an avatar: catalog seeds map exactly, anything else (older random
 *  seeds, usernames) hashes onto the catalog so it still renders the same every time. */
export function resolveAvatar(seed: string): ResolvedAvatar {
    const [iconId, colorId] = seed.split(':');
    const hash = hashString(seed);
    const icon =
        AVATAR_ICONS.find((candidate) => candidate.id === iconId) ??
        AVATAR_ICONS[hash % AVATAR_ICONS.length]!;
    const color =
        AVATAR_COLORS.find((candidate) => candidate.id === colorId) ??
        AVATAR_COLORS[(hash >>> 8) % AVATAR_COLORS.length]!;

    return { icon, color, seed };
}

export function randomAvatarSeed(random: () => number = Math.random): string {
    const icon = AVATAR_ICONS[Math.floor(random() * AVATAR_ICONS.length)]!;
    const color = AVATAR_COLORS[Math.floor(random() * AVATAR_COLORS.length)]!;
    return buildAvatarSeed(icon.id, color.id);
}

const avatarCache = new Map<string, string>();

/** Ready-to-use `<img src>` for any seed (memoized - the same few seeds render constantly). */
export function avatarImage(seed: string): string {
    const cached = avatarCache.get(seed);
    if (cached) return cached;
    const { icon, color } = resolveAvatar(seed);
    const uri = renderAvatar(icon.id, color.palette);
    avatarCache.set(seed, uri);
    return uri;
}
