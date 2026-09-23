import type { IconName } from '@kardux/content';
import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { Icon } from './Icon';

type Variant = 'gold' | 'emerald' | 'ruby' | 'dark' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    block?: boolean;
    icon?: IconName;
    loading?: boolean;
    children?: ReactNode;
}

export function Button({
    variant = 'dark',
    size = 'md',
    block = false,
    icon,
    loading = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
}: ButtonProps): JSX.Element {
    const classes = [
        'btn',
        variant !== 'dark' && `btn--${variant}`,
        size !== 'md' && `btn--${size}`,
        block && 'btn--block',
        !children && 'btn--icon',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <button type={type} className={classes} disabled={disabled || loading} {...rest}>
            {loading ? (
                <span className="spinner" style={{ ['--size' as string]: '18px' }} />
            ) : icon ? (
                <Icon name={icon} className="btn__icon" />
            ) : null}
            {children}
        </button>
    );
}
