import type { DeckSourceDescriptor, DeckSourceId } from '@kardux/contracts';
import { type JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeckSourceCarousel from '../components/DeckSourceCarousel';
import { ApiError, createMatch, listDeckSources } from '../lib/api';

const DURATION_PRESETS = [
    { label: '30 min', ms: 1_800_000 },
    { label: '1 hora', ms: 3_600_000 },
    { label: '2 horas', ms: 7_200_000 },
    { label: 'Sin límite', ms: 0 },
];

export default function CreateMatchPage(): JSX.Element {
    const navigate = useNavigate();
    const [sources, setSources] = useState<DeckSourceDescriptor[]>([]);
    const [deckSources, setDeckSources] = useState<string[]>([]);
    const [minPlayers, setMinPlayers] = useState(2);
    const [maxPlayers, setMaxPlayers] = useState(7);
    const [autoStartPlayers, setAutoStartPlayers] = useState(7);
    const [matchDurationMs, setMatchDurationMs] = useState(3_600_000);
    const [packs, setPacks] = useState(4);
    const [cardsPerPack, setCardsPerPack] = useState(8);
    const [visibility, setVisibility] = useState<'public' | 'private'>('public');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => {
        listDeckSources()
            .then((list) => {
                setSources(list);
                const firstReady = list.find((s) => s.ready);
                if (firstReady) setDeckSources([firstReady.id]);
            })
            .catch(() => setError('No se pudieron cargar las fuentes de mazo.'));
    }, []);

    function toggleSource(id: string): void {
        setDeckSources((current) =>
            current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
        );
    }

    // autoStartPlayers must always stay within [minPlayers, maxPlayers] - clamp instead of
    // letting the server reject a stale value the user never touched directly.
    function updateMinPlayers(value: number): void {
        setMinPlayers(value);
        setAutoStartPlayers((current) => Math.min(Math.max(current, value), maxPlayers));
    }

    function updateMaxPlayers(value: number): void {
        setMaxPlayers(value);
        setAutoStartPlayers((current) => Math.min(current, value));
    }

    async function handleSubmit(event: React.FormEvent): Promise<void> {
        event.preventDefault();
        setError(undefined);
        setBusy(true);
        try {
            const match = await createMatch({
                minPlayers,
                maxPlayers,
                autoStartPlayers,
                matchDurationMs,
                packs,
                cardsPerPack,
                visibility,
                deckSources: deckSources.length > 0 ? (deckSources as DeckSourceId[]) : undefined,
                mixSources: deckSources.length > 1,
            });
            navigate(`/match/${match.matchId}`, {
                state: { code: match.code, hostId: match.hostId },
            });
        } catch (err) {
            setError(err instanceof ApiError ? err.payload.message : 'No se pudo crear la sala.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="page" style={{ maxWidth: 680 }}>
            <h2 style={{ marginBottom: '1.25rem' }}>Crear sala</h2>
            <form className="stack" onSubmit={handleSubmit}>
                <div className="card">
                    <h4>Mazo</h4>
                    <DeckSourceCarousel
                        sources={sources}
                        selected={deckSources}
                        onToggle={toggleSource}
                    />
                    {deckSources.length > 1 && (
                        <p className="faint">
                            Mazo mixto: se combinarán cartas de {deckSources.length} fuentes.
                        </p>
                    )}
                </div>

                <div className="card">
                    <h4>Jugadores</h4>
                    <div className="row">
                        <div className="field">
                            <label>Mínimos</label>
                            <input
                                type="number"
                                min={2}
                                max={12}
                                value={minPlayers}
                                onChange={(e) => updateMinPlayers(Number(e.target.value))}
                            />
                        </div>
                        <div className="field">
                            <label>Máximos</label>
                            <input
                                type="number"
                                min={2}
                                max={12}
                                value={maxPlayers}
                                onChange={(e) => updateMaxPlayers(Number(e.target.value))}
                            />
                        </div>
                        <div className="field">
                            <label>Auto-inicio al llegar a</label>
                            <input
                                type="number"
                                min={minPlayers}
                                max={maxPlayers}
                                value={autoStartPlayers}
                                onChange={(e) => setAutoStartPlayers(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h4>Duración de la partida</h4>
                    <div className="row" role="radiogroup" aria-label="Duración de la partida">
                        {DURATION_PRESETS.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                className={matchDurationMs === preset.ms ? 'active' : ''}
                                style={
                                    matchDurationMs === preset.ms
                                        ? {
                                              borderColor: 'var(--gold)',
                                              color: 'var(--gold-bright)',
                                          }
                                        : undefined
                                }
                                onClick={() => setMatchDurationMs(preset.ms)}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <p className="faint">
                        {matchDurationMs === 0
                            ? 'La partida termina solo cuando alguien se queda con todo el mazo.'
                            : 'Al agotarse el tiempo, gana quien tenga más cartas (empate si persiste el empate entre dos o más).'}
                    </p>
                </div>

                <div className="card">
                    <h4>Mazo y visibilidad</h4>
                    <div className="row">
                        <div className="field">
                            <label>Paquetes (N)</label>
                            <input
                                type="number"
                                min={1}
                                value={packs}
                                onChange={(e) => setPacks(Number(e.target.value))}
                            />
                        </div>
                        <div className="field">
                            <label>Cartas por paquete (M)</label>
                            <input
                                type="number"
                                min={1}
                                max={26}
                                value={cardsPerPack}
                                onChange={(e) => setCardsPerPack(Number(e.target.value))}
                            />
                        </div>
                        <div className="field">
                            <label>Visibilidad</label>
                            <select
                                value={visibility}
                                onChange={(e) =>
                                    setVisibility(e.target.value as 'public' | 'private')
                                }
                            >
                                <option value="public">Pública</option>
                                <option value="private">Privada</option>
                            </select>
                        </div>
                    </div>
                </div>

                {error && <p className="error-text">{error}</p>}
                <button
                    className="primary"
                    type="submit"
                    disabled={busy || deckSources.length === 0}
                >
                    Crear sala
                </button>
            </form>
        </div>
    );
}
