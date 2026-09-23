import { motion } from 'framer-motion';
import type { IconName } from '@kardux/content';
import type { JSX } from 'react';
import { Icon } from './Icon';
import { useId } from 'react';

interface SegmentedProps<T extends string | number> {
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
    label: string;
}

/** Pill segmented control; the gold thumb glides between options (shared layout spring). */
export function Segmented<T extends string | number>({
    value,
    options,
    onChange,
    label,
}: SegmentedProps<T>): JSX.Element {
    const layoutId = useId();

    return (
        <div className="segmented" role="group" aria-label={label}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        className="segmented__item"
                        aria-pressed={selected}
                        onClick={() => onChange(option.value)}
                    >
                        {selected ? (
                            <motion.span
                                layoutId={layoutId}
                                className="segmented__thumb"
                                transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                            />
                        ) : null}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

interface StepperProps {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    label: string;
    format?: (value: number) => string;
}

export function Stepper({ value, min, max, onChange, label, format }: StepperProps): JSX.Element {
    return (
        <div className="stepper" role="group" aria-label={label}>
            <button
                type="button"
                className="btn btn--icon"
                aria-label={`Menos ${label}`}
                disabled={value <= min}
                onClick={() => onChange(Math.max(min, value - 1))}
            >
                −
            </button>
            <output className="stepper__value tabular" aria-live="polite">
                {format ? format(value) : value}
            </output>
            <button
                type="button"
                className="btn btn--icon"
                aria-label={`Más ${label}`}
                disabled={value >= max}
                onClick={() => onChange(Math.min(max, value + 1))}
            >
                +
            </button>
        </div>
    );
}

interface ChoiceChipsProps<T extends string | number> {
    value: T;
    options: readonly { value: T; label: string; icon?: IconName }[];
    onChange: (value: T) => void;
    label: string;
}

/** Wrapping row of pill buttons (radio group) - for short option lists that must never
 *  scroll sideways on small screens. */
export function ChoiceChips<T extends string | number>({
    value,
    options,
    onChange,
    label,
}: ChoiceChipsProps<T>): JSX.Element {
    return (
        <div className="chips" role="radiogroup" aria-label={label}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`chip ${selected ? 'is-selected' : ''}`}
                        onClick={() => onChange(option.value)}
                        data-tip={option.label}
                    >
                        {option.icon ? <Icon name={option.icon} /> : null}
                        {option.icon ? (
                            <span className="sr-only">{option.label}</span>
                        ) : (
                            option.label
                        )}
                    </button>
                );
            })}
        </div>
    );
}
