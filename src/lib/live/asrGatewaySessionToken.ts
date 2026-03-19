import crypto from "node:crypto";

type AsrGatewaySessionTokenPayload = {
  jobId: string;
  userId: string;
  exp: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function getTokenSecret() {
  return process.env.KEMO_ASR_GATEWAY_TOKEN_SECRET || process.env.DASHSCOPE_API_KEY || "kemo-live-asr";
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return crypto
    .createHmac("sha256", getTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createAsrGatewaySessionToken({
  jobId,
  userId,
  ttlMs = DEFAULT_TTL_MS,
}: {
  jobId: string;
  userId: string;
  ttlMs?: number;
}) {
  const payload: AsrGatewaySessionTokenPayload = {
    jobId,
    userId,
    exp: Date.now() + ttlMs,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAsrGatewaySessionToken(token: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }

  const isValidSignature = crypto.timingSafeEqual(actualBuffer, expectedBuffer);

  if (!isValidSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as AsrGatewaySessionTokenPayload;

    if (!payload.jobId || !payload.userId || !payload.exp || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
