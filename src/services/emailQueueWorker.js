import { Op } from "sequelize";

import { EmailQueue } from "../models/index.js";
import { sendEmail } from "./emailService.js";

let workerTimer = null;
let workerRunning = false;

const POLL_INTERVAL_MS = Number(
  process.env.EMAIL_WORKER_INTERVAL || 10000
);
const BATCH_SIZE = Number(process.env.EMAIL_WORKER_BATCH || 10);

const resetStuckEmails = async () => {
  try {
    const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const [count] = await EmailQueue.update(
      { status: "queued", error_message: "Reset after worker restart" },
      {
        where: {
          status: "sending",
          updated_at: { [Op.lt]: stuckThreshold },
        },
      }
    );
    if (count > 0) {
      console.log(`🔁 Reset ${count} stuck "sending" emails to "queued"`);
    }
  } catch (error) {
    console.error("❌ resetStuckEmails error:", error.message);
  }
};

const processEmailQueue = async () => {
  if (workerRunning) return;
  workerRunning = true;

  try {
    const emails = await EmailQueue.findAll({
      where: {
        status: "queued",
        attempts: { [Op.lt]: 3 },
        [Op.or]: [
          { scheduled_at: null },
          { scheduled_at: { [Op.lte]: new Date() } },
        ],
      },
      order: [["created_at", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (!emails.length) return;

    for (const email of emails) {
      const nextAttempt = Number(email.attempts || 0) + 1;

      try {
        const [claimed] = await EmailQueue.update(
          { status: "sending", attempts: nextAttempt, error_message: null },
          { where: { id: email.id, status: "queued" } }
        );
        if (!claimed) continue;

        await sendEmail({
          to: email.recipient_email,
          subject: email.subject,
          html: email.html_body,
          text: email.text_body,
        });

        await EmailQueue.update(
          { status: "sent", sent_at: new Date(), error_message: null },
          { where: { id: email.id } }
        );

        console.log(`✅ Email sent: ${email.id} → ${email.recipient_email}`);
      } catch (error) {
        const maxAttempts = Number(email.max_attempts || 3);
        const permanentlyFailed = nextAttempt >= maxAttempts;

        const updateData = {
          status: permanentlyFailed ? "failed" : "queued",
          error_message: String(error?.message || "Email sending failed").slice(0, 500),
          scheduled_at: permanentlyFailed ? null : new Date(Date.now() + 60 * 1000),
        };

        try {
          await EmailQueue.update(updateData, { where: { id: email.id } });
        } catch (updateErr) {
          console.error("❌ Failed to update email status:", email.id, updateErr.message);
        }

        console.error(
          `❌ Email queue error [${email.id}] attempt ${nextAttempt}/${maxAttempts}:`,
          error?.message || error
        );
      }
    }
  } catch (error) {
    console.error("❌ Email worker error:", error.message || error);
  } finally {
    workerRunning = false;
  }
};

export const startEmailQueueWorker = async () => {
  if (workerTimer) {
    console.warn("⚠️ Email worker already running");
    return;
  }
  console.log("📧 Email queue worker started");
  await resetStuckEmails();
  void processEmailQueue();
  workerTimer = setInterval(() => {
    void processEmailQueue();
  }, POLL_INTERVAL_MS);
};

export const stopEmailQueueWorker = async () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log("🛑 Email queue worker stopped");
  }
  const start = Date.now();
  while (workerRunning && Date.now() - start < 15000) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (workerRunning) {
    console.warn("⚠️ Email worker still running after 15s wait");
  }
};