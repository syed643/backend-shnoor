import transporter from "../config/mailer.js";

// Supports both call styles:
//  sendInstructorInvite(email, name)
//  sendInstructorInvite({ email, name })
export const sendInstructorInvite = async (emailOrObj, name) => {
  let email;
  let displayName;

  if (typeof emailOrObj === "object" && emailOrObj !== null) {
    email = emailOrObj.email;
    displayName = emailOrObj.name || emailOrObj.displayName;
  } else {
    email = emailOrObj;
    displayName = name;
  }

  if (!email) {
    console.error("sendInstructorInvite: missing email");
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: "You’ve been invited as an Instructor",
      text: `Hello ${displayName || ""},\n\nYou have been added as an Instructor at SHNOOR LMS.\n\nLogin here: https://lms.shnoor.com/login`,
      html: `
        <h2>Welcome to SHNOOR LMS 🎓</h2>
        <p>Hello <b>${displayName || ""}</b>,</p>
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
    throw error;
  }
};
