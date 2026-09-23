import { randomAvatarSeed } from '@kardux/content';
import { AnimatePresence, motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/brand/Brand';
import { AppFooter } from '../../components/layout/AppFooter';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Segmented } from '../../components/ui/Segmented';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useNow';
import { ApiError, checkUsername, createGuest, login, register } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import type { AuthMethod } from '../../lib/session';
import { getTabId, saveSession, takePostAuthRedirect } from '../../lib/session';
import { disconnectGameSocket } from '../../lib/socket';
import { AvatarPicker } from './AvatarPicker';

type Mode = 'login' | 'register';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

const FEATURES = [
    {
        icon: 'lightning-helix',
        title: 'Mazo Pokémon',
        text: 'Más de mil Pokémon con sus estadísticas oficiales.',
    },
    {
        icon: 'race-car',
        title: 'Máquinas y criaturas',
        text: 'Autos, aviones, trenes y bestias míticas.',
    },
    { icon: 'sword-clash', title: 'Duelos en vivo', text: 'Hasta 12 jugadores, en tiempo real.' },
] as const;

export default function AuthPage(): JSX.Element {
    useDocumentTitle('');
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const [mode, setMode] = useState<Mode>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [avatarSeed, setAvatarSeed] = useState(() => randomAvatarSeed());
    const [availability, setAvailability] = useState<{
        available: boolean;
        suggestions: string[];
    } | null>(null);
    const [busy, setBusy] = useState<'login' | 'register' | 'guest' | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    // Live username availability while registering (debounced).
    useEffect(() => {
        setAvailability(null);
        if (mode !== 'register' || !USERNAME_PATTERN.test(username)) return;
        const timer = window.setTimeout(() => {
            checkUsername(username)
                .then(setAvailability)
                .catch(() => setAvailability(null));
        }, 400);
        return () => window.clearTimeout(timer);
    }, [mode, username]);

    function finish(method: AuthMethod, auth: Parameters<typeof saveSession>[0]): void {
        disconnectGameSocket();
        saveSession(auth, method);
        const from = (location.state as { from?: string } | null)?.from;
        navigate(takePostAuthRedirect() ?? from ?? '/home', { replace: true });
        toast.show(`¡Bienvenido, ${auth.user.nickname}!`, 'success');
    }

    const usernameValid = USERNAME_PATTERN.test(username);
    const passwordValid = password.length >= 8;
    const confirmValid = mode === 'login' || confirm === password;
    const canSubmit =
        usernameValid &&
        (mode === 'login'
            ? password.length > 0
            : passwordValid && confirmValid && availability?.available !== false);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        if (!canSubmit || busy) return;
        setFormError(null);
        setBusy(mode);
        try {
            const tabId = getTabId();
            const auth =
                mode === 'login'
                    ? await login({ username, password, tabId })
                    : await register({ username, password, tabId, avatarSeed });
            finish('account', auth);
        } catch (error) {
            const message =
                error instanceof ApiError && error.payload.code === 'ERR_UNAUTHORIZED'
                    ? 'Usuario o contraseña incorrectos.'
                    : errorMessage(error);
            setFormError(message);
        } finally {
            setBusy(null);
        }
    }

    async function playAsGuest(): Promise<void> {
        setBusy('guest');
        setFormError(null);
        try {
            finish('guest', await createGuest(getTabId()));
        } catch (error) {
            setFormError(errorMessage(error));
        } finally {
            setBusy(null);
        }
    }

    const usernameHint =
        mode === 'register' && username.length > 0
            ? !usernameValid
                ? { tone: 'error' as const, text: '3 a 24 caracteres: letras, números o _' }
                : availability === null
                  ? { tone: 'default' as const, text: 'Comprobando…' }
                  : availability.available
                    ? { tone: 'ok' as const, text: '¡Disponible!' }
                    : {
                          tone: 'error' as const,
                          text: `Ocupado. Prueba: ${availability.suggestions.join(', ')}`,
                      }
            : undefined;

    return (
        <div className="auth">
            <section className="auth__brand" aria-label="Kardux Battle">
                <div className="auth__glow" aria-hidden />
                <motion.div
                    className="auth__logo-wrap"
                    initial={{ opacity: 0, scale: 0.92, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: 'spring', bounce: 0.25, duration: 0.8 }}
                >
                    <BrandLogo className="auth__logo" />
                </motion.div>
                <p className="auth__tagline">Elige el atributo. Gánate la mesa.</p>
                <ul className="auth__features">
                    {FEATURES.map((feature, index) => (
                        <motion.li
                            key={feature.title}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                delay: 0.25 + index * 0.08,
                                type: 'spring',
                                bounce: 0,
                                duration: 0.5,
                            }}
                        >
                            <span className="auth__feature-icon">
                                <Icon name={feature.icon} />
                            </span>
                            <span>
                                <strong>{feature.title}</strong>
                                <span className="text-2">{feature.text}</span>
                            </span>
                        </motion.li>
                    ))}
                </ul>
            </section>

            <section className="auth__form-col">
                <div className="auth__form-wrap">
                    <div className="panel panel--pad auth__panel">
                        <div className="stack" style={{ ['--gap' as string]: '6px' }}>
                            <h1 className="auth__title">
                                {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
                            </h1>
                            <p className="text-2">
                                {mode === 'login'
                                    ? 'Entra para crear salas privadas y retar a tus amigos.'
                                    : 'Elige tu nombre, tu contraseña y tu avatar.'}
                            </p>
                        </div>

                        <Segmented
                            label="Tipo de acceso"
                            value={mode}
                            onChange={(next) => {
                                setMode(next);
                                setFormError(null);
                            }}
                            options={[
                                { value: 'login', label: 'Iniciar sesión' },
                                { value: 'register', label: 'Crear cuenta' },
                            ]}
                        />

                        <form className="stack" onSubmit={submit} noValidate>
                            <TextField
                                label="Usuario"
                                icon="visored-helm"
                                name="username"
                                autoComplete="username"
                                autoCapitalize="off"
                                spellCheck={false}
                                maxLength={24}
                                placeholder="Tu nombre de jugador"
                                value={username}
                                onChange={(event) => setUsername(event.target.value.trim())}
                                hint={usernameHint?.text}
                                hintTone={usernameHint?.tone}
                                required
                            />
                            <TextField
                                label="Contraseña"
                                icon="checked-shield"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete={
                                    mode === 'login' ? 'current-password' : 'new-password'
                                }
                                placeholder={
                                    mode === 'login' ? 'Tu contraseña' : 'Mínimo 8 caracteres'
                                }
                                value={password}
                                maxLength={128}
                                onChange={(event) => setPassword(event.target.value)}
                                hint={
                                    mode === 'register' && password.length > 0 && !passwordValid
                                        ? 'Mínimo 8 caracteres.'
                                        : undefined
                                }
                                hintTone="error"
                                trailing={
                                    <button
                                        type="button"
                                        className="field__toggle"
                                        onClick={() => setShowPassword((value) => !value)}
                                        aria-label={
                                            showPassword
                                                ? 'Ocultar contraseña'
                                                : 'Mostrar contraseña'
                                        }
                                        aria-pressed={showPassword}
                                        title={
                                            showPassword
                                                ? 'Ocultar contraseña'
                                                : 'Mostrar contraseña'
                                        }
                                    >
                                        <Icon name={showPassword ? 'sight-disabled' : 'eyeball'} />
                                    </button>
                                }
                                required
                            />

                            <AnimatePresence initial={false}>
                                {mode === 'register' ? (
                                    <motion.div
                                        key="register-extra"
                                        className="stack auth__register-extra"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                                    >
                                        <TextField
                                            label="Confirmar contraseña"
                                            icon="checked-shield"
                                            name="confirm"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            placeholder="Repite la contraseña"
                                            value={confirm}
                                            maxLength={128}
                                            onChange={(event) => setConfirm(event.target.value)}
                                            hint={
                                                confirm.length > 0 && !confirmValid
                                                    ? 'Las contraseñas no coinciden.'
                                                    : undefined
                                            }
                                            hintTone="error"
                                        />
                                        <AvatarPicker value={avatarSeed} onChange={setAvatarSeed} />
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>

                            {formError ? (
                                <p className="form-error" role="alert">
                                    {formError}
                                </p>
                            ) : null}

                            <Button
                                type="submit"
                                variant="gold"
                                size="lg"
                                block
                                icon={mode === 'login' ? 'crossed-swords' : 'laurels-trophy'}
                                loading={busy === 'login' || busy === 'register'}
                                disabled={!canSubmit || busy !== null}
                            >
                                {mode === 'login' ? 'Entrar a la batalla' : 'Crear cuenta y jugar'}
                            </Button>
                        </form>

                        <div className="divider">o</div>

                        <Button
                            variant="ghost"
                            block
                            icon="hooded-figure"
                            loading={busy === 'guest'}
                            disabled={busy !== null}
                            onClick={playAsGuest}
                        >
                            Jugar como invitado
                        </Button>
                        <p className="auth__guest-note text-3">
                            Los invitados juegan partidas rápidas. Para crear salas privadas, crea
                            una cuenta.
                        </p>
                    </div>
                </div>
                <AppFooter compact />
            </section>
        </div>
    );
}
