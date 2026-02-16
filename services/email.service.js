import { sendMail } from "../config/mailer.js"; // the resend mailer you created
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
    await sendMail({
      to: email,
      subject: "You’ve been invited as an Instructor",
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

export const sendStudentInvite = async (emailOrObj, name) => {
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
    console.error("sendStudentInvite: missing email");
    return;
  }

  try {
    await sendMail({
      to: email,
      subject: "You've been invited as a Student",
      html: `
        <h2>Welcome to SHNOOR LMS 🎓</h2>
        <p>Hello <b>${displayName || ""}</b>,</p>
        <p>You have been added as a Student.</p>
        <p>Please login using your email.</p>
        <br />
        <a href="https://lms.shnoor.com/login">
          Login to Dashboard
        </a>
      `,
    });
  } catch (error) {
    console.error("Failed to send student invite:", error);
    throw error;
  }
};
