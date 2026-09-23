import { avatarImage } from '@kardux/content';
import type { JSX } from 'react';

interface AvatarProps {
    seed: string;
    size?: number;
    active?: boolean;
    label?: string;
    className?: string;
}

export function Avatar({
    seed,
    size = 44,
    active = false,
    label,
    className,
}: AvatarProps): JSX.Element {
    return (
        <span
            className={['avatar', active && 'avatar--active', className].filter(Boolean).join(' ')}
            style={{ ['--size' as string]: `${size}px` }}
        >
            <img src={avatarImage(seed)} alt={label ?? ''} draggable={false} />
        </span>
    );
}
