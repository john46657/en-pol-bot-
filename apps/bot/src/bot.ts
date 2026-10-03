import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type GuildMember,
} from 'discord.js';
import { DMPhase, SubmissionStatus } from '@nexus/types';
import { guildRepository, prisma, userRepository } from '@nexus/database';
import { config } from './config.js';
import { log } from './logger.js';
import { connectRedis } from './utils/lock.js';
import { handleInteraction } from './interactions/handlers.js';
import { presentCurrent } from './applications/dm-flow.js';
import { handleDMMessage } from './events/dm-answer.js';
import { handleMemberRemove } from './events/guild-events.js';
import { handleAutocomplete, handleCommand, registerCommands } from './commands.js';
import { syncAllGuilds, syncGuild } from './guilds.js';
import './panels/panel-handlers.js';
import { scheduleSync, syncAllGuildResources, syncGuildResources } from './sync/discord-sync.js';

/**
 * NEXUS Discord Bot.
 *
 * Intents: Members (Join/Leave; privilegiert → im Developer Portal unter Bot → „Server Members Intent“ aktivieren)
 * und DMs. Message Content wird NICHT gebraucht: Inhalte von Direktnachrichten sind davon ausgenommen.
 */
export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    log.info(
      { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
      'NEXUS Bot bereit.',
    );
    await syncAllGuilds(readyClient);
    await syncAllGuildResources(readyClient);
    await registerCommands(readyClient);
    await recoverActiveApplications(readyClient);
  });

  client.on(
    Events.GuildCreate,
    (guild) =>
      void syncGuild(guild).catch((e) =>
        log.error({ err: String(e) }, 'Guild-Sync fehlgeschlagen.'),
      ),
  );
  client.on(
    Events.GuildUpdate,
    (_old, guild) =>
      void syncGuild(guild).catch((e) =>
        log.error({ err: String(e) }, 'Guild-Sync fehlgeschlagen.'),
      ),
  );
  client.on(Events.GuildDelete, (guild) => {
    // `available === false` = Discord-Ausfall, nicht Verlassen.
    if (!guild.available) return;
    guildRepository
      .markLeft(guild.id)
      .then(() => log.info({ guildId: guild.id }, 'Bot hat den Server verlassen.'))
      .catch((e) => log.error({ err: String(e) }, 'Verlassen-Markierung fehlgeschlagen.'));
  });
  client.on(Events.InteractionCreate, (interaction) => {
    const run = async (): Promise<void> => {
      if (interaction.isChatInputCommand()) await handleCommand(interaction);
      else if (interaction.isAutocomplete()) await handleAutocomplete(interaction);
      else await handleInteraction(client, interaction);
    };
    run().catch((error) => {
      log.error({ err: String(error) }, 'Interaction fehlgeschlagen.');
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        void interaction
          .reply({ content: '⚠️ Es ist ein Fehler aufgetreten.', flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      }
    });
  });
  client.on(Events.MessageCreate, (message) => handleDMMessage(client, message));
  client.on(Events.GuildMemberRemove, (member) => handleMemberRemove(member as GuildMember));
  client.on(Events.Warn, (message) => log.warn({ message }, 'Client-Warnung.'));
  client.on(Events.ShardDisconnect, (_e, id) => log.warn({ shard: id }, 'Shard getrennt.'));
  client.on(Events.ShardReconnecting, (id) => log.info({ shard: id }, 'Shard verbindet neu.'));
  client.on(Events.Error, (error) => log.error({ err: String(error) }, 'Client-Fehler.'));

  return client;
}

/**
 * Bot Restart Recovery (§94): Aktive DM-Bewerbungen wiederherstellen.
 *
 * NEXUS darf keine aktive Bewerbung verlieren. Der Zustand liegt in
 * application_dm_states; beim Start werden die Sessions reaktiviert und
 * dem Bewerber mitgeteilt, dass es weitergeht.
 */
export async function recoverActiveApplications(client: Client): Promise<void> {
  const activeStates = await prisma.applicationDMState.findMany({
    where: {
      phase: { in: [DMPhase.INTRO, DMPhase.QUESTION, DMPhase.SUMMARY, DMPhase.EDITING] },
    },
    include: { submission: true },
  });

  let recovered = 0;
  for (const state of activeStates) {
    const submission = state.submission;
    if (!submission) continue;
    // Pausierte Bewerbungen bleiben ruhig – der Bewerber setzt sie selbst fort.
    const stillActive: SubmissionStatus[] = [
      SubmissionStatus.STARTED,
      SubmissionStatus.IN_PROGRESS,
    ];
    if (!stillActive.includes(submission.status as SubmissionStatus)) continue;
    // Noch nicht gestartet (nur Intro verschickt): nichts zu retten.
    if (state.phase === DMPhase.INTRO && !state.currentQuestionId) continue;

    try {
      const dm = await client.users.createDM(state.userId);
      await dm
        .send(
          '▶️ Der Bot wurde neu gestartet – deine Bewerbung geht genau dort weiter, wo du aufgehört hast. Deine bisherigen Antworten sind gespeichert.',
        )
        .catch(() => undefined);
      await presentCurrent(dm as never, submission.id);
      recovered++;
    } catch (error) {
      log.warn({ userId: state.userId, err: String(error) }, 'Recovery: DM nicht zustellbar.');
    }
  }

  if (recovered > 0) {
    log.info({ recovered }, 'Aktive Bewerbungen nach Restart wiederhergestellt (§94).');
  }
}

export async function startBot(): Promise<void> {
  try {
    await connectRedis();
  } catch (error) {
    throw new Error(
      `Redis nicht erreichbar unter ${config.redis.url} (${String(error)}). Läuft Redis? (REDIS_URL prüfen)`,
    );
  }
  try {
    await prisma.$connect();
    await prisma.guild.count(); // schlägt fehl, wenn das Schema noch nicht angelegt wurde
  } catch (error) {
    throw new Error(
      `Datenbank nicht bereit (${String(error).split('\n')[0]}). DATABASE_URL prüfen und einmal "pnpm --filter @nexus/database prisma:push" ausführen.`,
    );
  }
  const client = createClient();
  try {
    await client.login(config.discord.token);
  } catch (error) {
    const hint = /disallowed intents/i.test(String(error))
      ? ' → Im Developer Portal (Bot) „Server Members Intent“ aktivieren.'
      : /invalid token|TokenInvalid/i.test(String(error))
        ? ' → DISCORD_TOKEN ist ungültig.'
        : '';
    throw new Error(`Discord-Login fehlgeschlagen: ${String(error)}${hint}`);
  }
}
