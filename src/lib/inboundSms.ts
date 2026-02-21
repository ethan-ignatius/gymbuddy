import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getUserByPhone } from "./db.js";
import { handleConversation } from "./conversation.js";

const SMTP_EMAIL = process.env.SMTP_EMAIL!;
const SMTP_APP_PASSWORD = process.env.SMTP_APP_PASSWORD!;

function extractPhoneFromEmail(address: string): string | null {
  const match = address.match(/(\d+)@/);
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 10) digits = "1" + digits;
  return "+" + digits;
}

function extractMessageText(subject: string | undefined, body: string | undefined): string {
  const bodyText = stripReplyQuotes((body ?? "").trim());
  const subjectText = (subject ?? "").trim();
  if (bodyText.length > 0) return bodyText;
  if (subjectText.length > 0) return subjectText;
  return "";
}

function stripReplyQuotes(text: string): string {
  const lines = text.split("\n");
  const cleanLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) break;
    if (trimmed.startsWith("On ") && trimmed.includes("wrote:")) break;
    if (trimmed.startsWith("---")) break;
    if (trimmed.startsWith("From:")) break;
    if (trimmed === "" && cleanLines.length > 0) break;
    if (trimmed === "") continue;
    cleanLines.push(trimmed);
  }
  return cleanLines.join(" ").trim();
}

let client: ImapFlow | null = null;

export async function startInboundSmsListener(): Promise<void> {
  if (!SMTP_EMAIL || !SMTP_APP_PASSWORD) {
    console.log("[Inbound] No SMTP credentials, skipping.");
    return;
  }

  console.log("[Inbound] Connecting to Gmail IMAP...");
  await connectAndListen();
}

async function connectAndListen(): Promise<void> {
  try {
    client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: SMTP_EMAIL, pass: SMTP_APP_PASSWORD },
      logger: false,
    });

    await client.connect();
    console.log("[Inbound] Connected to heygymbuddy@gmail.com — listening for replies...");

    await processUnseen();

    client.on("exists", async () => {
      console.log("[Inbound] New email detected!");
      await processUnseen();
    });

    await client.idle();
  } catch (err) {
    console.error("[Inbound] Connection error:", (err as Error).message);
    setTimeout(() => connectAndListen(), 5000);
  }
}

async function processUnseen(): Promise<void> {
  if (!client) return;

  try {
    const lock = await client.getMailboxLock("INBOX");

    try {
      const searchResult = await client.search({ seen: false });
      const uids = searchResult ? (Array.isArray(searchResult) ? searchResult : []) : [];

      if (uids.length === 0) return;
      console.log(`[Inbound] ${uids.length} new message(s)`);

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(uid, { source: true });
          if (!msg || !("source" in msg) || !msg.source) {
            await client.messageFlagsAdd(uid, ["\\Seen"]);
            continue;
          }

          const parsed = await simpleParser(msg.source);
          const fromAddr = parsed.from?.value?.[0]?.address ?? "";
          const phone = extractPhoneFromEmail(fromAddr);
          const messageText = extractMessageText(parsed.subject, parsed.text);

          console.log(`[Inbound] from=${fromAddr} phone=${phone} text="${messageText}"`);

          if (!phone || !messageText) {
            await client.messageFlagsAdd(uid, ["\\Seen"]);
            continue;
          }

          const user = await getUserByPhone(phone);
          if (user) {
            await handleConversation(user, messageText);
            console.log(`[Inbound] Processed message from ${user.email}`);
          } else {
            console.log(`[Inbound] No user found for ${phone}`);
          }

          await client.messageFlagsAdd(uid, ["\\Seen"]);
        } catch (msgErr) {
          console.error("[Inbound] Message error:", (msgErr as Error).message);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error("[Inbound] Check error:", (err as Error).message);
  }
}
