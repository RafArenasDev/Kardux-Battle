import type { IconName } from '@kardux/content';
import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { clearSession, getUser, isGuest } from '../../lib/session';
import { disconnectGameSocket } from '../../lib/socket';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { BrandLockup } from '../brand/Brand';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { LanguageSwitch } from '../ui/LanguageSwitch';
import { AppFooter } from './AppFooter';

interface AppShellProps {
    children: ReactNode;
    /** The game table uses the whole viewport - no footer, slimmer header. */
    immersive?: boolean;
    headerExtra?: ReactNode;
    /** Swaps the account button for something else entirely (icon, label, action) - an active
     *  match uses this to turn it into "abandonar" instead of "cerrar sesión", since signing out
     *  of the account mid-game was never really the action in that spot anyone wanted, and a
     *  second, separate "leave" button elsewhere on the table just read as a duplicate control. */
    accountAction?: { icon: IconName; label: string; onClick: () => void };
}

export function AppShell({
    children,
    immersive = false,
    headerExtra,
    accountAction,
}: AppShellProps): JSX.Element {
    const navigate = useNavigate();
    const breakpoint = useBreakpoint();
    const user = getUser();
    const guest = isGuest();
    const { t } = useTranslation();

    function logout(): void {
        disconnectGameSocket();
        clearSession();
        navigate('/', { replace: true });
    }

    return (
        <div className={`shell ${immersive ? 'shell--immersive' : ''}`}>
            <header className="app-header">
                <div className="app-header__inner">
                    <BrandLockup to="/home" />
                    {headerExtra ? <div className="app-header__extra">{headerExtra}</div> : null}
                    <LanguageSwitch className="app-header__lang" />
                    {user ? (
                        <div className="app-header__user">
                            <Avatar
                                seed={user.avatarSeed}
                                size={breakpoint === 'mobile' ? 34 : 40}
                            />
                            {breakpoint !== 'mobile' ? (
                                <div className="app-header__who">
                                    <strong>{user.nickname}</strong>
                                    <span className="text-3">
                                        {guest ? t('common.guest') : t('common.player')}
                                    </span>
                                </div>
                            ) : null}
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={accountAction?.icon ?? 'exit-door'}
                                onClick={accountAction?.onClick ?? logout}
                                aria-label={accountAction?.label ?? t('common.signOut')}
                                data-tip={accountAction?.label ?? t('common.signOut')}
                                data-tip-pos="bottom"
                            />
                        </div>
                    ) : null}
                </div>
            </header>
            <main className="shell__main">{children}</main>
            {immersive ? null : <AppFooter />}
        </div>
    );
}
