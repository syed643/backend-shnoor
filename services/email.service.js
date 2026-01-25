import transporter from "../config/mailer.js";

export const sendInstructorInvite = async ({ email, name }) => {
  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: "You’ve been invited as an Instructor",
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
};
