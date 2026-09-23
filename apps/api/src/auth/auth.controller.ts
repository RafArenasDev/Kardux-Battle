import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
    ApiBody,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthService } from './auth.service.js';
// Value import required: `CheckUsernameQueryDto` is only ever used in a parameter type
// position below, but Nest/`nestjs-zod` still need it as a value so `emitDecoratorMetadata`
// records it in `design:paramtypes` - the same reflection metadata the DI gotcha relies on.
// An `import type` here would erase that and silently fall back to unvalidated `Object`.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
    CheckUsernameQueryDto,
    CheckUsernameResponseDto,
    GuestAuthRequestDto,
    GuestAuthResponseDto,
    LoginRequestDto,
    RegisterRequestDto,
    ResumeRequestDto,
} from './auth.dto.js';

/** Any UUID works; the browser generates one per tab. */
const EXAMPLE_TAB_ID = '3f6c1f8e-5c4b-4b8e-9a51-2f0d7a1c9b42';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // Brute-force / account-farming guard, on top of the global rate limit.
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @Post('guest')
    @ApiOperation({
        summary: 'Create a guest identity',
        description:
            'Issues a fully anonymous guest JWT - no account, no password, no email, and no ' +
            'nickname/avatar to pick: both are generated server-side. Call this once per ' +
            "browser tab, right when the tab loads (docs/SPEC.md's multi-tab session rules): " +
            'the resulting `token` and the `tabId` you sent must both be kept in ' +
            '`sessionStorage` (never `localStorage` - a duplicated tab must get its own ' +
            'identity, not inherit this one). Reuse the same token for every `POST` request ' +
            'and for the Socket.IO handshake (`auth: { token, tabId }`) from that tab. The ' +
            'token expires after `JWT_GUEST_TTL` (12h by default) - after that, call this ' +
            'endpoint again to get a new (different) guest identity. A guest can join any ' +
            'match but cannot host one (`POST /matches` fails with `ERR_GUEST_CANNOT_HOST`) - ' +
            'use `POST /auth/register` for a real, independent account instead, which has no ' +
            'relationship to any guest identity you may already have.',
    })
    @ApiBody({
        type: GuestAuthRequestDto,
        description: 'Only the tab id (a UUID generated in the browser, one per tab).',
        examples: { guest: { summary: 'New guest', value: { tabId: EXAMPLE_TAB_ID } } },
    })
    @ApiCreatedResponse({
        description: 'The guest was created; `token` is ready to use immediately.',
        type: GuestAuthResponseDto,
    })
    async createGuest(@Body() body: GuestAuthRequestDto): Promise<GuestAuthResponseDto> {
        return this.authService.createGuest(body);
    }

    // Brute-force / account-farming guard, on top of the global rate limit.
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post('register')
    @ApiOperation({
        summary: 'Register a new account',
        description:
            'Public, no bearer token involved - a registered account is a completely ' +
            'separate identity from any guest session, never "upgraded" from one. Always ' +
            'creates a brand-new `Player` with its own `username`/password; `nickname` and the ' +
            'avatar both default to `username` (nothing else to send). Returns the same ' +
            '`{token, user}` shape as `POST /auth/guest` / `POST /auth/login`, ready to store ' +
            'in `sessionStorage` immediately. Fails with `ERR_VALIDATION` (400) if the ' +
            "username is already taken - the error body's `data.suggestions` carries 2-3 " +
            'available alternatives, the same ones `GET /auth/check-username` would offer.',
    })
    @ApiBody({
        type: RegisterRequestDto,
        examples: {
            register: {
                summary: 'New account that stays signed in',
                value: {
                    username: 'NewPlayer_01',
                    password: 'Player-123*',
                    tabId: EXAMPLE_TAB_ID,
                    avatarSeed: 'fox-head:ember',
                    remember: true,
                },
            },
        },
    })
    @ApiCreatedResponse({
        description: 'Account created; `token` is ready to use immediately.',
        type: GuestAuthResponseDto,
    })
    async register(@Body() body: RegisterRequestDto): Promise<GuestAuthResponseDto> {
        return this.authService.registerAccount(body);
    }

    @Get('check-username')
    @ApiOperation({
        summary: 'Check whether a username is available',
        description:
            'Public - lets a signup form validate live while the user types, before ' +
            'submitting the full `POST /auth/register` body. When taken, `suggestions` ' +
            'carries 2-3 available alternatives generated the same way `POST /auth/register` ' +
            'itself would if you submitted the taken username as-is.',
    })
    @ApiQuery({ name: 'username', required: true, type: String })
    @ApiOkResponse({ type: CheckUsernameResponseDto })
    async checkUsername(@Query() query: CheckUsernameQueryDto): Promise<CheckUsernameResponseDto> {
        return this.authService.checkUsername(query.username);
    }

    // Brute-force / account-farming guard, on top of the global rate limit.
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @Post('login')
    @ApiOperation({
        summary: 'Sign into a previously registered identity',
        description:
            'For a user who already called `POST /auth/register` before - verifies ' +
            'username/password and issues a fresh JWT for that SAME user id, restoring ' +
            'access to whatever it was already hosting/playing (e.g. `GET /matches/mine`). ' +
            'Like `POST /auth/guest`, this is a new entry point (needs its own `tabId`), not ' +
            'a continuation of an existing tab session.',
    })
    @ApiBody({
        type: LoginRequestDto,
        examples: {
            demo: {
                summary: 'Demo account',
                value: {
                    username: 'RafArenas',
                    password: 'Rafa-123*',
                    tabId: EXAMPLE_TAB_ID,
                    remember: false,
                },
            },
        },
    })
    @ApiOkResponse({ description: 'Signed in.', type: GuestAuthResponseDto })
    async login(@Body() body: LoginRequestDto): Promise<GuestAuthResponseDto> {
        return this.authService.login(body);
    }

    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @Post('resume')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Resume a remembered session',
        description:
            'For devices that signed in with `remember: true`. Exchanges the saved ' +
            '`rememberToken` for a session bound to the new tab and returns a rotated ' +
            '`rememberToken`. Accounts only; fails with `ERR_UNAUTHORIZED` once it expires ' +
            '(30 days).',
    })
    @ApiBody({
        type: ResumeRequestDto,
        examples: {
            resume: {
                summary: 'Resume on a new tab',
                value: {
                    rememberToken: '<rememberToken from login>',
                    tabId: EXAMPLE_TAB_ID,
                },
            },
        },
    })
    @ApiOkResponse({ description: 'Signed in again.', type: GuestAuthResponseDto })
    async resume(@Body() body: ResumeRequestDto): Promise<GuestAuthResponseDto> {
        return this.authService.resume(body);
    }
}
