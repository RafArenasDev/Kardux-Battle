/** Absolute invite link for a room code. */
export function inviteUrl(code: string): string {
    return `${window.location.origin}/join/${code}`;
}

export function inviteText(code: string): string {
    return `¡Te reto en Kardux Battle! Entra a mi sala con el código ${code}: ${inviteUrl(code)}`;
}

export function whatsappUrl(code: string): string {
    return `https://wa.me/?text=${encodeURIComponent(inviteText(code))}`;
}

export function emailUrl(code: string): string {
    const subject = encodeURIComponent('Te reto en Kardux Battle');
    return `mailto:?subject=${subject}&body=${encodeURIComponent(inviteText(code))}`;
}

export function telegramUrl(code: string): string {
    return `https://t.me/share/url?url=${encodeURIComponent(inviteUrl(code))}&text=${encodeURIComponent('¡Te reto en Kardux Battle!')}`;
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
            text: `¡Te reto en Kardux Battle! Código ${code}`,
            url: inviteUrl(code),
        });
    } catch {
        // User dismissed the share sheet - nothing to do.
    }
}
