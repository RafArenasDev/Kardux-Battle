import type { IconName } from '@kardux/content';
import { randomAvatarSeed } from '@kardux/content';
import { AnimatePresence, motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { AuthMethod } from '../../lib/session';
import { getTabId, saveSession, takePostAuthRedirect } from '../../lib/session';
import { disconnectGameSocket } from '../../lib/socket';
import { AvatarPicker } from './AvatarPicker';

type Mode = 'login' | 'register';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

/** The landing pitch: what Kardux is, in four lines. */
const FEATURES = [
    { icon: 'crossed-swords', key: 'battle' },
    { icon: 'podium-winner', key: 'ranking' },
    { icon: 'share', key: 'friends' },
    { icon: 'lightning-helix', key: 'bot' },
] as const satisfies readonly { icon: IconName; key: string }[];

export default function AuthPage(): JSX.Element {
    useDocumentTitle('');
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const { t } = useTranslation();

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
        toast.show(t('auth.welcome', { name: auth.user.nickname }), 'success');
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
                    ? t('auth.wrongCredentials')
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
                      text: t('auth.usernameRule'),
                  }
                : availability === null
                  ? { tone: 'default' as const, text: t('auth.checking') }
                  : availability.available
                    ? { tone: 'ok' as const, text: t('auth.available') }
                    : {
                          tone: 'error' as const,
                          text: t('auth.taken', {
                              suggestions: availability.suggestions.join(', '),
                          }),
                      }
            : undefined;

    const passwordToggle = (
        <button
            type="button"
            className="field__toggle"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
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
                <p className="auth__tagline">{t('auth.tagline')}</p>
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
                                <strong>{t(`auth.features.${feature.key}.title`)}</strong>
                                <span className="text-2">
                                    {t(`auth.features.${feature.key}.text`)}
                                </span>
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
                                {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
                            </h1>
                            <p className="text-2">
                                {mode === 'login' ? t('auth.loginIntro') : t('auth.registerIntro')}
                            </p>
                        </div>

                        <Segmented
                            label={t('auth.accessType')}
                            value={mode}
                            onChange={(next) => {
                                setMode(next);
                                setFormError(null);
                            }}
                            options={[
                                { value: 'login', label: t('auth.signIn') },
                                { value: 'register', label: t('auth.signUp') },
                            ]}
                        />

                        <form className="stack" onSubmit={submit} noValidate>
                            <TextField
                                label={t('auth.username')}
                                icon="visored-helm"
                                name="username"
                                autoComplete="username"
                                autoCapitalize="off"
                                spellCheck={false}
                                maxLength={24}
                                placeholder={t('auth.usernamePlaceholder')}
                                value={username}
                                onChange={(event) => setUsername(event.target.value.trim())}
                                hint={usernameHint?.text}
                                hintTone={usernameHint?.tone}
                                required
                            />
                            <TextField
                                label={t('auth.password')}
                                icon="checked-shield"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete={
                                    mode === 'login' ? 'current-password' : 'new-password'
                                }
                                placeholder={
                                    mode === 'login'
                                        ? t('auth.passwordPlaceholder')
                                        : t('auth.passwordMin')
                                }
                                value={password}
                                maxLength={128}
                                onChange={(event) => setPassword(event.target.value)}
                                hint={
                                    mode === 'register' && password.length > 0 && !passwordValid
                                        ? t('auth.passwordMinHint')
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
                                            label={t('auth.confirm')}
                                            icon="checked-shield"
                                            name="confirm"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            placeholder={t('auth.confirmPlaceholder')}
                                            value={confirm}
                                            maxLength={128}
                                            onChange={(event) => setConfirm(event.target.value)}
                                            hint={
                                                confirm.length > 0 && !confirmValid
                                                    ? t('auth.mismatch')
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
                                    <strong>{t('auth.remember')}</strong>
                                    <span className="text-3">{t('auth.rememberHint')}</span>
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
                                    ? t('auth.loginSubmit')
                                    : t('auth.registerSubmit')}
                            </Button>
                        </form>

                        <div className="divider">{t('common.or')}</div>

                        <Button
                            variant="ghost"
                            block
                            icon="hooded-figure"
                            loading={busy === 'guest'}
                            disabled={busy !== null}
                            onClick={playAsGuest}
                        >
                            {t('auth.guest')}
                        </Button>
                        <p className="auth__guest-note text-3">{t('auth.guestNote')}</p>
                    </div>
                </div>
                <AppFooter compact />
            </section>
        </div>
    );
}
