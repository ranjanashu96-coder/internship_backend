import nodemailer from "nodemailer";

const smtpPort =
  Number(
    process.env.SMTP_PORT ||
      587,
  );

const transporter =
  nodemailer.createTransport({
    host:
      process.env.SMTP_HOST,

    port:
      smtpPort,

    secure:
      String(
        process.env.SMTP_SECURE,
      ).toLowerCase() ===
      "true",

    auth: {
      user:
        process.env.SMTP_USER,

      pass:
        process.env.SMTP_PASS,
    },
  });


export const verifyEmailConnection =
  async () => {
    return transporter.verify();
  };


export const sendEmail =
  async ({
    to,
    subject,
    html,
    text,
  }) => {
    if (!to) {
      throw new Error(
        "Recipient email is required",
      );
    }

    return transporter.sendMail({
      from: {
        name:
          process.env
            .MAIL_FROM_NAME ||
          "RK Nexora",

        address:
          process.env
            .MAIL_FROM_EMAIL ||
          process.env.SMTP_USER,
      },

      to,
      subject,
      html,
      text,
    });
  };