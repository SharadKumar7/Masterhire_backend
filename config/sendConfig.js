import { Brevo } from "@getbrevo/brevo";

const sendEmail = async (to, subject, text) => {
  const client = new Brevo({
    apiKey: process.env.BREVO_API_KEY,
  });

  await client.transactionalEmails.send({
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