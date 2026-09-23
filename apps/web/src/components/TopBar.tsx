import { motion } from 'framer-motion';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearSession, getUser, isAuthenticated, isGuest } from '../lib/session';
import { disconnectGameSocket } from '../lib/socket';

export default function TopBar(): JSX.Element {
    const navigate = useNavigate();
    const authed = isAuthenticated();
    const user = authed ? getUser() : null;

    function handleLogout(): void {
        disconnectGameSocket();
        clearSession();
        navigate('/', { replace: true });
    }

    return (
        <div className="top-bar">
            <Link to={authed ? '/lobby' : '/'} className="top-bar-brand">
                <img src="/logo.png" alt="" className="top-bar-logo" />
                <span className="brand-title">Kardux Battle</span>
            </Link>

            {authed && user && (
                <div className="row">
                    <motion.div className="row" layout style={{ gap: '0.6rem' }}>
                        <img className="avatar" src={user.avatarUrl} alt="" />
                        <span>
                            {user.nickname}
                            {isGuest() && <span className="muted"> · invitado</span>}
                        </span>
                    </motion.div>
                    <button className="ghost" onClick={handleLogout}>
                        Salir
                    </button>
                </div>
            )}
        </div>
    );
}
