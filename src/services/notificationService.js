import {
  Notification,
  EmailQueue,
} from "../models/index.js";


const escapeHtml = (
  value = "",
) =>
  String(value)
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );


const createBasicEmailHtml = ({
  recipientName,
  title,
  message,
}) => {
  return `
    <div style="
      max-width:600px;
      margin:0 auto;
      font-family:Arial,sans-serif;
      color:#0f172a;
    ">

      <div style="
        background:#0f172a;
        padding:24px;
        color:#ffffff;
      ">
        <h2 style="margin:0;">
          RK Nexora
        </h2>
      </div>

      <div style="
        padding:28px;
        border:1px solid #e2e8f0;
      ">

        <p>
          Dear ${
            escapeHtml(
              recipientName ||
                "Student",
            )
          },
        </p>

        <h2>
          ${escapeHtml(title)}
        </h2>

        <p style="
          line-height:1.7;
          color:#475569;
        ">
          ${escapeHtml(message)}
        </p>

        <p style="
          margin-top:30px;
          color:#64748b;
          font-size:13px;
        ">
          This is an automated message
          from RK Nexora.
        </p>

      </div>

    </div>
  `;
};


export const notify =
  async ({
    recipientType,
    recipientId,

    type = "info",

    title,
    message,

    actionUrl = null,

    metadata = null,

    email = null,
    recipientName = null,

    sendEmail = false,

    emailSubject = null,
    emailHtml = null,

    transaction = null,
  }) => {
    if (
      !recipientType ||
      !recipientId
    ) {
      throw new Error(
        "Notification recipient is required",
      );
    }

    const notification =
      await Notification.create(
        {
          recipient_type:
            recipientType,

          recipient_id:
            recipientId,

          type,

          title,

          message,

          action_url:
            actionUrl,

          metadata_json:
            metadata,

          is_read:
            false,
        },
        {
          transaction,
        },
      );

    if (
      sendEmail &&
      email
    ) {
      await EmailQueue.create(
        {
          notification_id:
            notification.id,

          recipient_email:
            email,

          recipient_name:
            recipientName,

          subject:
            emailSubject ||
            title,

          html_body:
            emailHtml ||
            createBasicEmailHtml({
              recipientName,
              title,
              message,
            }),

          text_body:
            message,

          status:
            "queued",

          attempts:
            0,

          max_attempts:
            3,
        },
        {
          transaction,
        },
      );
    }

    return notification;
  };