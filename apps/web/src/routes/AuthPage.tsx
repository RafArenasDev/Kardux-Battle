import type { CheckUsernameResponse } from '@kardux/contracts';
import { motion } from 'framer-motion';
import { type JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, checkUsername, createGuest, login, register } from '../lib/api';
import { getTabId, isAuthenticated, saveSession } from '../lib/session';

const PENDING_JOIN_KEY = 'kardux.pendingJoinCode';

function afterAuthRedirect(navigate: ReturnType<typeof useNavigate>): void {
    const pendingCode = sessionStorage.getItem(PENDING_JOIN_KEY);
    if (pendingCode) {
        sessionStorage.removeItem(PENDING_JOIN_KEY);
        navigate(`/join/${pendingCode}`, { replace: true });
        return;
    }
    navigate('/lobby', { replace: true });
}

export default function AuthPage(): JSX.Element {
    const navigate = useNavigate();
    const [mode, setMode] = useState<'register' | 'login'>('register');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => {
        if (isAuthenticated()) afterAuthRedirect(navigate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleGuest(): Promise<void> {
        setBusy(true);
        setError(undefined);
        try {
            const auth = await createGuest(getTabId());
            saveSession(auth, 'guest');
            afterAuthRedirect(navigate);
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.payload.message
                    : 'No se pudo crear la identidad de invitado.',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="page auth-page">
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                className="auth-hero"
            >
                <img src="/logo.png" alt="Kardux Battle" className="auth-logo" />
                <h1 className="brand-title">Kardux Battle</h1>
                <p className="muted auth-tagline">Elige el atributo. Gánate la mesa.</p>
            </motion.div>

            <div className="card stack auth-guest-card">
                <button className="primary" onClick={handleGuest} disabled={busy}>
                    Jugar como invitado
                </button>
                <p className="faint">
                    Sin registro - puedes unirte y jugar partidas ya creadas, pero no podrás crear
                    salas propias.
                </p>
            </div>

            <div className="card">
                <div className="tabs">
                    <button
                        className={mode === 'register' ? 'active' : ''}
                        onClick={() => setMode('register')}
                    >
                        Registrarme
                    </button>
                    <button
                        className={mode === 'login' ? 'active' : ''}
                        onClick={() => setMode('login')}
                    >
                        Iniciar sesión
                    </button>
                </div>

                {mode === 'register' ? (
                    <RegisterForm
                        busy={busy}
                        setBusy={setBusy}
                        onDone={() => afterAuthRedirect(navigate)}
                    />
                ) : (
                    <LoginForm
                        busy={busy}
                        setBusy={setBusy}
                        onDone={() => afterAuthRedirect(navigate)}
                    />
                )}

                {error && <p className="error-text">{error}</p>}
            </div>
        </div>
    );
}

interface FormProps {
    busy: boolean;
    setBusy: (busy: boolean) => void;
    onDone: () => void;
}

function RegisterForm({ busy, setBusy, onDone }: FormProps): JSX.Element {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [availability, setAvailability] = useState<CheckUsernameResponse>();
    const [error, setError] = useState<string>();
    const [suggestions, setSuggestions] = useState<string[]>([]);

    useEffect(() => {
        if (username.length < 3) {
            setAvailability(undefined);
            return;
        }
        const handle = setTimeout(() => {
            checkUsername(username)
                .then(setAvailability)
                .catch(() => setAvailability(undefined));
        }, 400);
        return () => clearTimeout(handle);
    }, [username]);

    async function handleSubmit(event: React.FormEvent): Promise<void> {
        event.preventDefault();
        setError(undefined);
        setSuggestions([]);

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setBusy(true);
        try {
            const auth = await register({ username, password, tabId: getTabId() });
            saveSession(auth, 'account');
            onDone();
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.payload.message);
                const rawSuggestions = err.payload.data?.suggestions;
                if (Array.isArray(rawSuggestions)) setSuggestions(rawSuggestions as string[]);
            } else {
                setError('No se pudo completar el registro.');
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="stack" onSubmit={handleSubmit}>
            <div className="field">
                <label htmlFor="reg-username">Usuario</label>
                <input
                    id="reg-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    minLength={3}
                    maxLength={24}
                    required
                    autoComplete="username"
                />
                {availability && !availability.available && (
                    <span className="error-text">
                        No disponible.
                        {availability.suggestions.length > 0 && (
                            <SuggestionChips
                                items={availability.suggestions}
                                onPick={setUsername}
                            />
                        )}
                    </span>
                )}
                {availability?.available && <span className="success-text">Disponible.</span>}
            </div>
            <div className="field">
                <label htmlFor="reg-password">Contraseña (mín. 8 caracteres)</label>
                <input
                    id="reg-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                />
            </div>
            <div className="field">
                <label htmlFor="reg-confirm">Confirmar contraseña</label>
                <input
                    id="reg-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    autoComplete="new-password"
                />
            </div>
            {error && (
                <p className="error-text">
                    {error}
                    {suggestions.length > 0 && (
                        <SuggestionChips items={suggestions} onPick={setUsername} />
                    )}
                </p>
            )}
            <button
                className="primary"
                type="submit"
                disabled={busy || availability?.available === false}
            >
                Crear cuenta
            </button>
        </form>
    );
}

function SuggestionChips({
    items,
    onPick,
}: {
    items: string[];
    onPick: (v: string) => void;
}): JSX.Element {
    return (
        <span
            className="row"
            style={{ display: 'inline-flex', gap: '0.3rem', marginLeft: '0.3rem' }}
        >
            {items.map((s) => (
                <button key={s} type="button" className="ghost" onClick={() => onPick(s)}>
                    {s}
                </button>
            ))}
        </span>
    );
}

function LoginForm({ busy, setBusy, onDone }: FormProps): JSX.Element {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();

    async function handleSubmit(event: React.FormEvent): Promise<void> {
        event.preventDefault();
        setError(undefined);
        setBusy(true);
        try {
            const auth = await login({ username, password, tabId: getTabId() });
            saveSession(auth, 'account');
            onDone();
        } catch (err) {
            setError(err instanceof ApiError ? err.payload.message : 'No se pudo iniciar sesión.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="stack" onSubmit={handleSubmit}>
            <div className="field">
                <label htmlFor="login-username">Usuario</label>
                <input
                    id="login-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    autoComplete="username"
                />
            </div>
            <div className="field">
                <label htmlFor="login-password">Contraseña</label>
                <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>
                Iniciar sesión
            </button>
        </form>
    );
}
