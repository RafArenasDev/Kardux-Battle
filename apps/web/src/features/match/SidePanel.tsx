import type { ChatMessagePayload, RedactedMatchState } from '@kardux/contracts';
import { motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import type { FrozenCounts } from './useMatchSession';

export type PanelTab = 'standings' | 'chat';

interface SidePanelProps {
    state: RedactedMatchState;
    chat: ChatMessagePayload[];
    tab: PanelTab;
    onTab: (tab: PanelTab) => void;
    unread: number;
    /** While the deal plays the counts are still landing; during a reveal they lag behind. */
    dealing: boolean;
    frozen: FrozenCounts | null;
    onSend: (text: string) => void;
}

/** Live standings (cards held right now) and the table chat. */
export function SidePanel({
    state,
    chat,
    tab,
    onTab,
    unread,
    dealing,
    frozen,
    onSend,
}: SidePanelProps): JSX.Element {
    const { t } = useTranslation();
    const [text, setText] = useState('');
    const listRef = useRef<HTMLOListElement>(null);
    const players = new Map(state.players.map((player) => [player.id, player]));

    useEffect(() => {
        if (tab === 'chat') listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
    }, [tab, chat.length]);

    function submit(event: FormEvent): void {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        onSend(trimmed.slice(0, 280));
        setText('');
    }

    const standings = [...state.players]
        .filter((player) => !player.isSpectator || player.isEliminated)
        .sort((a, b) => Number(a.hasLeft) - Number(b.hasLeft) || b.cardCount - a.cardCount);

    // Chat only makes sense between real people (guests or accounts) - there is nobody on the
    // other end of it in a practice match against the machine.
    const allowChat = !state.players.some((player) => player.id.startsWith('bot:'));

    return (
        <aside className="side-panel panel">
            {allowChat ? (
                <div className="segmented" role="tablist" aria-label={t('panel.label')}>
                    {(['standings', 'chat'] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            role="tab"
                            className="segmented__item"
                            aria-selected={tab === option}
                            onClick={() => onTab(option)}
                        >
                            {tab === option ? (
                                <motion.span
                                    layoutId="side-panel-thumb"
                                    className="segmented__thumb"
                                    transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                                />
                            ) : null}
                            {t(`panel.${option}`)}
                            {option === 'chat' && unread > 0 ? (
                                <span
                                    className="unread-dot"
                                    aria-label={t('panel.unread', { count: unread })}
                                >
                                    {unread}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            ) : null}

            {tab === 'standings' || !allowChat ? (
                <ol className="standings">
                    <li className="standings__legend text-3">{t('panel.legend')}</li>
                    {standings.map((player, index) => (
                        <li
                            key={player.id}
                            className={[
                                'standings__row',
                                player.id === state.yourId && 'is-you',
                                player.isEliminated && 'is-out',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            <span className="standings__rank">{index + 1}</span>
                            <Avatar seed={player.avatarSeed} size={32} />
                            <span className="standings__name">
                                {player.id === state.yourId
                                    ? t('common.youSuffix', { name: player.nickname })
                                    : player.nickname}
                                {player.hasLeft ? (
                                    <span className="badge badge--lose">
                                        {t('table.status.left')}
                                    </span>
                                ) : null}
                            </span>
                            <span className="standings__count tabular">
                                {dealing ? '…' : (frozen?.cards[player.id] ?? player.cardCount)}
                            </span>
                        </li>
                    ))}
                </ol>
            ) : (
                <div className="chat">
                    <ol className="chat__list" ref={listRef}>
                        {chat.length === 0 ? (
                            <li className="text-3 chat__empty">{t('panel.chatEmpty')}</li>
                        ) : (
                            chat.map((message) => {
                                const author = players.get(message.playerId);
                                const mine = message.playerId === state.yourId;
                                return (
                                    <li
                                        key={`${message.at}-${message.playerId}`}
                                        className={`chat__msg ${mine ? 'is-mine' : ''}`}
                                    >
                                        {!mine && author ? (
                                            <Avatar seed={author.avatarSeed} size={24} />
                                        ) : null}
                                        <span className="chat__bubble">
                                            {!mine ? (
                                                <strong>
                                                    {author?.nickname ?? t('common.player')}
                                                </strong>
                                            ) : null}
                                            {/* Rendered as text - never as HTML. */}
                                            <span>{message.text}</span>
                                        </span>
                                    </li>
                                );
                            })
                        )}
                    </ol>
                    <form className="chat__form" onSubmit={submit}>
                        <label className="sr-only" htmlFor="chat-input">
                            {t('panel.message')}
                        </label>
                        <input
                            id="chat-input"
                            className="input"
                            placeholder={t('panel.placeholder')}
                            maxLength={280}
                            autoComplete="off"
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                        />
                        <Button
                            type="submit"
                            variant="gold"
                            icon="paper-plane"
                            aria-label={t('panel.send')}
                            disabled={!text.trim()}
                        />
                    </form>
                </div>
            )}
        </aside>
    );
}
