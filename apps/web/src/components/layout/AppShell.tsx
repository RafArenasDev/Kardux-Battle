import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getUser, isGuest } from '../../lib/session';
import { disconnectGameSocket } from '../../lib/socket';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { BrandLockup } from '../brand/Brand';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { AppFooter } from './AppFooter';

interface AppShellProps {
    children: ReactNode;
    /** The game table uses the whole viewport - no footer, slimmer header. */
    immersive?: boolean;
    headerExtra?: ReactNode;
}

export function AppShell({ children, immersive = false, headerExtra }: AppShellProps): JSX.Element {
    const navigate = useNavigate();
    const breakpoint = useBreakpoint();
    const user = getUser();
    const guest = isGuest();

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
                    {user ? (
                        <div className="app-header__user">
                            <Avatar
                                seed={user.avatarSeed}
                                size={breakpoint === 'mobile' ? 34 : 40}
                            />
                            {breakpoint !== 'mobile' ? (
                                <div className="app-header__who">
                                    <strong>{user.nickname}</strong>
                                    <span className="text-3">{guest ? 'Invitado' : 'Jugador'}</span>
                                </div>
                            ) : null}
                            <Button
                                variant="ghost"
                                size="sm"
                                icon="exit-door"
                                onClick={logout}
                                aria-label="Cerrar sesión"
                                title="Cerrar sesión"
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
