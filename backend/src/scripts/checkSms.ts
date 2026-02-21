import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

async function main() {
  const msgs = await client.messages.list({
    limit: 5,
    from: process.env.TWILIO_PHONE_NUMBER,
  });
  for (const m of msgs) {
    console.log(
      m.dateSent?.toISOString(),
      "|", m.status,
      "| err:", m.errorCode ?? "none",
      "|", (m.errorMessage ?? "").substring(0, 80)
    );
  }
}

main();
