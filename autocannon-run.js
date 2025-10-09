/**
 * autocannon-run.js
 * Usage: node autocannon-run.js
 *
 * Генерирует 1000 уникальных тел и прогоняет нагрузочный тест:
 * - connections: 300
 * - duration: 30s
 * - POST на /contest-participation
 */

const autocannon = require('autocannon');

const TARGET = 'http://localhost:3006';
const PATH = '/contest-participation';
const DURATION = 30; // seconds
const CONNECTIONS = 300;
const UNIQUE_USERS = 1000;
const CONTEST_ID = 11;
const GROUP_ID = -1002956637345;

// Генерируем 1000 уникальных тел
const bodies = Array.from({ length: UNIQUE_USERS }, (_, i) => {
  return JSON.stringify({
    contestId: CONTEST_ID,
    telegramId: 876552900 + i,               // уникальный telegramId
    userName: `user_${i}`,                   // уникальный userName
    groupId: GROUP_ID,
  });
});

// Собираем requests — autocannon будет циклично их отправлять
const requests = bodies.map((body) => ({
  method: 'POST',
  path: PATH,
  body,
  headers: {
    'Content-Type': 'application/json',
  },
}));

console.log(`Starting autocannon:
  url: ${TARGET}${PATH}
  connections: ${CONNECTIONS}
  duration: ${DURATION}s
  unique bodies: ${UNIQUE_USERS}
`);

const instance = autocannon(
  {
    url: TARGET,
    connections: CONNECTIONS,
    duration: DURATION,
    requests, // передаём массив уникальных запросов
    // можно настроить timeout/headers здесь, если нужно
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
    // вывод подробного JSON-результата (если нужно)
    // console.log(JSON.stringify(result, null, 2));
  },
);

// печать прогресса в реальном времени
autocannon.track(instance, { renderProgressBar: true });
