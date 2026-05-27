import { BrevoClient } from "@getbrevo/brevo";

const sendEmail = async (to, subject, text) => {
  const client = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY,
  });

  await client.transactionalEmails.sendTransacEmail({
    subject,
    textContent: text,
    sender: {
      name: "MasterHire",
      email: "123sharadkumar6@gmail.com",
    },
    to: [{ email: to }],
  });
};

export default sendEmail;