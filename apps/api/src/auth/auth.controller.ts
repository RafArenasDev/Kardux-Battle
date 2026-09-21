import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthService } from './auth.service.js';
import { GuestAuthRequestDto, GuestAuthResponseDto } from './auth.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('guest')
    @ApiOperation({
        summary: 'Create a guest identity',
        description:
            'Issues a guest JWT for a brand-new player - no account, no password, no email. ' +
            "Call this once per browser tab, right when the tab loads (CLAUDE.md's multi-tab " +
            'session rules): the resulting `token` and the `tabId` you sent must both be kept in ' +
            '`sessionStorage` (never `localStorage` - a duplicated tab must get its own identity, ' +
            'not inherit this one). Reuse the same token for every `POST` request and for the ' +
            'Socket.IO handshake (`auth: { token, tabId }`) from that tab. The token expires after ' +
            '`JWT_GUEST_TTL` (12h by default) - after that, call this endpoint again to get a new one.',
    })
    @ApiBody({
        type: GuestAuthRequestDto,
        description:
            'nickname (shown to others), avatarSeed (any string, used to derive the avatar), and tabId (a client-generated UUID, one per browser tab).',
    })
    @ApiCreatedResponse({
        description: 'The guest was created; `token` is ready to use immediately.',
        type: GuestAuthResponseDto,
    })
    async createGuest(@Body() body: GuestAuthRequestDto): Promise<GuestAuthResponseDto> {
        return this.authService.createGuest(body);
    }
}
