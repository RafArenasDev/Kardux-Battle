import type { MatchFinishedPayload, RedactedMatchState } from '@kardux/contracts';
import { motion } from 'framer-motion';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../../components/brand/Brand';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

interface FinishOverlayProps {
    state: RedactedMatchState;
    finished: MatchFinishedPayload;
    onHome: () => void;
    onPlayAgain: () => void;
}

const CONFETTI_COLORS = ['#f0c96b', '#ffe3a0', '#3fd6a4', '#6fd2ff', '#ff6f91', '#c28bff'];
const PLACE_TONES = ['gold', 'silver', 'bronze'] as const;

export function FinishOverlay({
    state,
    finished,
    onHome,
    onPlayAgain,
}: FinishOverlayProps): JSX.Element {
    const { t } = useTranslation();
    const winner = finished.standings.find((player) => player.id === finished.winnerId);
    const iWon = finished.winnerId === state.yourId;
    const someoneLeft = finished.standings.some((player) => player.hasLeft);
    const iLeft = finished.standings.some((player) => player.id === state.yourId && player.hasLeft);
    const vsMachine = finished.standings.some((player) => player.id.startsWith('bot:'));

    const title = finished.isDraw
        ? t('finish.draw')
        : iWon
          ? t('finish.victory')
          : t('finish.winner', { name: winner?.nickname ?? '' });
    const subtitle = finished.isDraw
        ? t('finish.drawText')
        : iWon
          ? someoneLeft
              ? t('finish.rivalLeft')
              : t('finish.victoryText')
          : iLeft
            ? t('finish.youLeft')
            : t('finish.defeatText');

    return (
        <motion.div
            className="finish"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            {iWon ? (
                <div className="confetti" aria-hidden>
                    {Array.from({ length: 44 }, (_, index) => (
                        <motion.span
                            key={index}
                            style={{
                                left: `${(index * 37) % 100}%`,
                                background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                            }}
                            initial={{ y: '-10vh', rotate: 0, opacity: 1 }}
                            animate={{ y: '110vh', rotate: 360 + index * 20, opacity: [1, 1, 0.6] }}
                            transition={{
                                duration: 2.4 + (index % 7) * 0.25,
                                delay: (index % 11) * 0.08,
                                ease: 'easeIn',
                            }}
                        />
                    ))}
                </div>
            ) : null}

            <motion.div
                className="finish__card panel panel--pad"
                initial={{ scale: 0.85, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', bounce: 0.35, duration: 0.7 }}
            >
                <BrandLogo className="finish__logo" />
                <h1 id="finish-title" className={iWon ? 'gold' : ''}>
                    {title}
                </h1>
                <p className="text-2">{subtitle}</p>

                <ol className="finish__standings">
                    {finished.standings.map((player, index) => (
                        <motion.li
                            key={player.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + index * 0.1 }}
                            className={player.id === state.yourId ? 'is-you' : ''}
                        >
                            <span className="standings__rank">
                                {index < 3 && !player.hasLeft ? (
                                    <span className={`trophy trophy--${PLACE_TONES[index]!}`}>
                                        <Icon name="trophy-cup" />
                                        <span className="sr-only">{index + 1}</span>
                                    </span>
                                ) : (
                                    index + 1
                                )}
                            </span>
                            <Avatar seed={player.avatarSeed} size={36} />
                            <span className="standings__name">
                                {player.id === state.yourId
                                    ? t('common.youSuffix', { name: player.nickname })
                                    : player.nickname}
                                {player.hasLeft ? (
                                    <span className="badge badge--lose">
                                        {t('table.status.left')}
                                    </span>
                                ) : null}
                            </span>
                            <span className="standings__count tabular">
                                {t('common.cards', { count: player.cardCount })}
                            </span>
                        </motion.li>
                    ))}
                </ol>

                <p className="text-3 finish__note">
                    {vsMachine ? t('finish.practiceNote') : t('finish.rankingNote')}
                </p>

                <div className="finish__actions">
                    <Button variant="gold" size="lg" icon="lightning-helix" onClick={onPlayAgain}>
                        {t('finish.again')}
                    </Button>
                    <Button variant="ghost" icon="return-arrow" onClick={onHome}>
                        {t('common.backHome')}
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
}
