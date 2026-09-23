import type { MatchSummary, MatchSummaryWithRole } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import { type JSX, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, listMyMatches, listPublicMatches } from '../lib/api';
import { getUser, isGuest } from '../lib/session';
import { connectGameSocket } from '../lib/socket';

export default function LobbyPage(): JSX.Element {
    const navigate = useNavigate();
    const [mine, setMine] = useState<MatchSummaryWithRole[]>([]);
    const [publicMatches, setPublicMatches] = useState<MatchSummary[]>([]);
    const [error, setError] = useState<string>();
    const guest = isGuest();

    useEffect(() => {
        Promise.all([listMyMatches(), listPublicMatches()])
            .then(([mineResult, publicResult]) => {
                setMine(mineResult);
                setPublicMatches(publicResult);
            })
            .catch((err) =>
                setError(
                    err instanceof ApiError
                        ? err.payload.message
                        : 'No se pudieron cargar las salas.',
                ),
            );
    }, []);

    return (
        <div className="page">
            <div className="spread" style={{ marginBottom: '1.25rem' }}>
                <h2>Lobby</h2>
                <button
                    className="primary"
                    disabled={guest}
                    title={guest ? 'Regístrate para crear salas' : undefined}
                    onClick={() => navigate('/create')}
                >
                    Crear sala
                </button>
            </div>
            {guest && (
                <p className="muted" style={{ marginBottom: '1rem' }}>
                    Estás jugando como invitado - regístrate para poder crear salas.
                </p>
            )}
            {error && <p className="error-text">{error}</p>}

            <div className="card">
                <h4>Mis salas</h4>
                {mine.length === 0 && (
                    <p className="muted">Todavía no participas en ninguna sala.</p>
                )}
                <div className="grid" style={{ marginTop: mine.length > 0 ? '0.75rem' : 0 }}>
                    <AnimatePresence>
                        {mine.map((match) => (
                            <MatchRow
                                key={match.matchId}
                                match={match}
                                roleLabel={match.role === 'admin' ? 'Anfitrión' : 'Jugador'}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            <div className="card">
                <h4>Salas públicas</h4>
                {publicMatches.length === 0 && (
                    <p className="muted">No hay salas públicas abiertas en este momento.</p>
                )}
                <div
                    className="grid"
                    style={{ marginTop: publicMatches.length > 0 ? '0.75rem' : 0 }}
                >
                    <AnimatePresence>
                        {publicMatches.map((match) => (
                            <MatchRow key={match.matchId} match={match} showRequestJoin />
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

function MatchRow({
    match,
    roleLabel,
    showRequestJoin,
}: {
    match: MatchSummary;
    roleLabel?: string;
    showRequestJoin?: boolean;
}): JSX.Element {
    const navigate = useNavigate();
    const [requestState, setRequestState] = useState<'idle' | 'pending' | 'rejected'>('idle');

    function handleRequestJoin(): void {
        const user = getUser();
        if (!user) return;
        setRequestState('pending');
        const socket = connectGameSocket();

        socket.once('match:joinRequestPending', () => setRequestState('pending'));
        socket.once('match:joinApproved', (payload) => {
            navigate(`/match/${match.matchId}`, {
                state: { code: payload.code, hostId: match.hostId },
            });
        });
        socket.once('match:joinRejected', () => setRequestState('rejected'));

        socket.emit('match:requestJoin', {
            matchId: match.matchId,
            nickname: user.nickname,
            avatarSeed: user.avatarSeed,
        });
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="match-row"
        >
            <div className="row">
                <img className="avatar" src={match.hostAvatarUrl} alt="" />
                <div>
                    <div>
                        {match.hostNickname} <span className="muted">· {match.code}</span>
                    </div>
                    <div className="muted">
                        {match.status} {roleLabel && `· ${roleLabel}`}
                    </div>
                </div>
            </div>
            <div className="row">
                <Link to={`/join/${match.code}`}>
                    <button>Unirse con código</button>
                </Link>
                {showRequestJoin && (
                    <button onClick={handleRequestJoin} disabled={requestState === 'pending'}>
                        {requestState === 'pending'
                            ? 'Esperando aprobación…'
                            : requestState === 'rejected'
                              ? 'Solicitud rechazada'
                              : 'Solicitar unirme'}
                    </button>
                )}
            </div>
        </motion.div>
    );
}
