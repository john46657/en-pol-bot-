import { Client, Events, GatewayIntentBits, Partials, type GuildMember } from 'discord.js';
import { DMPhase, SubmissionStatus } from '@nexus/types';
import { prisma } from '@nexus/database';
import { config } from './config.js';
import { log } from './logger.js';
import { connectRedis } from './utils/lock.js';
import { handleInteraction } from './interactions/handlers.js';
import { handleDMMessage } from './events/dm-answer.js';
import { handleMemberRemove } from './events/guild-events.js';

/**
 * NEXUS Discord Bot.
 *
 * Intents: Members (Join/Leave), Message Content (DM-Antworten), DMs.
 */
export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
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
    await recoverActiveApplications(readyClient);
  });

  client.on(Events.InteractionCreate, (interaction) => handleInteraction(client, interaction));
  client.on(Events.MessageCreate, (message) => handleDMMessage(client, message));
  client.on(Events.GuildMemberRemove, (member) => handleMemberRemove(member as GuildMember));
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
    const stillActive: SubmissionStatus[] = [
      SubmissionStatus.STARTED,
      SubmissionStatus.IN_PROGRESS,
      SubmissionStatus.PAUSED,
    ];
    if (!stillActive.includes(submission.status as SubmissionStatus)) {
      continue;
    }

    try {
      const dm = await client.users.createDM(state.userId);
      const hint =
        state.phase === DMPhase.QUESTION && state.currentQuestionId
          ? '▶️ Der Bot wurde neu gestartet – deine Bewerbung wird fortgesetzt. Bitte beantworte die letzte Frage erneut, falls deine Antwort nicht ankam.'
          : '▶️ Der Bot wurde neu gestartet – deine Bewerbung wird fortgesetzt.';
      await dm.send(hint).catch(() => undefined);
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
  await connectRedis();
  await prisma.$connect();
  const client = createClient();
  await client.login(config.discord.token);
}
