'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogger, runWithLogging, summarizeInput } = require('../src/logger');

function collectSink() {
  const records = [];
  const sink = (line) => {
    records.push(JSON.parse(line));
  };
  return { records, sink };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('runWithLogging logs a successful execution', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  const result = await runWithLogging(
    logger,
    { userId: 'user-1', action: 'submit_form', input: { amount: 100 } },
    async () => 'ok'
  );

  assert.equal(result, 'ok');
  assert.equal(records.length, 1);

  const record = records[0];
  assert.ok(record.id);
  assert.ok(record.timestamp);
  assert.equal(record.userId, 'user-1');
  assert.equal(record.action, 'submit_form');
  assert.equal(record.outcome, 'success');
  assert.equal(typeof record.duration, 'number');
  assert.deepEqual(record.input, { amount: 100 });
});

test('runWithLogging logs a failed execution and rethrows', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  await assert.rejects(
    runWithLogging(
      logger,
      { userId: 'user-2', action: 'process_payment' },
      async () => {
        const error = new Error('Card declined');
        error.code = 'CARD_DECLINED';
        throw error;
      }
    ),
    /Card declined/
  );

  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.outcome, 'failure');
  assert.equal(record.error.message, 'Card declined');
  assert.equal(record.error.code, 'CARD_DECLINED');
});

test('logging failures do not break feature execution', async () => {
  const logger = createLogger({
    sink: () => {
      throw new Error('sink down');
    },
  });

  const result = await runWithLogging(
    logger,
    { userId: 'user-3', action: 'do_thing' },
    async () => 42
  );

  assert.equal(result, 42);
});

test('sensitive fields are redacted from input summary', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  await runWithLogging(
    logger,
    {
      userId: 'user-4',
      action: 'signup',
      input: {
        username: 'alice',
        password: 'hunter2',
        token: 'abc',
        email: 'alice@example.com',
        nested: { apiKey: 'secret' },
      },
    },
    async () => {}
  );

  const record = records[0];
  assert.equal(record.input.password, '[REDACTED]');
  assert.equal(record.input.token, '[REDACTED]');
  assert.equal(record.input.email, '[REDACTED]');
  assert.equal(record.input.nested.apiKey, '[REDACTED]');
  assert.equal(record.input.username, 'alice');
});

test('concurrent executions produce distinct log entries', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  await Promise.all([
    runWithLogging(logger, { userId: 'same-user', action: 'action_a' }, async () => {
      await delay(10);
    }),
    runWithLogging(logger, { userId: 'same-user', action: 'action_b' }, async () => {
      await delay(5);
    }),
  ]);

  assert.equal(records.length, 2);
  assert.notEqual(records[0].id, records[1].id);
  assert.equal(records[0].userId, 'same-user');
  assert.equal(records[1].userId, 'same-user');
});

test('missing optional fields do not block logging', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  await runWithLogging(logger, { action: 'no_user' }, async () => {});
  await runWithLogging(logger, { userId: 'no-input' }, async () => {});

  assert.equal(records.length, 2);
  assert.equal(records[0].userId, 'anonymous');
  assert.equal(records[0].action, 'no_user');
  assert.equal(records[1].action, 'unknown');
  assert.ok(!('input' in records[1]));
});

test('log entries are valid JSON', async () => {
  const lines = [];
  const logger = createLogger({ sink: (line) => lines.push(line) });

  await runWithLogging(logger, { userId: 'u', action: 'a' }, async () => {});

  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.outcome, 'success');
});

test('runWithLogging supports synchronous functions', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  const result = await runWithLogging(logger, { userId: 'u', action: 'sync' }, () => 7);

  assert.equal(result, 7);
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, 'success');
});

test('custom id generator and clock are used', async () => {
  const { records, sink } = collectSink();
  const fixedDate = new Date('2026-01-01T00:00:00.000Z');
  const logger = createLogger({
    sink,
    idGenerator: () => 'custom-id',
    now: () => fixedDate,
  });

  await runWithLogging(logger, { userId: 'u', action: 'a' }, async () => {});

  assert.equal(records[0].id, 'custom-id');
  assert.equal(records[0].timestamp, fixedDate.toISOString());
  assert.equal(records[0].duration, 0);
});

test('an entry can only be finalized once', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  const entry = logger.start({ userId: 'u', action: 'a' });
  entry.success();
  entry.success();
  entry.failure(new Error('late'));

  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, 'success');
});

test('summarizeInput handles circular references', () => {
  const input = { name: 'x' };
  input.self = input;

  const summary = summarizeInput(input);
  assert.equal(summary.self, '[Circular]');
});

test('supports sink object with log method', async () => {
  const lines = [];
  const logger = createLogger({ sink: { log: (line) => lines.push(line) } });

  await runWithLogging(logger, { userId: 'u', action: 'a' }, async () => {});

  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).outcome, 'success');
});

test('id generator failure does not break logging', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({
    sink,
    idGenerator: () => {
      throw new Error('no id');
    },
  });

  await runWithLogging(logger, { userId: 'u', action: 'a' }, async () => {});

  assert.equal(records.length, 1);
  assert.ok(records[0].id);
});

test('custom redact function is used', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({
    sink,
    redact: (input) => ({ safe: input.safe }),
  });

  await runWithLogging(
    logger,
    { userId: 'u', action: 'a', input: { safe: 1, secret: 2 } },
    async () => {}
  );

  assert.deepEqual(records[0].input, { safe: 1 });
});
