import crypto from 'crypto';

function getSecretKey(): Buffer {
  const raw =
    process.env.API_ENCRYPTION_SECRET ||
    process.env.SQL_PASSWORD ||
    process.env.GEMINI_API_KEY ||
    'china-stock-intelligence-v3-server-key';
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptApiKey(plaintext: string): { encrypted: string; last4: string } {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  const last4 = plaintext.length >= 4 ? plaintext.slice(-4) : '****';
  return { encrypted: payload, last4 };
}

export function decryptApiKey(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key = getSecretKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
