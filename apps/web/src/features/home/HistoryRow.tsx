import type { MatchSummaryWithRole } from '@kardux/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

/** Green for a win, red for anything that cost the host the room (loss, abandon), muted
 *  gray for everything still open or with no winner to speak of (draw, cancelled). */
function badgeVariant(room: MatchSummaryWithRole): 'win' | 'lose' | 'muted' {
    if (room.outcome === 'won') return 'win';
    if (room.outcome === 'lost' || room.outcome === 'abandoned') return 'lose';
    return 'muted';
}

/** One row of room history - the same markup for the home page's short preview and the
 *  "ver todo" modal's full list, so the two never drift apart. */
export function HistoryRow({ room }: { room: MatchSummaryWithRole }): JSX.Element {
    const { t } = useTranslation();
    const label = room.outcome
        ? t(`home.history.outcome.${room.outcome}`)
        : t(`home.history.status.${room.status}`);
    const showRival =
        room.winnerNickname !== null &&
        (room.outcome === 'lost' || room.outcome === 'abandoned' || room.outcome === 'draw');

    return (
        <li className="room-item">
            <span className="room-item__code">{room.code}</span>
            <span className="room-item__meta">
                <strong>
                    {t('common.players', { count: room.playerCount })} / {room.config.maxPlayers}
                </strong>
                <span className="text-3">
                    {showRival ? t('home.history.vs', { name: room.winnerNickname }) : null}
                </span>
            </span>
            <span className={`badge badge--${badgeVariant(room)}`}>{label}</span>
        </li>
    );
}
