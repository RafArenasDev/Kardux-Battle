import type { LeaderboardEntry } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { getLeaderboard } from '../../lib/api';
import { attributeMeta } from '../../lib/deck-meta';
import { formatNumber } from '../../lib/format';
import { useLocale } from '../../lib/i18n';

const MEDALS = ['gold', 'silver', 'bronze'] as const;
const REFRESH_MS = 20_000;

function winRate(entry: LeaderboardEntry): number {
    return entry.gamesPlayed === 0 ? 0 : (entry.wins / entry.gamesPlayed) * 100;
}

/**
 * The global ranking: every registered account that finished a ranked match, ordered by
 * points (a multiplayer Elo rating). The "?" toggle explains, in plain words, how points move.
 */
export function Leaderboard({ meId }: { meId: string | null }): JSX.Element {
    const { t } = useTranslation();
    const { l } = useLocale();
    const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
    const [explain, setExplain] = useState(false);

    // Always current: refreshed on a timer and whenever the player comes back to the tab.
    useEffect(() => {
        let cancelled = false;
        const load = (): void => {
            getLeaderboard(25)
                .then((page) => !cancelled && setEntries(page.entries))
                .catch(() => !cancelled && setEntries((current) => current ?? []));
        };
        load();
        const timer = window.setInterval(load, REFRESH_MS);
        const onVisible = (): void => {
            if (document.visibilityState === 'visible') load();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    return (
        <div className="panel panel--pad stack home__panel leaderboard">
            <div className="row row--between">
                <h3>{t('ranking.title')}</h3>
                <Button
                    size="sm"
                    variant="ghost"
                    icon="info"
                    aria-expanded={explain}
                    onClick={() => setExplain((value) => !value)}
                >
                    {t('ranking.howItWorks')}
                </Button>
            </div>

            <AnimatePresence initial={false}>
                {explain ? (
                    <motion.div
                        key="explain"
                        className="leaderboard__explain"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                    >
                        <ul>
                            <li>{t('ranking.explain.start')}</li>
                            <li>{t('ranking.explain.placement')}</li>
                            <li>{t('ranking.explain.rivals')}</li>
                            <li>{t('ranking.explain.leave')}</li>
                            <li>{t('ranking.explain.unranked')}</li>
                        </ul>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {entries === null ? (
                <div className="empty-state">
                    <span className="spinner" />
                </div>
            ) : entries.length === 0 ? (
                <div className="empty-state">
                    <Icon name="podium-winner" />
                    <p>{t('ranking.empty')}</p>
                </div>
            ) : (
                <ol className="ranking home__scroll">
                    {entries.map((entry, index) => {
                        const favorite = entry.favoriteAttribute
                            ? l(attributeMeta('pokeapi', entry.favoriteAttribute).label)
                            : null;
                        return (
                            <li
                                key={entry.userId}
                                className={`ranking__row ${entry.userId === meId ? 'is-you' : ''}`}
                            >
                                <span className="ranking__rank">
                                    {index < 3 ? (
                                        <span
                                            className={`trophy trophy--${MEDALS[index]}`}
                                            title={t(`ranking.medal.${MEDALS[index]!}`)}
                                        >
                                            <Icon name="trophy-cup" />
                                            <span className="sr-only">{index + 1}</span>
                                        </span>
                                    ) : (
                                        index + 1
                                    )}
                                </span>
                                <img
                                    className="ranking__avatar"
                                    src={entry.avatarUrl}
                                    alt=""
                                    width={36}
                                    height={36}
                                />
                                <span className="ranking__who" title={entry.nickname}>
                                    <strong>{entry.nickname}</strong>
                                    <span className="text-3">
                                        {t('ranking.games', { count: entry.gamesPlayed })}
                                        {favorite
                                            ? ` · ${t('ranking.favorite', { attribute: favorite })}`
                                            : ''}
                                    </span>
                                </span>
                                <span className="ranking__points">
                                    <b className="tabular">{formatNumber(entry.elo)}</b>
                                    <span>{t('ranking.points')}</span>
                                </span>
                                <span className="ranking__stats">
                                    <span title={t('ranking.recordHint')}>
                                        <span className="ranking__label">
                                            {t('ranking.record')}
                                        </span>
                                        <b className="tabular">
                                            {entry.wins}-{entry.draws}-{entry.losses}
                                        </b>
                                    </span>
                                    <span>
                                        <span className="ranking__label">
                                            {t('ranking.winRate')}
                                        </span>
                                        <b className="tabular">{formatNumber(winRate(entry))}%</b>
                                    </span>
                                    <span>
                                        <span className="ranking__label">
                                            {t('ranking.streak')}
                                        </span>
                                        <b className="tabular ranking__streak">
                                            {entry.streak > 0 ? (
                                                <>
                                                    <Icon name="flame" /> {entry.streak}
                                                </>
                                            ) : (
                                                '-'
                                            )}
                                        </b>
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
