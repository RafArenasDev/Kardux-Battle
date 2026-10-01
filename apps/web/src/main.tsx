import '@fontsource/lilita-one/400.css';
import '@fontsource-variable/nunito';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/cards.css';
import './styles/game.css';
import './i18n';
import './lib/install';

import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found.');

// Installable PWA (also on localhost in dev, so installing can be tested before deploying):
// offline app shell, silently updated in the background. `workbox-window`'s own update check
// only fires once, at this registration call - a tab/installed app left open across a deploy
// (or resumed from the OS task switcher, which on Android often doesn't count as a fresh
// top-level navigation) would otherwise keep running the service worker it started with
// forever, no matter how long the new one has been live on the server. Re-running the check
// periodically and whenever the app regains focus closes that gap; `registerType: 'autoUpdate'`
// already reloads the page automatically once a newer worker activates.
registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
        if (!registration) return;
        window.setInterval(() => void registration.update(), 60_000);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void registration.update();
        });
    },
});

createRoot(container).render(
    <StrictMode>
        <MotionConfig reducedMotion="never">
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ErrorBoundary>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </ErrorBoundary>
            </BrowserRouter>
        </MotionConfig>
    </StrictMode>,
);

// The app is on screen: fade the startup splash out (index.html) and drop it.
requestAnimationFrame(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    window.setTimeout(() => {
        splash.classList.add('is-done');
        window.setTimeout(() => splash.remove(), 500);
    }, 350);
});
