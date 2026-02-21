import nodemailer from "nodemailer";
import { prisma } from "./db.js";

const SMTP_EMAIL = process.env.SMTP_EMAIL;
const SMTP_APP_PASSWORD = process.env.SMTP_APP_PASSWORD;

const MAX_SMS_LENGTH = 150;

const transporter =
  SMTP_EMAIL && SMTP_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: SMTP_EMAIL, pass: SMTP_APP_PASSWORD },
      })
    : null;

type SmsListener = (to: string, body: string) => void;
const listeners: SmsListener[] = [];

export function onSmsSent(fn: SmsListener) {
  listeners.push(fn);
}

async function getGatewayForPhone(phone: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { phoneNumber: phone } });
  return user?.carrierGateway ?? "vtext.com";
}

function phoneToGatewayEmail(phone: string, gateway: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return `${local}@${gateway}`;
}

function splitMessage(text: string): string[] {
  if (text.length <= MAX_SMS_LENGTH) return [text];

  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    if (current.length + line.length + 1 <= MAX_SMS_LENGTH) {
      current += (current ? "\n" : "") + line;
    } else {
      if (current) chunks.push(current);
      if (line.length > MAX_SMS_LENGTH) {
        const sentences = line.match(/[^.!?]+[.!?]+\s*/g) ?? [line];
        let sentBuf = "";
        for (const s of sentences) {
          if (sentBuf.length + s.length <= MAX_SMS_LENGTH) {
            sentBuf += s;
          } else {
            if (sentBuf) chunks.push(sentBuf.trim());
            sentBuf = s;
          }
        }
        current = sentBuf;
      } else {
        current = line;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendSms(to: string, body: string): Promise<void> {
  for (const fn of listeners) {
    fn(to, body);
  }

  if (!transporter) {
    console.log(`[SMS stub] → ${to}: ${body.substring(0, 60)}...`);
    return;
  }

  const gateway = await getGatewayForPhone(to);
  const gatewayAddr = phoneToGatewayEmail(to, gateway);
  const chunks = splitMessage(body);

  for (let i = 0; i < chunks.length; i++) {
    try {
      await transporter.sendMail({
        from: SMTP_EMAIL,
        to: gatewayAddr,
        subject: "",
        text: chunks[i],
      });
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error(`[SMS failed] → ${gatewayAddr}:`, (err as Error).message);
    }
  }
  console.log(`[SMS] → ${gatewayAddr} (${chunks.length} part${chunks.length > 1 ? "s" : ""}): ${body.substring(0, 60)}...`);
}

export type IncomingSmsPayload = {
  From?: string;
  To?: string;
  Body?: string;
};
