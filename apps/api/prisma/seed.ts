import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Resets the game data and creates the demo accounts used to try Kardux on several tabs or
 * devices at once. Everything player-related is wiped first (matches cascade their rounds,
 * events and deck snapshots); the synced card pools are kept.
 *
 *   pnpm --filter @kardux/api db:seed
 *
 * Passwords follow the `<Name>-123*` pattern and are hashed with bcrypt like any sign-up.
 */
const prisma = new PrismaClient();

const DEMO_PLAYERS = [
    { username: 'RafArenas', password: 'Rafa-123*', avatarSeed: 'visored-helm:gold' },
    { username: 'ShadowKnight', password: 'Shadow-123*', avatarSeed: 'black-knight-helm:night' },
    { username: 'IronFox', password: 'Iron-123*', avatarSeed: 'fox-head:ember' },
    { username: 'LunaStrike', password: 'Luna-123*', avatarSeed: 'woman-elf-face:amethyst' },
    { username: 'BlazeHunter', password: 'Blaze-123*', avatarSeed: 'viking-helmet:rose' },
    { username: 'StormRider', password: 'Storm-123*', avatarSeed: 'samurai-helmet:ice' },
    { username: 'NovaQueen', password: 'Nova-123*', avatarSeed: 'witch-face:jade' },
] as const;

async function main(): Promise<void> {
    await prisma.$transaction([
        prisma.match.deleteMany(),
        prisma.leaderboardStat.deleteMany(),
        prisma.player.deleteMany(),
    ]);

    for (const demo of DEMO_PLAYERS) {
        const player = await prisma.player.create({
            data: {
                username: demo.username,
                nickname: demo.username,
                avatarSeed: demo.avatarSeed,
                passwordHash: await bcrypt.hash(demo.password, 10),
            },
        });
        await prisma.leaderboardStat.create({ data: { userId: player.id } });
    }

    console.warn(`Seed complete - ${DEMO_PLAYERS.length} demo players ready.`);
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
