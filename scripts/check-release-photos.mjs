import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

if (process.env.VERCEL_ENV === 'production' || process.argv.includes('--check')) {
 const inventory = JSON.parse(readFileSync(new URL('./release-photos.json', import.meta.url), 'utf8'));
 const problems = [];

 for (const {file, sha, size} of inventory) {
  try {
   const image = readFileSync(new URL(`../${file}`, import.meta.url));
   if (image.length !== size || createHash('sha1').update(image).digest('hex') !== sha) {
    problems.push(`Changed: ${file}`);
   }
  } catch (error) {
   if (error.code !== 'ENOENT') throw error;
   problems.push(`Missing: ${file}`);
  }
 }

 if (problems.length) {
  console.error(['Release photos are incomplete. Include the approved files from scripts/release-photos.json.', ...problems].join('\n'));
  process.exitCode = 1;
 } else {
  console.log(`Verified ${inventory.length} release photos.`);
 }
}
