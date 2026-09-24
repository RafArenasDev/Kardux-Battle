import { AVATAR_COLORS, AVATAR_ICONS, buildAvatarSeed, resolveAvatar } from '@kardux/content';
import { motion } from 'framer-motion';
import type { JSX } from 'react';
import { Avatar } from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/i18n';

interface AvatarPickerProps {
    value: string;
    onChange: (seed: string) => void;
}

/** Pick a character and a color - the player decides how they're represented. */
export function AvatarPicker({ value, onChange }: AvatarPickerProps): JSX.Element {
    const { icon, color } = resolveAvatar(value);
    const { t } = useTranslation();
    const { l } = useLocale();

    return (
        <fieldset className="avatar-picker">
            <legend className="field__label">{t('auth.avatar')}</legend>

            <div className="avatar-picker__preview">
                <motion.div
                    key={value}
                    initial={{ scale: 0.85, rotate: -6 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', bounce: 0.35, duration: 0.45 }}
                >
                    <Avatar seed={value} size={76} label={l(icon.label)} />
                </motion.div>
                <div className="avatar-picker__name">
                    <strong>{l(icon.label)}</strong>
                    <span className="text-3">{l(color.label)}</span>
                </div>
            </div>

            <div
                className="avatar-picker__colors"
                role="radiogroup"
                aria-label={t('auth.avatarColor')}
            >
                {AVATAR_COLORS.map((option) => {
                    const selected = option.id === color.id;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={l(option.label)}
                            data-tip={l(option.label)}
                            className={`avatar-picker__color ${selected ? 'is-selected' : ''}`}
                            style={{
                                background: `linear-gradient(135deg, ${option.palette.from}, ${option.palette.to})`,
                            }}
                            onClick={() => onChange(buildAvatarSeed(icon.id, option.id))}
                        />
                    );
                })}
            </div>
            <div
                className="avatar-picker__icons"
                role="radiogroup"
                aria-label={t('auth.avatarCharacter')}
            >
                {AVATAR_ICONS.map((option) => {
                    const selected = option.id === icon.id;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={l(option.label)}
                            data-tip={l(option.label)}
                            className={`avatar-picker__icon ${selected ? 'is-selected' : ''}`}
                            onClick={() => onChange(buildAvatarSeed(option.id, color.id))}
                        >
                            <Icon name={option.id} />
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}
