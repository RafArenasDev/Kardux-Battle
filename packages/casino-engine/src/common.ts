/** Stake levels shared by every casino game: the table's minimum and maximum bet. */
export const TABLE_TIERS = {
    bronze: {
        minBet: 10,
        maxBet: 500,
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 200,
        maxBuyIn: 1_000,
    },
    silver: {
        minBet: 50,
        maxBet: 2_500,
        smallBlind: 25,
        bigBlind: 50,
        minBuyIn: 1_000,
        maxBuyIn: 5_000,
    },
    gold: {
        minBet: 250,
        maxBet: 10_000,
        smallBlind: 100,
        bigBlind: 200,
        minBuyIn: 4_000,
        maxBuyIn: 20_000,
    },
} as const;

export type TableTier = keyof typeof TABLE_TIERS;

export const TABLE_TIER_IDS = Object.keys(TABLE_TIERS) as TableTier[];

/** Chips every new player starts with (virtual, no real-money value). */
export const STARTING_COINS = 5_000;

/** Players below this balance can claim a free refill (once a day). */
export const REFILL_THRESHOLD = 200;
export const REFILL_AMOUNT = 2_000;

export type CasinoError =
    | 'TABLE_FULL'
    | 'NOT_SEATED'
    | 'NOT_NOW'
    | 'NOT_YOUR_TURN'
    | 'NOT_ALLOWED'
    | 'INVALID_BET'
    | 'NOT_ENOUGH_CHIPS';
