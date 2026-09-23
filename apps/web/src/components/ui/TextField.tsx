import type { IconName } from '@kardux/content';
import type { InputHTMLAttributes, JSX, ReactNode } from 'react';
import { useId } from 'react';
import { Icon } from './Icon';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    icon?: IconName;
    hint?: ReactNode;
    hintTone?: 'default' | 'error' | 'ok';
    trailing?: ReactNode;
    inputClassName?: string;
}

export function TextField({
    label,
    icon,
    hint,
    hintTone = 'default',
    trailing,
    inputClassName,
    id,
    ...inputProps
}: TextFieldProps): JSX.Element {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;

    return (
        <div className="field">
            <label className="field__label" htmlFor={inputId}>
                {label}
            </label>
            <div className="field__control">
                {icon ? <Icon name={icon} className="field__icon" /> : null}
                <input
                    id={inputId}
                    className={['input', inputClassName].filter(Boolean).join(' ')}
                    aria-describedby={hintId}
                    aria-invalid={hint && hintTone === 'error' ? true : undefined}
                    {...inputProps}
                />
                {trailing ? <span className="field__trail">{trailing}</span> : null}
            </div>
            {hint ? (
                <span
                    id={hintId}
                    className={`field__hint ${hintTone !== 'default' ? `field__hint--${hintTone}` : ''}`}
                    role={hintTone === 'error' ? 'alert' : undefined}
                >
                    {hint}
                </span>
            ) : null}
        </div>
    );
}
