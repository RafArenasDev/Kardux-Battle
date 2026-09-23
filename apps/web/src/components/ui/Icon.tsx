import type { IconName } from '@kardux/content';
import { ICON_PATHS, ICON_VIEWBOX } from '@kardux/content';
import type { CSSProperties, JSX } from 'react';

interface IconProps {
    name: IconName;
    size?: number | string;
    className?: string;
    style?: CSSProperties;
    title?: string;
}

/** game-icons.net glyph (CC BY 3.0) rendered inline, colored with `currentColor`. */
export function Icon({ name, size = '1em', className, style, title }: IconProps): JSX.Element {
    return (
        <svg
            viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
            width={size}
            height={size}
            className={className}
            style={style}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            focusable="false"
        >
            {title ? <title>{title}</title> : null}
            <path fill="currentColor" d={ICON_PATHS[name]} />
        </svg>
    );
}
