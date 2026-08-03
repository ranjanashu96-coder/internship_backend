import "dotenv/config";

import nodemailer from "nodemailer";

const requiredVariables = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM_EMAIL",
  "TEST_EMAIL_TO",
];

const missingVariables =
  requiredVariables.filter(
    (name) =>
      !process.env[name],
  );

if (missingVariables.length > 0) {
  console.error(
    "❌ Missing environment variables:",
    missingVariables.join(", "),
  );

  process.exit(1);
}

const transporter =
  nodemailer.createTransport({
    host:
      process.env.SMTP_HOST,

    port:
      Number(
        process.env.SMTP_PORT,
      ),

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


    connectionTimeout:
      20_000,

    greetingTimeout:
      20_000,

    socketTimeout:
      30_000,
  });
try {
  console.log(
    "🔄 Checking SMTP connection...",
  );

  await transporter.verify();

  console.log(
    "✅ SMTP connection successful",
  );

  const result =
    await transporter.sendMail({
      from: {
        name:
          process.env
            .MAIL_FROM_NAME ||
          "RK Nexora",

        address:
          process.env
            .MAIL_FROM_EMAIL,
      },

      to:
        process.env
          .TEST_EMAIL_TO,

      subject:
        "RK Nexora Local Email Test",

      text:
        "RK Nexora local SMTP test completed successfully.",

      html: `
        <div style="
          max-width:600px;
          margin:0 auto;
          padding:24px;
          font-family:Arial,sans-serif;
          color:#0f172a;
        ">
          <div style="
            border-radius:14px;
            background:#0f172a;
            padding:22px;
            color:white;
          ">
            <h2 style="margin:0;">
              RK Nexora
            </h2>
          </div>

          <div style="
            border:1px solid #e2e8f0;
            border-top:0;
            padding:26px;
          ">
            <h2>
              Local Email Test Successful
            </h2>

            <p style="
              color:#475569;
              line-height:1.7;
            ">
              Your RK Nexora SMTP configuration
              is working correctly from the
              local backend.
            </p>

            <p style="
              margin-top:24px;
              font-size:13px;
              color:#64748b;
            ">
              Sent from support@rknexora.org
            </p>
          </div>
        </div>
      `,
    });

  console.log(
    "✅ Test email sent successfully",
  );

  console.log(
    "Message ID:",
    result.messageId,
  );

  console.log(
    "Recipient:",
    process.env.TEST_EMAIL_TO,
  );

  process.exit(0);
} catch (error) {
  console.error(
    "❌ Email test failed",
  );

  console.error(
    "Error code:",
    error?.code ||
      "UNKNOWN",
  );

  console.error(
    "Error message:",
    error?.message ||
      error,
  );

  process.exit(1);
}