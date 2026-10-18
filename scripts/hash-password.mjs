// Genera il valore per OWNER_PASSWORD_HASH: npm run hash-password -- "password"
import { randomBytes, scryptSync } from 'node:crypto';
const pw = process.argv[2];
if (!pw) {
  console.error('Uso: npm run hash-password -- "la-tua-password"');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
console.log(`scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`);
