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
    @ApiOperation({ summary: 'Create a guest identity' })
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
    @ApiOperation({ summary: 'Register a new account' })
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
    @ApiOperation({ summary: 'Check whether a username is available' })
    @ApiQuery({ name: 'username', required: true, type: String })
    @ApiOkResponse({ type: CheckUsernameResponseDto })
    async checkUsername(@Query() query: CheckUsernameQueryDto): Promise<CheckUsernameResponseDto> {
        return this.authService.checkUsername(query.username);
    }

    // Brute-force / account-farming guard, on top of the global rate limit.
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @Post('login')
    @ApiOperation({ summary: 'Sign into a previously registered identity' })
    @ApiBody({
        type: LoginRequestDto,
        examples: {
            account: {
                summary: 'Your account',
                value: {
                    username: 'your_username',
                    password: 'your-password',
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
    @ApiOperation({ summary: 'Resume a remembered session' })
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
