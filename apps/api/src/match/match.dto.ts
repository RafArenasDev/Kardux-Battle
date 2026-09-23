import {
    createMatchRequestSchema,
    matchSummaryListSchema,
    matchSummarySchema,
    matchSummaryWithRoleListSchema,
} from '@kardux/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateMatchRequestDto extends createZodDto(createMatchRequestSchema) {}

export class MatchSummaryDto extends createZodDto(matchSummarySchema) {}

export class MatchSummaryListDto extends createZodDto(matchSummaryListSchema) {}

export class MatchSummaryWithRoleListDto extends createZodDto(matchSummaryWithRoleListSchema) {}
