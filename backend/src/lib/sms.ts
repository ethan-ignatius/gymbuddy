import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function sendSms(to: string, body: string): Promise<void> {
  if (!client || !fromNumber) {
    console.log("[SMS stub]", { to, body });
    return;
  }
  await client.messages.create({ to, from: fromNumber, body });
  console.log(`[SMS] → ${to}: ${body.substring(0, 60)}...`);
}

export type IncomingSmsPayload = {
  From?: string;
  To?: string;
  Body?: string;
};
