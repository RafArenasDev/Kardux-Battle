import type { ChatMessagePayload, RedactedMatchState } from '@kardux/contracts';
import { motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';

interface SidePanelProps {
    state: RedactedMatchState;
    chat: ChatMessagePayload[];
    onSend: (text: string) => void;
}

type Tab = 'standings' | 'chat';

export function SidePanel({ state, chat, onSend }: SidePanelProps): JSX.Element {
    const [tab, setTab] = useState<Tab>('standings');
    const [text, setText] = useState('');
    const [seen, setSeen] = useState(0);
    const listRef = useRef<HTMLOListElement>(null);
    const nicknames = new Map(state.players.map((player) => [player.id, player]));
    const unread = tab === 'chat' ? 0 : Math.max(0, chat.length - seen);

    useEffect(() => {
        if (tab === 'chat') {
            setSeen(chat.length);
            listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
        }
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
        .sort((a, b) => b.cardCount - a.cardCount);

    return (
        <aside className="side-panel panel">
            <Segmented
                label="Panel"
                value={tab}
                onChange={setTab}
                options={[
                    { value: 'standings', label: 'Posiciones' },
                    { value: 'chat', label: unread > 0 ? `Chat (${unread})` : 'Chat' },
                ]}
            />

            {tab === 'standings' ? (
                <ol className="standings">
                    {standings.map((player, index) => (
                        <motion.li
                            key={player.id}
                            layout
                            transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
                            className={`standings__row ${player.id === state.yourId ? 'is-you' : ''} ${player.isEliminated ? 'is-out' : ''}`}
                        >
                            <span className="standings__rank">{index + 1}</span>
                            <Avatar seed={player.avatarSeed} size={32} />
                            <span className="standings__name">
                                {player.nickname}
                                {player.id === state.yourId ? (
                                    <span className="text-3"> (tú)</span>
                                ) : null}
                            </span>
                            <span className="standings__count tabular">{player.cardCount}</span>
                        </motion.li>
                    ))}
                </ol>
            ) : (
                <div className="chat">
                    <ol className="chat__list" ref={listRef}>
                        {chat.length === 0 ? (
                            <li className="text-3 chat__empty">Saluda a la mesa 👋</li>
                        ) : (
                            chat.map((message) => {
                                const author = nicknames.get(message.playerId);
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
                                                <strong>{author?.nickname ?? 'Jugador'}</strong>
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
                            Mensaje
                        </label>
                        <input
                            id="chat-input"
                            className="input"
                            placeholder="Escribe un mensaje…"
                            maxLength={280}
                            autoComplete="off"
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                        />
                        <Button
                            type="submit"
                            variant="gold"
                            icon="chat-bubble"
                            aria-label="Enviar"
                            disabled={!text.trim()}
                        />
                    </form>
                </div>
            )}
        </aside>
    );
}
