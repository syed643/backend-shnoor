import transporter from "../config/mailer.js";

export const sendInstructorInvite = async ({ email, name }) => {
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: "You’ve been invited as an Instructor",
      text: `Hello ${name},

You have been added as an Instructor at SHNOOR LMS.

Login here: https://lms.shnoor.com/login`,
      html: `
        <h2>Welcome to SHNOOR LMS 🎓</h2>
        <p>Hello <b>${name}</b>,</p>
        <p>You have been added as an Instructor.</p>
        <p>Please login using your email.</p>
        <br />
        <a href="https://lms.shnoor.com/login">
          Login to Dashboard
        </a>
      `,
    });
  } catch (error) {
    console.error("Failed to send instructor invite:", error);
    // optional: throw error or log to monitoring
  }
};
