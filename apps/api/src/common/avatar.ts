/**
 * DiceBear (https://www.dicebear.com) - MIT licensed, open source, no API key, no rate-limit
 * signup. The public HTTP API renders deterministically from a seed with zero server-side
 * work on our end, which is exactly what `User.avatarSeed` was already designed for.
 * `adventurer` was picked for its friendly, colorful look that reads well at avatar size;
 * swapping the style only ever touches this one constant.
 */
const DICEBEAR_STYLE = 'adventurer';
const DICEBEAR_VERSION = '9.x';

export function buildAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/${DICEBEAR_VERSION}/${DICEBEAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}
