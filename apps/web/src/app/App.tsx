import { motion } from 'framer-motion';
import type { JSX, ReactNode } from 'react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { InstallPrompt } from '../components/layout/InstallPrompt';
import { resumeRememberedSession } from '../lib/api';
import { getRememberToken, isAuthenticated } from '../lib/session';
import AuthPage from '../features/auth/AuthPage';
import HomePage from '../features/home/HomePage';

// The table and the create form are the heaviest screens - split them out of the first load.
const CreateMatchPage = lazy(() => import('../features/create/CreateMatchPage'));
const JoinPage = lazy(() => import('../features/join/JoinPage'));
const MatchPage = lazy(() => import('../features/match/MatchPage'));

function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
    const location = useLocation();
    if (!isAuthenticated()) {
        return <Navigate to="/" replace state={{ from: location.pathname }} />;
    }
    return children;
}

function RedirectIfAuthenticated({ children }: { children: JSX.Element }): JSX.Element {
    return isAuthenticated() ? <Navigate to="/home" replace /> : children;
}

/** Pages only animate in. Route changes never wait on an exit animation, so navigating away
 *  (e.g. "Volver al inicio" from the victory screen) is instant and can't get stuck. */
function Page({ children }: { children: ReactNode }): JSX.Element {
    return (
        <motion.div
            className="page"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.55 }}
        >
            {children}
        </motion.div>
    );
}

function Loading(): JSX.Element {
    const { t } = useTranslation();
    return (
        <div className="page-loading" role="status">
            <span className="spinner" style={{ ['--size' as string]: '36px' }} />
            <span className="sr-only">{t('common.loading')}</span>
        </div>
    );
}

/** A remembered device signs back in before any route decides where to send the player. */
function useRememberedSession(): boolean {
    const [ready, setReady] = useState(() => isAuthenticated() || getRememberToken() === null);
    useEffect(() => {
        if (ready) return;
        void resumeRememberedSession().finally(() => setReady(true));
    }, [ready]);
    return ready;
}

export default function App(): JSX.Element {
    const location = useLocation();
    const ready = useRememberedSession();
    if (!ready) return <Loading />;

    return (
        <Suspense fallback={<Loading />}>
            <InstallPrompt />
            <Routes location={location} key={location.pathname}>
                <Route
                    path="/"
                    element={
                        <RedirectIfAuthenticated>
                            <Page>
                                <AuthPage />
                            </Page>
                        </RedirectIfAuthenticated>
                    }
                />
                <Route
                    path="/home"
                    element={
                        <RequireAuth>
                            <Page>
                                <HomePage />
                            </Page>
                        </RequireAuth>
                    }
                />
                <Route
                    path="/create"
                    element={
                        <RequireAuth>
                            <Page>
                                <CreateMatchPage />
                            </Page>
                        </RequireAuth>
                    }
                />
                {/* Share links must work before signing in: JoinPage handles the redirect. */}
                <Route
                    path="/join/:code"
                    element={
                        <Page>
                            <JoinPage />
                        </Page>
                    }
                />
                <Route
                    path="/match/:matchId"
                    element={
                        <RequireAuth>
                            <Page>
                                <MatchPage />
                            </Page>
                        </RequireAuth>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
