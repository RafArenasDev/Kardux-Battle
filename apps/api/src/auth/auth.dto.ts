import {
    checkUsernameQuerySchema,
    checkUsernameResponseSchema,
    guestAuthRequestSchema,
    guestAuthResponseSchema,
    loginRequestSchema,
    registerRequestSchema,
} from '@kardux/contracts';
import { createZodDto } from 'nestjs-zod';

/** `nestjs-zod`'s `createZodDto` turns a Zod schema into both a runtime validation target
 *  (for the global `ZodValidationPipe`) and a class Swagger can introspect - the OpenAPI
 *  schema comes from the same `@kardux/contracts` definition used to validate the request,
 *  never a hand-duplicated `@ApiProperty()` class (ADR 0002/0005). */
export class GuestAuthRequestDto extends createZodDto(guestAuthRequestSchema) {}

export class GuestAuthResponseDto extends createZodDto(guestAuthResponseSchema) {}

export class RegisterRequestDto extends createZodDto(registerRequestSchema) {}

export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

export class CheckUsernameQueryDto extends createZodDto(checkUsernameQuerySchema) {}

export class CheckUsernameResponseDto extends createZodDto(checkUsernameResponseSchema) {}
