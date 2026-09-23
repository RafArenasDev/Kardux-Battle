import type { MatchSummary } from '@kardux/contracts';
import { getDeckInfo } from '@kardux/content';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useNow';
import { getMatchByCode } from '../../lib/api';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { formatDuration } from '../../lib/format';
import { getUser, isAuthenticated, setPostAuthRedirect } from '../../lib/session';
import { whenConnected } from '../../lib/socket';

const CODE_PATTERN = /^[0-9A-F]{6}$/;

export default function JoinPage(): JSX.Element {
    const params = useParams();
    const code = (params.code ?? '').toUpperCase();
    useDocumentTitle(`Sala ${code}`);
    const navigate = useNavigate();
    const toast = useToast();
    const [match, setMatch] = useState<MatchSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);
    const authenticated = isAuthenticated();

    useEffect(() => {
        if (!authenticated || !CODE_PATTERN.test(code)) return;
        getMatchByCode(code)
            .then(setMatch)
            .catch((reason: unknown) => setError(errorMessage(reason)));
    }, [authenticated, code]);

    if (!CODE_PATTERN.test(code)) {
        return <Navigate to="/home" replace />;
    }

    if (!authenticated) {
        // Remember the invite, sign in, then come straight back here.
        setPostAuthRedirect(`/join/${code}`);
        return <Navigate to="/" replace />;
    }

    async function join(): Promise<void> {
        const user = getUser();
        if (!user) return;
        setJoining(true);
        try {
            const socket = await whenConnected();
            const ack = await socket.timeout(10_000).emitWithAck('match:join', {
                code,
                nickname: user.nickname,
                avatarSeed: user.avatarSeed,
            });
            if (isErrorPayload(ack)) throw ack;
            navigate(`/match/${ack.matchId}`, { replace: true });
        } catch (reason) {
            toast.show(errorMessage(reason), 'error');
            setJoining(false);
        }
    }

    const deck = match ? getDeckInfo(match.config.deckSources[0] ?? 'pokeapi') : undefined;

    return (
        <AppShell>
            <div className="join">
                <div className="panel panel--pad join__panel">
                    <span className="eyebrow">Invitación a la sala</span>
                    <span className="join__code">{code}</span>

                    {error ? (
                        <>
                            <p className="form-error">{error}</p>
                            <Button icon="return-arrow" onClick={() => navigate('/home')}>
                                Volver al inicio
                            </Button>
                        </>
                    ) : !match ? (
                        <span className="spinner" style={{ ['--size' as string]: '32px' }} />
                    ) : (
                        <>
                            <div className="row" style={{ justifyContent: 'center' }}>
                                <img src={match.hostAvatarUrl} alt="" width={48} height={48} />
                                <div style={{ textAlign: 'left' }}>
                                    <strong>{match.hostNickname}</strong>
                                    <div className="text-3">te invita a jugar</div>
                                </div>
                            </div>
                            <div className="config-summary" style={{ justifyContent: 'center' }}>
                                {deck ? (
                                    <span className="badge">
                                        <Icon name={deck.coverIcon} /> {deck.label}
                                    </span>
                                ) : null}
                                <span className="badge badge--muted">
                                    {match.playerCount}/{match.config.maxPlayers} jugadores
                                </span>
                                <span className="badge badge--muted">
                                    {formatDuration(match.config.matchDurationMs)}
                                </span>
                                {match.status === 'IN_PROGRESS' ? (
                                    <span className="badge badge--lose">
                                        En juego - entrarás como espectador
                                    </span>
                                ) : null}
                            </div>
                            <Button
                                variant="gold"
                                size="lg"
                                block
                                icon="crossed-swords"
                                loading={joining}
                                onClick={join}
                            >
                                Entrar a la sala
                            </Button>
                            <Button variant="ghost" block onClick={() => navigate('/home')}>
                                Ahora no
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
