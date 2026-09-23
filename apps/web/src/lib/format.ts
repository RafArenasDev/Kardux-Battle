export function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
    if (ms === 0) return 'Sin límite';
    const minutes = Math.round(ms / 60_000);
    return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}

export function playerKeyUserId(playerKey: string): string {
    return playerKey.split(':')[0] ?? playerKey;
}
