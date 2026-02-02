import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);
export const sendMail = async ({ to, subject, html }) => {
  try {
    const response = await resend.emails.send({
      from: "onboarding@resend.dev", 
      to,
      subject,
      html,
    });
    return response;
  } catch (error) {
    console.error("Resend Email Error:", error);
    throw error;
  }
};
