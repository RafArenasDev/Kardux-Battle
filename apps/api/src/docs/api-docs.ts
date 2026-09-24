import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

type Lang = 'es' | 'en';
interface Text {
    es: string;
    en: string;
}

/** Friendly section names; the key is the tag used in the controllers. */
const TAGS: Record<string, { name: Text; description: Text }> = {
    auth: {
        name: { es: 'Cuentas y acceso', en: 'Accounts and sign-in' },
        description: {
            es: 'Entrar como invitado, crear cuenta, iniciar sesión y mantener la sesión.',
            en: 'Play as a guest, sign up, sign in and stay signed in.',
        },
    },
    matches: {
        name: { es: 'Partidas', en: 'Matches' },
        description: {
            es: 'Crear, buscar y borrar salas. El juego en vivo va por Socket.IO, no por aquí.',
            en: 'Create, find and delete rooms. Live play runs over Socket.IO, not here.',
        },
    },
    decks: {
        name: { es: 'Mazos', en: 'Decks' },
        description: {
            es: 'Los mazos disponibles y sus atributos.',
            en: 'The available decks and their attributes.',
        },
    },
    casino: {
        name: { es: 'Casino', en: 'Casino' },
        description: {
            es: 'Fichas virtuales para blackjack y póker (sin dinero real).',
            en: 'Virtual chips for blackjack and poker (no real money).',
        },
    },
    leaderboard: {
        name: { es: 'Clasificación', en: 'Leaderboard' },
        description: {
            es: 'El ranking global de jugadores.',
            en: 'The global player ranking.',
        },
    },
    health: {
        name: { es: 'Estado del servidor', en: 'Server status' },
        description: {
            es: 'Para saber si la API está encendida.',
            en: 'To check that the API is up.',
        },
    },
};

/** Summary and explanation of every endpoint, keyed by Nest's operationId. */
const OPERATIONS: Record<string, { summary: Text; description: Text }> = {
    HealthController_check: {
        summary: { es: '¿Está encendida la API?', en: 'Is the API up?' },
        description: {
            es: 'Responde 200 si el servidor está funcionando. No necesita sesión.',
            en: 'Answers 200 when the server is running. No sign-in needed.',
        },
    },
    AuthController_createGuest: {
        summary: { es: 'Entrar como invitado', en: 'Play as a guest' },
        description: {
            es: 'Crea un jugador anónimo con nombre y avatar al azar y devuelve su token. Los invitados pueden jugar partidas rápidas, pero no crear salas privadas. El token dura 12 horas y solo sirve en la pestaña que lo pidió.',
            en: 'Creates an anonymous player with a random name and avatar and returns its token. Guests can play quick matches but cannot open private rooms. The token lasts 12 hours and only works in the tab that asked for it.',
        },
    },
    AuthController_register: {
        summary: { es: 'Crear una cuenta', en: 'Sign up' },
        description: {
            es: 'Crea una cuenta con usuario, contraseña y avatar, y entra de una vez. Si el usuario ya existe, la respuesta trae nombres alternativos libres. Con `remember: true` también devuelve un token para mantener la sesión 30 días.',
            en: 'Creates an account with username, password and avatar, and signs in right away. If the username is taken, the answer suggests free alternatives. With `remember: true` it also returns a token to stay signed in for 30 days.',
        },
    },
    AuthController_checkUsername: {
        summary: { es: '¿Está libre este usuario?', en: 'Is this username free?' },
        description: {
            es: 'Sirve para validar el formulario mientras se escribe. Si está ocupado, sugiere alternativas.',
            en: 'Used to validate the form while typing. If it is taken, it suggests alternatives.',
        },
    },
    AuthController_login: {
        summary: { es: 'Iniciar sesión', en: 'Sign in' },
        description: {
            es: 'Entra con usuario y contraseña. Prueba con la cuenta demo del ejemplo. Con `remember: true` también devuelve un token para mantener la sesión 30 días.',
            en: 'Signs in with username and password. Try the demo account in the example. With `remember: true` it also returns a token to stay signed in for 30 days.',
        },
    },
    AuthController_resume: {
        summary: { es: 'Retomar una sesión guardada', en: 'Resume a saved session' },
        description: {
            es: 'Cambia el token de "mantener sesión" por una sesión nueva en otra pestaña o en otro día. Cada uso entrega un token de recuerdo nuevo. Solo funciona para cuentas.',
            en: 'Trades the "stay signed in" token for a new session in another tab or on another day. Every use hands back a new remember token. Accounts only.',
        },
    },
    MatchController_create: {
        summary: { es: 'Crear una sala privada', en: 'Create a private room' },
        description: {
            es: 'Crea una sala y devuelve su código de 6 caracteres para compartir. Todos los campos son opcionales. Si el mazo no alcanza para la configuración pedida, la respuesta explica por qué. Los invitados no pueden crear salas.',
            en: 'Creates a room and returns its 6-character code to share. Every field is optional. If the deck cannot cover the requested setup, the answer explains why. Guests cannot create rooms.',
        },
    },
    MatchController_listMine: {
        summary: { es: 'Mis salas', en: 'My rooms' },
        description: {
            es: 'Las salas privadas que creaste, de la más nueva a la más vieja.',
            en: 'The private rooms you created, newest first.',
        },
    },
    MatchController_active: {
        summary: { es: 'Mi partida en curso', en: 'My current match' },
        description: {
            es: 'La partida en la que estás sentado ahora, o `null` si no hay ninguna. Sirve para ofrecer "Continuar partida".',
            en: 'The match you are seated in right now, or `null` if there is none. Used to offer "Continue match".',
        },
    },
    MatchController_getByCode: {
        summary: { es: 'Buscar una sala por código', en: 'Find a room by code' },
        description: {
            es: 'Muestra una sala abierta o en juego a partir de su código, antes de unirse.',
            en: 'Shows an open or running room from its code, before joining.',
        },
    },
    MatchLifecycleController_remove: {
        summary: { es: 'Borrar o abandonar una partida', en: 'Delete or leave a match' },
        description: {
            es: 'Si eres el anfitrión, la partida se borra para todos. Si no, solo sales de ella.',
            en: 'If you are the host, the match is deleted for everyone. Otherwise you just leave it.',
        },
    },
    DeckController_listSources: {
        summary: { es: 'Mazos disponibles', en: 'Available decks' },
        description: {
            es: 'Cada mazo con sus atributos, una vista previa y cuántas cartas permite. Pokémon, países y naipes se descargan una vez al arrancar y quedan guardados.',
            en: 'Each deck with its attributes, a preview and how many cards it allows. Pokémon, countries and playing cards are downloaded once at startup and stored.',
        },
    },
    CasinoController_wallet: {
        summary: { es: 'Mis fichas', en: 'My chips' },
        description: {
            es: 'Cuántas fichas virtuales tienes y si puedes pedir una recarga.',
            en: 'How many virtual chips you have and whether you can claim a refill.',
        },
    },
    CasinoController_refill: {
        summary: { es: 'Recarga gratis', en: 'Free refill' },
        description: {
            es: 'Suma 2000 fichas si tienes menos de 200 y no estás sentado en una mesa. Una vez cada 24 horas.',
            en: 'Adds 2000 chips if you have fewer than 200 and are not seated at a table. Once every 24 hours.',
        },
    },
    LeaderboardController_getGlobal: {
        summary: { es: 'Ranking global', en: 'Global ranking' },
        description: {
            es: 'Los mejores jugadores por puntuación Elo, por páginas. Usa `nextCursor` de la respuesta para pedir la página siguiente.',
            en: 'The top players by Elo rating, page by page. Pass `nextCursor` from the answer to get the next page.',
        },
    },
};

/** Spanish for the field/response texts that come from the controllers and the shared schemas. */
const SPANISH: Record<string, string> = {
    'The API process is running.': 'La API está funcionando.',
    'Only the tab id (a UUID generated in the browser, one per tab).':
        'Solo el id de la pestaña (un UUID generado en el navegador, uno por pestaña).',
    'New guest': 'Invitado nuevo',
    'The guest was created; `token` is ready to use immediately.':
        'Invitado creado; el `token` ya se puede usar.',
    'New account that stays signed in': 'Cuenta nueva que mantiene la sesión',
    'Account created; `token` is ready to use immediately.':
        'Cuenta creada; el `token` ya se puede usar.',
    'Login name: 3-24 letters, numbers or underscore.':
        'Usuario: 3 a 24 letras, números o guion bajo.',
    'Demo account': 'Cuenta demo',
    'Signed in.': 'Sesión iniciada.',
    'Resume on a new tab': 'Retomar en una pestaña nueva',
    'Signed in again.': 'Sesión retomada.',
    'Partial MatchConfig - any field omitted uses its default.':
        'Configuración de la sala; lo que no envíes toma su valor por defecto.',
    'Opaque cursor returned as `nextCursor` by a previous call. Omit to fetch the first page.':
        'El `nextCursor` de la respuesta anterior. Déjalo vacío para la primera página.',
    'Page size, between 1 and 50. Defaults to 20.':
        'Cuántos jugadores por página (1 a 50, por defecto 20).',
    'UUID generated in the browser once per tab (crypto.randomUUID()).':
        'UUID generado en el navegador, uno por pestaña (crypto.randomUUID()).',
    'Bearer JWT for this tab (12 h by default). Send it as `Authorization: Bearer <token>` and in the Socket.IO handshake.':
        'Token de sesión de esta pestaña (dura 12 h). Envíalo como `Authorization: Bearer <token>` y al conectar el socket.',
    'Only when `remember` was requested on login/register: a 30-day token for `POST /auth/resume`, to stay signed in on this device.':
        'Solo si pediste `remember`: token de 30 días para `POST /auth/resume`, para mantener la sesión en este dispositivo.',
    'Player id.': 'Id del jugador.',
    'Public name: generated for guests, equal to the username for accounts.':
        'Nombre visible: al azar para invitados, igual al usuario en las cuentas.',
    'Avatar as "icon:color" from the avatar catalog.': 'Avatar en formato "icono:color".',
    'Ready-to-use avatar image URL.': 'URL de la imagen del avatar, lista para usar.',
    'At least 8 characters. Stored only as a bcrypt hash.':
        'Mínimo 8 caracteres. Se guarda cifrada (bcrypt), nunca en texto plano.',
    'Chosen avatar as "icon:color". A random one is assigned when omitted.':
        'Avatar elegido, "icono:color". Si no se envía, se asigna uno al azar.',
    'Keep this device signed in for 30 days (returns `rememberToken`).':
        'Mantener la sesión 30 días en este dispositivo (devuelve `rememberToken`).',
    'Whether this exact username can still be registered.': 'Si ese usuario todavía está libre.',
    '2-3 free alternatives, only when the name is taken.':
        '2 o 3 alternativas libres, solo si el nombre está ocupado.',
    'The account password.': 'La contraseña de la cuenta.',
    'The `rememberToken` from a previous sign-in.':
        'El `rememberToken` de un inicio de sesión anterior.',
    'Spanish text.': 'Texto en español.',
    'English text.': 'Texto en inglés.',
    'Stable attribute key used in `round:selectAttribute`, e.g. "attack".':
        'Clave del atributo que se envía al elegirlo en la ronda, por ejemplo "attack".',
    'Display unit, e.g. "km/h".': 'Unidad que se muestra, por ejemplo "km/h".',
    'Attribution required by the data source, if any.':
        'Créditos que pide la fuente de datos, si aplica.',
    'Single-attribute deck: the leader does not pick, cards compare automatically.':
        'Mazo de un solo atributo: nadie elige, las cartas se comparan solas.',
    'Virtual chips available (no real-money value).':
        'Fichas virtuales disponibles (sin valor en dinero).',
    'True when the balance is low enough to claim a refill.':
        'Verdadero si el saldo es tan bajo que puedes pedir recarga.',
};

const INTRO: Text = {
    es: [
        'La API del juego de cartas **Kardux Battle**.',
        '',
        '**Cómo probarla en 3 pasos:**',
        '1. En **Cuentas y acceso**, abre *Iniciar sesión*, pulsa **Try it out** y luego **Execute** (el ejemplo ya trae la cuenta demo).',
        '2. Copia el `token` de la respuesta.',
        '3. Pulsa **Authorize** arriba, pega el token y listo: ya puedes probar el resto.',
        '',
        'Las partidas en vivo (jugar cartas, chat, casino) usan Socket.IO y no aparecen en esta página.',
        '',
        'Cambia el idioma con el selector de arriba a la derecha.',
    ].join('\n'),
    en: [
        'The API of the **Kardux Battle** card game.',
        '',
        '**Try it in 3 steps:**',
        '1. Under **Accounts and sign-in**, open *Sign in*, click **Try it out** and then **Execute** (the example already has the demo account).',
        '2. Copy the `token` from the answer.',
        '3. Click **Authorize** at the top, paste the token and you are set: now try the rest.',
        '',
        'Live play (playing cards, chat, casino) uses Socket.IO and is not listed on this page.',
        '',
        'Switch the language with the selector at the top right.',
    ].join('\n'),
};

/** Replaces every summary/description with its text in `lang` (unknown texts stay as-is). */
function translateTexts(node: unknown, lang: Lang): void {
    if (Array.isArray(node)) {
        node.forEach((item) => translateTexts(item, lang));
        return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
        if ((key === 'description' || key === 'summary') && typeof value === 'string') {
            if (lang === 'es' && SPANISH[value]) record[key] = SPANISH[value];
        } else {
            translateTexts(value, lang);
        }
    }
}

/** `CreateMatchRequestDto` reads better as `CreateMatchRequest` in the schema list. */
function dropDtoSuffix(doc: OpenAPIObject): void {
    const schemas = doc.components?.schemas;
    if (!schemas) return;
    const renamed = Object.fromEntries(
        Object.entries(schemas).map(([name, schema]) => [name.replace(/Dto$/, ''), schema]),
    );
    doc.components!.schemas = renamed;
    const json = JSON.stringify(doc.paths).replace(
        /#\/components\/schemas\/(\w+?)Dto"/g,
        '#/components/schemas/$1"',
    );
    doc.paths = JSON.parse(json) as OpenAPIObject['paths'];
}

function localize(base: OpenAPIObject, lang: Lang): OpenAPIObject {
    const doc = structuredClone(base);
    doc.info.description = INTRO[lang];

    for (const operations of Object.values(doc.paths)) {
        for (const operation of Object.values(operations) as {
            operationId?: string;
            summary?: string;
            description?: string;
            tags?: string[];
        }[]) {
            const text = operation.operationId ? OPERATIONS[operation.operationId] : undefined;
            if (text) {
                operation.summary = text.summary[lang];
                operation.description = text.description[lang];
            }
            if (operation.tags) {
                operation.tags = operation.tags.map((tag) => TAGS[tag]?.name[lang] ?? tag);
            }
        }
    }
    doc.tags = Object.values(TAGS).map((tag) => ({
        name: tag.name[lang],
        description: tag.description[lang],
    }));

    translateTexts(doc.paths, lang);
    translateTexts(doc.components, lang);
    return doc;
}

/**
 * Serves the interactive docs at `/api/docs` in Spanish and English: both documents are
 * generated from the same controllers and schemas, and Swagger UI's top-right selector
 * switches between them.
 */
export function setupApiDocs(app: INestApplication): void {
    const base = cleanupOpenApiDoc(
        SwaggerModule.createDocument(
            app,
            new DocumentBuilder()
                .setTitle('Kardux Battle API')
                .setVersion('0.1.0')
                .addBearerAuth()
                .build(),
        ),
    );
    dropDtoSuffix(base);

    const documents: Record<Lang, OpenAPIObject> = {
        es: localize(base, 'es'),
        en: localize(base, 'en'),
    };

    const http = app.getHttpAdapter();
    for (const lang of ['es', 'en'] as const) {
        http.get(
            `/api/docs/${lang}.json`,
            (_request: unknown, response: { json: (body: unknown) => void }) =>
                response.json(documents[lang]),
        );
    }

    SwaggerModule.setup('api/docs', app, documents.es, {
        explorer: true,
        customSiteTitle: 'Kardux Battle API',
        swaggerOptions: {
            urls: [
                { url: '/api/docs/es.json', name: 'Español' },
                { url: '/api/docs/en.json', name: 'English' },
            ],
            'urls.primaryName': 'Español',
            persistAuthorization: true,
            displayRequestDuration: true,
            tryItOutEnabled: true,
        },
    });
}
