import {
  Op,
} from "sequelize";

import {
  EmailQueue,
} from "../models/index.js";

import {
  sendEmail,
} from "./emailService.js";


let workerTimer = null;
let workerRunning = false;


const processEmailQueue =
  async () => {
    if (workerRunning) {
      return;
    }

    workerRunning = true;

    try {
      const emails =
        await EmailQueue.findAll({
          where: {
            status:
              "queued",

            attempts: {
              [Op.lt]:
                3,
            },

            [Op.or]: [
              {
                scheduled_at:
                  null,
              },
              {
                scheduled_at: {
                  [Op.lte]:
                    new Date(),
                },
              },
            ],
          },

          order: [
            [
              "created_at",
              "ASC",
            ],
          ],

          limit: 10,
        });

      for (
        const email
        of emails
      ) {
        const nextAttempt =
          Number(
            email.attempts ||
              0,
          ) + 1;

        try {
          await email.update({
            status:
              "sending",

            attempts:
              nextAttempt,

            error_message:
              null,
          });

          await sendEmail({
            to:
              email
                .recipient_email,

            subject:
              email.subject,

            html:
              email.html_body,

            text:
              email.text_body,
          });

          await email.update({
            status:
              "sent",

            sent_at:
              new Date(),

            error_message:
              null,
          });
        } catch (error) {
          const permanentlyFailed =
            nextAttempt >=
            Number(
              email
                .max_attempts ||
                3,
            );

          await email.update({
            status:
              permanentlyFailed
                ? "failed"
                : "queued",

            error_message:
              error?.message ||
              "Email sending failed",

            scheduled_at:
              permanentlyFailed
                ? null
                : new Date(
                    Date.now() +
                      60 *
                        1000,
                  ),
          });

          console.error(
            "Email queue error:",
            email.id,
            error,
          );
        }
      }
    } catch (error) {
      console.error(
        "Email worker error:",
        error,
      );
    } finally {
      workerRunning = false;
    }
  };


export const startEmailQueueWorker =
  () => {
    if (workerTimer) {
      return;
    }

    console.log(
      "📧 Email queue worker started",
    );

    void processEmailQueue();

    workerTimer =
      setInterval(
        () => {
          void processEmailQueue();
        },
        10 * 1000,
      );
  };