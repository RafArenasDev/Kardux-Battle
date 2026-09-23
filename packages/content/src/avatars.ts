import type { Palette } from './art.js';
import { renderAvatar } from './art.js';
import type { IconName } from './icons.generated.js';
import type { LocalizedText } from './decks/types.js';
import { text } from './decks/types.js';

export interface AvatarIcon {
    id: IconName;
    label: LocalizedText;
}

export interface AvatarColor {
    id: string;
    label: LocalizedText;
    palette: Palette;
}

/** Characters a registered player picks from - a mix of helmets, masks and faces so everyone
 *  can choose how they want to be represented instead of getting one assigned. */
export const AVATAR_ICONS: readonly AvatarIcon[] = [
    { id: 'visored-helm', label: text('Caballero', 'Knight') },
    { id: 'spartan-helmet', label: text('Espartano', 'Spartan') },
    { id: 'samurai-helmet', label: text('Samurái', 'Samurai') },
    { id: 'viking-helmet', label: text('Vikingo', 'Viking') },
    { id: 'centurion-helmet', label: text('Centurión', 'Centurion') },
    { id: 'black-knight-helm', label: text('Paladín oscuro', 'Dark Paladin') },
    { id: 'ninja-head', label: text('Ninja', 'Ninja') },
    { id: 'hooded-figure', label: text('Encapuchado', 'Hooded Rogue') },
    { id: 'pirate-captain', label: text('Capitán pirata', 'Pirate Captain') },
    { id: 'wizard-face', label: text('Mago', 'Wizard') },
    { id: 'witch-face', label: text('Hechicera', 'Sorceress') },
    { id: 'woman-elf-face', label: text('Elfa', 'Elf') },
    { id: 'dwarf-face', label: text('Enano', 'Dwarf') },
    { id: 'barbarian', label: text('Bárbaro', 'Barbarian') },
    { id: 'monk-face', label: text('Monje', 'Monk') },
    { id: 'viking-head', label: text('Guerrero nórdico', 'Norse Warrior') },
    { id: 'astronaut-helmet', label: text('Astronauta', 'Astronaut') },
    { id: 'robot-golem', label: text('Autómata', 'Automaton') },
    { id: 'jester-hat', label: text('Bufón', 'Jester') },
    { id: 'dragon-head', label: text('Dragón', 'Dragon') },
    { id: 'wolf-head', label: text('Lobo', 'Wolf') },
    { id: 'eagle-head', label: text('Águila', 'Eagle') },
    { id: 'fox-head', label: text('Zorro', 'Fox') },
    { id: 'owl', label: text('Búho', 'Owl') },
];

export const AVATAR_COLORS: readonly AvatarColor[] = [
    { id: 'ember', label: text('Brasa', 'Ember'), palette: { from: '#ff8a4c', to: '#8f1d1d' } },
    { id: 'gold', label: text('Oro', 'Gold'), palette: { from: '#e8b94f', to: '#6b4a12' } },
    { id: 'jade', label: text('Jade', 'Jade'), palette: { from: '#3fd6a4', to: '#0b4d3f' } },
    { id: 'ice', label: text('Hielo', 'Ice'), palette: { from: '#6fd2ff', to: '#123a6b' } },
    {
        id: 'amethyst',
        label: text('Amatista', 'Amethyst'),
        palette: { from: '#c28bff', to: '#3d1670' },
    },
    { id: 'rose', label: text('Rubí', 'Ruby'), palette: { from: '#ff6f91', to: '#6b0f2e' } },
    { id: 'steel', label: text('Acero', 'Steel'), palette: { from: '#a9b4cc', to: '#2c3346' } },
    { id: 'night', label: text('Noche', 'Night'), palette: { from: '#4b5a8f', to: '#11142a' } },
    { id: 'onyx', label: text('Ónix', 'Onyx'), palette: { from: '#4a4550', to: '#000000' } },
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
