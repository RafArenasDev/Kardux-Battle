import { AnimatePresence } from 'framer-motion';
import type { JSX } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageTransition from './components/PageTransition';
import TopBar from './components/TopBar';
import { isAuthenticated } from './lib/session';
import AuthPage from './routes/AuthPage';
import CreateMatchPage from './routes/CreateMatchPage';
import JoinByCodePage from './routes/JoinByCodePage';
import LobbyPage from './routes/LobbyPage';
import MatchRoomPage from './routes/MatchRoomPage';

function Protected({ children }: { children: JSX.Element }): JSX.Element {
    if (!isAuthenticated()) return <Navigate to="/" replace />;
    return children;
}

export default function App(): JSX.Element {
    const location = useLocation();

    return (
        <>
            <TopBar />
            <AnimatePresence mode="wait" initial={false}>
                <Routes location={location} key={location.pathname}>
                    <Route
                        path="/"
                        element={
                            <PageTransition>
                                <AuthPage />
                            </PageTransition>
                        }
                    />
                    <Route
                        path="/lobby"
                        element={
                            <Protected>
                                <PageTransition>
                                    <LobbyPage />
                                </PageTransition>
                            </Protected>
                        }
                    />
                    <Route
                        path="/create"
                        element={
                            <Protected>
                                <PageTransition>
                                    <CreateMatchPage />
                                </PageTransition>
                            </Protected>
                        }
                    />
                    {/* Not wrapped in `Protected`: a shared join link should work for a visitor
                        who hasn't authenticated yet - `JoinByCodePage` itself stashes the code
                        and redirects through `AuthPage` when there's no session. */}
                    <Route
                        path="/join/:code"
                        element={
                            <PageTransition>
                                <JoinByCodePage />
                            </PageTransition>
                        }
                    />
                    <Route
                        path="/match/:matchId"
                        element={
                            <Protected>
                                <PageTransition>
                                    <MatchRoomPage />
                                </PageTransition>
                            </Protected>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AnimatePresence>
        </>
    );
}
