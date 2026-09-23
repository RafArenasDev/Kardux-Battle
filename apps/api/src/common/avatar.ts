import { avatarImage } from '@kardux/content';

/** Every avatar is rendered from Kardux's own catalog (`@kardux/content`): a game-icons.net
 *  glyph (CC BY 3.0) on a colored badge, as an inline SVG data URI - no external avatar
 *  service, nothing gendered assigned behind the player's back. */
export function buildAvatarUrl(seed: string): string {
    return avatarImage(seed);
}
