/**
 * autocannon-run.js
 *
 * Usage:
 *   node autocannon-run.js
 *
 * This script:
 *  - builds 100 unique request bodies (unique telegramId & userName)
 *  - runs autocannon with connections=100, duration=30s, POST requests to /contest-participation
 */

const fs = require('fs');

async function ensureAutocannon() {
  try {
    require.resolve('autocannon');
    return true;
  } catch (e) {
    console.log('autocannon not found, installing locally (npm i autocannon)...');
    const { execSync } = require('child_process');
    try {
      execSync('npm i autocannon --no-audit --no-fund', { stdio: 'inherit' });
      return true;
    } catch (err) {
      console.error('Failed to install autocannon. Install manually: npm i autocannon');
      return false;
    }
  }
}

(async () => {
  const has = await ensureAutocannon();
  if (!has) process.exit(1);

  const autocannon = require('autocannon');

  const TARGET = 'http://localhost:3006';
  const PATH = '/contest-participation';
  const DURATION = 30; // seconds
  const CONNECTIONS = 150;
  const UNIQUE_USERS = 900;

  // fixed fields
  const CONTEST_ID = 15;
  const GROUP_ID = -1002956637345;
  const BASE_TELEGRAM = 7604827593; // will increment from this base

  // build 100 unique bodies
  const bodies = Array.from({ length: UNIQUE_USERS }, (_, i) => {
    return JSON.stringify({
      contestId: CONTEST_ID,
      telegramId: BASE_TELEGRAM + i, // unique per user
      userName: `MlDwan_${i}`, // unique userName per user
      groupId: GROUP_ID,
    });
  });

  // build requests array for autocannon
  const requests = bodies.map((body) => ({
    method: 'POST',
    path: PATH,
    body,
    headers: {
      'Content-Type': 'application/json',
    },
  }));

  console.log(`Starting autocannon: ${TARGET}${PATH}
  connections: ${CONNECTIONS}
  duration: ${DURATION}s
  unique bodies: ${UNIQUE_USERS}
`);

  const inst = autocannon(
    {
      url: TARGET,
      connections: CONNECTIONS,
      duration: DURATION,
      requests,
      // optional tweaks:
      // timeout: 10000,
      // pipelining: 1,
    },
    (err, result) => {
      if (err) {
        console.error('Autocannon error:', err);
        process.exitCode = 2;
        return;
      }
      console.log('\n--- Benchmark finished ---');
      console.log('Requests:', result.requests);
      console.log('Latency (ms):', result.latency);
      console.log('Errors:', result.errors);
      console.log('Non-2xx responses:', result['non2xx']);
    },
  );

  // print progress bar to stdout
  autocannon.track(inst, { renderProgressBar: true });
})();
