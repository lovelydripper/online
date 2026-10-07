import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  }
});
const prompt = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
try {
  process.stdout.write('Admin password (10–72 characters): ');
  muted = true;
  const password = await prompt.question('');
  muted = false;
  process.stdout.write('\n');
  if (password.length < 10 || password.length > 72) {
    throw new Error('Password must contain 10–72 characters.');
  }
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  console.log(JSON.stringify({ salt: salt.toString('hex'), hash: hash.toString('hex') }));
} catch (error) {
  muted = false;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
}
