import crypto from "crypto";
import { AppError } from "../utils/response.js";

export const CASHFREE_API_VERSION =
  process.env.CASHFREE_API_VERSION ||
  "2025-01-01";

export const getCashfreeBaseUrl = () => {
  const environment = String(
    process.env.CASHFREE_ENV || "sandbox",
  )
    .trim()
    .toLowerCase();

  return environment === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
};

const getCredentials = () => {
  const appId = String(
    process.env.CASHFREE_APP_ID || "",
  ).trim();

  const secretKey = String(
    process.env.CASHFREE_SECRET_KEY || "",
  ).trim();

  if (!appId || !secretKey) {
    throw new AppError(
      "Cashfree credentials are not configured",
      500,
    );
  }

  return {
    appId,
    secretKey,
  };
};

export const getCashfreeHeaders = (
  extraHeaders = {},
) => {
  const { appId, secretKey } =
    getCredentials();

  return {
    "Content-Type": "application/json",
    "x-client-id": appId,
    "x-client-secret": secretKey,
    "x-api-version":
      CASHFREE_API_VERSION,
    ...extraHeaders,
  };
};

export const verifyCashfreeWebhookSignature = ({
  rawBody,
  timestamp,
  signature,
}) => {
  const { secretKey } =
    getCredentials();

  if (
    !Buffer.isBuffer(rawBody) ||
    !timestamp ||
    !signature
  ) {
    return false;
  }

  const generatedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(
      `${timestamp}${rawBody.toString("utf8")}`,
    )
    .digest("base64");

  const generatedBuffer = Buffer.from(
    generatedSignature,
    "utf8",
  );

  const receivedBuffer = Buffer.from(
    String(signature),
    "utf8",
  );

  return (
    generatedBuffer.length ===
      receivedBuffer.length &&
    crypto.timingSafeEqual(
      generatedBuffer,
      receivedBuffer,
    )
  );
};
