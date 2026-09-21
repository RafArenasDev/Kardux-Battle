import { deckSourceListSchema } from '@kardux/contracts';
import { createZodDto } from 'nestjs-zod';

export class DeckSourceListDto extends createZodDto(deckSourceListSchema) {}
