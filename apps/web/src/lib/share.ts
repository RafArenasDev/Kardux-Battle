import i18n from '../i18n';

/** Absolute invite link for a room code. */
export function inviteUrl(code: string): string {
    return `${window.location.origin}/join/${code}`;
}

export function inviteText(code: string): string {
    return i18n.t('share.message', { code, url: inviteUrl(code) });
}

export function whatsappUrl(code: string): string {
    return `https://wa.me/?text=${encodeURIComponent(inviteText(code))}`;
}

export function emailUrl(code: string): string {
    const subject = encodeURIComponent(i18n.t('share.subject'));
    return `mailto:?subject=${subject}&body=${encodeURIComponent(inviteText(code))}`;
}

export function telegramUrl(code: string): string {
    return `https://t.me/share/url?url=${encodeURIComponent(inviteUrl(code))}&text=${encodeURIComponent(i18n.t('share.subject'))}`;
}

/** Pulls a room code out of anything pasted: the bare code or a full invite link. */
export function extractRoomCode(text: string): string | null {
    const match = /(?:join\/)?([0-9a-fA-F]{6})(?![0-9a-fA-F])/.exec(text.trim());
    return match ? match[1]!.toUpperCase() : null;
}

export async function readClipboardCode(): Promise<string | null> {
    try {
        return extractRoomCode(await navigator.clipboard.readText());
    } catch {
        return null;
    }
}

export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export function canNativeShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function nativeShare(code: string): Promise<void> {
    try {
        await navigator.share({
            title: 'Kardux Battle',
            text: inviteText(code),
            url: inviteUrl(code),
        });
    } catch {
        // User dismissed the share sheet - nothing to do.
    }
}
