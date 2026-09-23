import type { IconName } from '@kardux/content';
import { randomAvatarSeed } from '@kardux/content';
import { AnimatePresence, motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/brand/Brand';
import { AppFooter } from '../../components/layout/AppFooter';
import { Button } from '../../components/ui/Button';
import { EyeIcon } from '../../components/ui/EyeIcon';
import { Icon } from '../../components/ui/Icon';
import { LanguageSwitch } from '../../components/ui/LanguageSwitch';
import { Segmented } from '../../components/ui/Segmented';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useNow';
import { ApiError, checkUsername, createGuest, login, register } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useI18n } from '../../lib/i18n';
import type { AuthMethod } from '../../lib/session';
import { getTabId, saveSession, takePostAuthRedirect } from '../../lib/session';
import { disconnectGameSocket } from '../../lib/socket';
import { AvatarPicker } from './AvatarPicker';

type Mode = 'login' | 'register';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

interface Feature {
    icon: IconName;
    title: [string, string];
    text: [string, string];
}

/** The three ways to play, as the landing pitch. */
const FEATURES: Feature[] = [
    {
        icon: 'crossed-swords',
        title: ['Batallas de atributos', 'Attribute battles'],
        text: [
            'Pokémon, países, criaturas míticas, autos, motos y aviones. Elige el atributo y gana la ronda.',
            'Pokémon, countries, mythic creatures, cars, bikes and planes. Pick the stat, win the round.',
        ],
    },
    {
        icon: 'card-ace-spades',
        title: ['Clásica', 'Classic'],
        text: [
            'Naipes de verdad: eliges carta de tu mano y la más alta gana. Puede haber empate.',
            'Real playing cards: pick one from your hand and the highest wins. Ties can happen.',
        ],
    },
    {
        icon: 'poker-hand',
        title: ['Casino', 'Casino'],
        text: [
            "Blackjack y Texas Hold'em con fichas virtuales. Sin dinero real.",
            "Blackjack and Texas Hold'em with virtual chips. No real money.",
        ],
    },
    {
        icon: 'share',
        title: ['Con amigos o contra la máquina', 'With friends or the machine'],
        text: [
            'Salas privadas con código, partidas rápidas o duelos contra el bot.',
            'Private rooms with a code, quick matches or duels against the bot.',
        ],
    },
];

export default function AuthPage(): JSX.Element {
    useDocumentTitle('');
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const { t, locale } = useI18n();
    const pickText = (pair: [string, string]): string => (locale === 'es' ? pair[0] : pair[1]);

    const [mode, setMode] = useState<Mode>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
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
        toast.show(
            t(`¡Bienvenido, ${auth.user.nickname}!`, `Welcome, ${auth.user.nickname}!`),
            'success',
        );
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
                    ? await login({ username, password, tabId, remember })
                    : await register({ username, password, tabId, avatarSeed, remember });
            finish('account', auth);
        } catch (error) {
            const message =
                error instanceof ApiError && error.payload.code === 'ERR_UNAUTHORIZED'
                    ? t('Usuario o contraseña incorrectos.', 'Wrong username or password.')
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
                ? {
                      tone: 'error' as const,
                      text: t(
                          '3 a 24 caracteres: letras, números o _',
                          '3 to 24 characters: letters, numbers or _',
                      ),
                  }
                : availability === null
                  ? { tone: 'default' as const, text: t('Comprobando…', 'Checking…') }
                  : availability.available
                    ? { tone: 'ok' as const, text: t('¡Disponible!', 'Available!') }
                    : {
                          tone: 'error' as const,
                          text: t(
                              `Ocupado. Prueba: ${availability.suggestions.join(', ')}`,
                              `Taken. Try: ${availability.suggestions.join(', ')}`,
                          ),
                      }
            : undefined;

    const passwordToggle = (
        <button
            type="button"
            className="field__toggle"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={
                showPassword
                    ? t('Ocultar contraseña', 'Hide password')
                    : t('Mostrar contraseña', 'Show password')
            }
            aria-pressed={showPassword}
        >
            <EyeIcon crossed={showPassword} />
        </button>
    );

    return (
        <div className="auth">
            <LanguageSwitch className="auth__lang" />
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
                <p className="auth__tagline">
                    {t('Elige tu juego. Gánate la mesa.', 'Pick your game. Own the table.')}
                </p>
                <ul className="auth__features">
                    {FEATURES.map((feature, index) => (
                        <motion.li
                            key={feature.icon}
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
                                <strong>{pickText(feature.title)}</strong>
                                <span className="text-2">{pickText(feature.text)}</span>
                            </span>
                        </motion.li>
                    ))}
                </ul>
            </section>

            <section className="auth__form-col">
                <div className="auth__form-wrap">
                    <div className="panel panel--pad auth__panel">
                        <div className="stack auth__heading" style={{ ['--gap' as string]: '6px' }}>
                            <h1 className="auth__title">
                                {mode === 'login'
                                    ? t('Bienvenido de vuelta', 'Welcome back')
                                    : t('Crea tu cuenta', 'Create your account')}
                            </h1>
                            <p className="text-2">
                                {mode === 'login'
                                    ? t(
                                          'Entra para crear salas privadas y retar a tus amigos.',
                                          'Sign in to open private rooms and challenge your friends.',
                                      )
                                    : t(
                                          'Elige tu nombre, tu contraseña y tu avatar.',
                                          'Pick your name, password and avatar.',
                                      )}
                            </p>
                        </div>

                        <Segmented
                            label={t('Tipo de acceso', 'Access type')}
                            value={mode}
                            onChange={(next) => {
                                setMode(next);
                                setFormError(null);
                            }}
                            options={[
                                { value: 'login', label: t('Iniciar sesión', 'Sign in') },
                                { value: 'register', label: t('Crear cuenta', 'Sign up') },
                            ]}
                        />

                        <form className="stack" onSubmit={submit} noValidate>
                            <TextField
                                label={t('Usuario', 'Username')}
                                icon="visored-helm"
                                name="username"
                                autoComplete="username"
                                autoCapitalize="off"
                                spellCheck={false}
                                maxLength={24}
                                placeholder={t('Tu nombre de jugador', 'Your player name')}
                                value={username}
                                onChange={(event) => setUsername(event.target.value.trim())}
                                hint={usernameHint?.text}
                                hintTone={usernameHint?.tone}
                                required
                            />
                            <TextField
                                label={t('Contraseña', 'Password')}
                                icon="checked-shield"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete={
                                    mode === 'login' ? 'current-password' : 'new-password'
                                }
                                placeholder={
                                    mode === 'login'
                                        ? t('Tu contraseña', 'Your password')
                                        : t('Mínimo 8 caracteres', 'At least 8 characters')
                                }
                                value={password}
                                maxLength={128}
                                onChange={(event) => setPassword(event.target.value)}
                                hint={
                                    mode === 'register' && password.length > 0 && !passwordValid
                                        ? t('Mínimo 8 caracteres.', 'At least 8 characters.')
                                        : undefined
                                }
                                hintTone="error"
                                trailing={passwordToggle}
                                required
                            />

                            <AnimatePresence initial={false}>
                                {mode === 'register' ? (
                                    <motion.div
                                        key="register-extra"
                                        className="stack auth__register-extra"
                                        // Clip only while the height animates, so selection rings
                                        // and tooltips inside are never cut off once it is open.
                                        initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                                        animate={{
                                            opacity: 1,
                                            height: 'auto',
                                            transitionEnd: { overflow: 'visible' },
                                        }}
                                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                                        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                                    >
                                        <TextField
                                            label={t('Confirmar contraseña', 'Confirm password')}
                                            icon="checked-shield"
                                            name="confirm"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            placeholder={t(
                                                'Repite la contraseña',
                                                'Repeat the password',
                                            )}
                                            value={confirm}
                                            maxLength={128}
                                            onChange={(event) => setConfirm(event.target.value)}
                                            hint={
                                                confirm.length > 0 && !confirmValid
                                                    ? t(
                                                          'Las contraseñas no coinciden.',
                                                          'Passwords do not match.',
                                                      )
                                                    : undefined
                                            }
                                            hintTone="error"
                                        />
                                        <AvatarPicker value={avatarSeed} onChange={setAvatarSeed} />
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>

                            <label className="check">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(event) => setRemember(event.target.checked)}
                                />
                                <span className="check__box" aria-hidden />
                                <span className="check__text">
                                    <strong>
                                        {t('Mantener sesión iniciada', 'Stay signed in')}
                                    </strong>
                                    <span className="text-3">
                                        {t(
                                            'Solo en este dispositivo, por 30 días o hasta que cierres sesión. Tu navegador puede además guardar la contraseña.',
                                            'Only on this device, for 30 days or until you sign out. Your browser can also save the password.',
                                        )}
                                    </span>
                                </span>
                            </label>

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
                                {mode === 'login'
                                    ? t('Entrar a la batalla', 'Enter the battle')
                                    : t('Crear cuenta y jugar', 'Sign up and play')}
                            </Button>
                        </form>

                        <div className="divider">{t('o', 'or')}</div>

                        <Button
                            variant="ghost"
                            block
                            icon="hooded-figure"
                            loading={busy === 'guest'}
                            disabled={busy !== null}
                            onClick={playAsGuest}
                        >
                            {t('Jugar como invitado', 'Play as guest')}
                        </Button>
                        <p className="auth__guest-note text-3">
                            {t(
                                'Los invitados juegan partidas rápidas y la sesión dura solo en esta pestaña. Para crear salas privadas, crea una cuenta.',
                                'Guests play quick matches and the session only lasts in this tab. Create an account to open private rooms.',
                            )}
                        </p>
                    </div>
                </div>
                <AppFooter compact />
            </section>
        </div>
    );
}
