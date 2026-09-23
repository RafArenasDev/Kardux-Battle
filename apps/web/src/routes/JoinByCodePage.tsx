import type { MatchSummary } from '@kardux/contracts';
import { motion } from 'framer-motion';
import { type JSX, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getMatchByCode } from '../lib/api';
import { isAuthenticated } from '../lib/session';

const PENDING_JOIN_KEY = 'kardux.pendingJoinCode';

export default function JoinByCodePage(): JSX.Element {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const [match, setMatch] = useState<MatchSummary>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        if (!code) return;
        if (!isAuthenticated()) {
            sessionStorage.setItem(PENDING_JOIN_KEY, code);
            navigate('/', { replace: true });
            return;
        }
        getMatchByCode(code)
            .then(setMatch)
            .catch((err) =>
                setError(
                    err instanceof ApiError ? err.payload.message : 'No se pudo cargar la sala.',
                ),
            );
    }, [code, navigate]);

    function handleJoin(): void {
        if (!match) return;
        // The actual `match:join` socket emit happens once, on `MatchRoomPage` itself - doing
        // it here too would join twice (once per mount of this page, once there).
        navigate(`/match/${match.matchId}`, { state: { code: match.code, hostId: match.hostId } });
    }

    if (error && !match) {
        return (
            <div className="page" style={{ maxWidth: 480 }}>
                <p className="error-text">{error}</p>
            </div>
        );
    }

    if (!match) {
        return (
            <div className="page" style={{ maxWidth: 480 }}>
                <p className="muted">Cargando sala {code}…</p>
            </div>
        );
    }

    return (
        <div className="page" style={{ maxWidth: 480 }}>
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 26 }}
                className="card stack"
            >
                <div className="row">
                    <img className="avatar" src={match.hostAvatarUrl} alt="" />
                    <div>
                        <div>{match.hostNickname}</div>
                        <div className="muted">
                            Sala{' '}
                            <span
                                className="code-badge"
                                style={{ fontSize: '0.95rem', padding: '0.15rem 0.5rem' }}
                            >
                                {match.code}
                            </span>{' '}
                            · {match.status}
                        </div>
                    </div>
                </div>
                <p className="muted">
                    {match.config.minPlayers}-{match.config.maxPlayers} jugadores · mazo:{' '}
                    {match.config.deckSources.join(', ')}
                </p>
                {error && <p className="error-text">{error}</p>}
                <button
                    className="primary"
                    onClick={handleJoin}
                    disabled={match.status !== 'LOBBY'}
                >
                    {match.status === 'LOBBY' ? 'Unirse' : 'La sala ya no acepta jugadores'}
                </button>
            </motion.div>
        </div>
    );
}
