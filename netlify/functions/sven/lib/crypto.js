const crypto = require('crypto');

function generateToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function keyFromSecret(secret) {
  if (!secret) throw new Error('SVEN_SECRET is not configured');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptText(secret, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptText(secret, token) {
  const payload = Buffer.from(String(token), 'base64url');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = {
  generateToken,
  encryptText,
  decryptText
};

