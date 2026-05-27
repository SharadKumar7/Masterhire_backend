import { TransactionalEmailsApi, SendSmtpEmail, ApiClient } from "@getbrevo/brevo";

const sendEmail = async (to, subject, text) => {
  const apiInstance = new TransactionalEmailsApi();
  apiInstance.authentications["apiKey"].apiKey = process.env.BREVO_API_KEY;

  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.textContent = text;
  sendSmtpEmail.sender = {
    name: "MasterHire",
    email: "123sharadkumar6@gmail.com",
  };
  sendSmtpEmail.to = [{ email: to }];

  await apiInstance.sendTransacEmail(sendSmtpEmail);
};

export default sendEmail;