import { PrismaClient } from '@prisma/client';

/**
 * Minimal dev seed: a handful of guest users with a starting leaderboard row each, so
 * `GET /leaderboard` (Phase 5) and manual testing have real rows to look at instead of an
 * empty database. Deliberately does not seed a `Match` - a match's shape (config JSONB,
 * players, rounds) is only meaningful once `MatchModule`/`MatchRuntimeService` (Phase 2b)
 * actually know how to build one from `@kardux/engine`, and faking one by hand here would
 * just be a shape nothing else agrees on.
 */
const prisma = new PrismaClient();

/** Original placeholder players. `key` keeps the historical row ids stable, so re-running the
 *  seed renames older rows in place instead of duplicating them. */
const SEED_USERS = [
    { key: 'ash-1', nickname: 'Valkar', avatarSeed: 'visored-helm:gold' },
    { key: 'misty-1', nickname: 'Nyra', avatarSeed: 'woman-elf-face:ice' },
    { key: 'brock-1', nickname: 'Tormund', avatarSeed: 'dwarf-face:ember' },
    { key: 'goku-1', nickname: 'Kaelen', avatarSeed: 'samurai-helmet:rose' },
];

async function main(): Promise<void> {
    for (const user of SEED_USERS) {
        const created = await prisma.user.upsert({
            where: { id: `seed-${user.key}` },
            update: { nickname: user.nickname, avatarSeed: user.avatarSeed },
            create: {
                id: `seed-${user.key}`,
                nickname: user.nickname,
                avatarSeed: user.avatarSeed,
            },
        });

        await prisma.leaderboardStat.upsert({
            where: { userId: created.id },
            update: {},
            create: { userId: created.id },
        });
    }

    const count = await prisma.user.count();
    console.warn(`Seed complete - ${count} user(s) in the database.`);
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        void prisma.$disconnect();
    });
