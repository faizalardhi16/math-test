'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogger, runWithLogging, withLogging, summarizeInput } = require('../src/logger');

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
  assert.equal(records.length, 2);

  const start = records[0];
  const completed = records[1];
  assert.ok(start.id);
  assert.ok(start.timestamp);
  assert.equal(start.userId, 'user-1');
  assert.equal(start.action, 'submit_form');
  assert.equal(start.function, 'submit_form');
  assert.equal(start.status, 'started');
  assert.deepEqual(start.input, { amount: 100 });

  assert.equal(completed.id, start.id);
  assert.ok(completed.timestamp);
  assert.equal(completed.userId, 'user-1');
  assert.equal(completed.action, 'submit_form');
  assert.equal(completed.function, 'submit_form');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.outcome, 'success');
  assert.equal(typeof completed.duration, 'number');
  assert.deepEqual(completed.input, { amount: 100 });
  assert.equal(completed.result, 'ok');
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

  assert.equal(records.length, 2);
  const start = records[0];
  const failed = records[1];
  assert.equal(start.status, 'started');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.outcome, 'failure');
  assert.equal(failed.error.message, 'Card declined');
  assert.equal(failed.error.code, 'CARD_DECLINED');
  assert.equal(failed.error.type, 'Error');
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

  assert.equal(records.length, 2);
  assert.equal(records[0].input.password, '[REDACTED]');
  assert.equal(records[0].input.token, '[REDACTED]');
  assert.equal(records[0].input.email, '[REDACTED]');
  assert.equal(records[0].input.nested.apiKey, '[REDACTED]');
  assert.equal(records[0].input.username, 'alice');
  assert.equal(records[1].input.password, '[REDACTED]');
  assert.equal(records[1].input.token, '[REDACTED]');
  assert.equal(records[1].input.email, '[REDACTED]');
  assert.equal(records[1].input.nested.apiKey, '[REDACTED]');
  assert.equal(records[1].input.username, 'alice');
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

  assert.equal(records.length, 4);
  const starts = records.filter((r) => r.status === 'started');
  const completions = records.filter((r) => r.status === 'completed');
  assert.equal(starts.length, 2);
  assert.equal(completions.length, 2);
  assert.equal(new Set(records.map((r) => r.id)).size, 2);
  assert.ok(starts.every((r) => r.userId === 'same-user'));
  for (const start of starts) {
    assert.equal(completions.filter((c) => c.id === start.id).length, 1);
  }
});

test('missing optional fields do not block logging', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  await runWithLogging(logger, { action: 'no_user' }, async () => {});
  await runWithLogging(logger, { userId: 'no-input' }, async () => {});

  assert.equal(records.length, 4);
  const firstStart = records[0];
  const firstCompleted = records[1];
  const secondStart = records[2];
  const secondCompleted = records[3];
  assert.equal(firstStart.userId, 'anonymous');
  assert.equal(firstStart.action, 'no_user');
  assert.equal(firstCompleted.userId, 'anonymous');
  assert.equal(firstCompleted.action, 'no_user');
  assert.equal(secondStart.userId, 'no-input');
  assert.equal(secondStart.action, 'unknown');
  assert.ok(!('input' in secondStart));
  assert.ok(!('input' in secondCompleted));
});

test('log entries are valid JSON', async () => {
  const lines = [];
  const logger = createLogger({ sink: (line) => lines.push(line) });

  await runWithLogging(logger, { userId: 'u', action: 'a' }, async () => {});

  assert.equal(lines.length, 2);
  const start = JSON.parse(lines[0]);
  const completed = JSON.parse(lines[1]);
  assert.equal(start.status, 'started');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.outcome, 'success');
});

test('runWithLogging supports synchronous functions', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  const result = await runWithLogging(logger, { userId: 'u', action: 'sync' }, () => 7);

  assert.equal(result, 7);
  assert.equal(records.length, 2);
  assert.equal(records[0].status, 'started');
  assert.equal(records[1].status, 'completed');
  assert.equal(records[1].result, 7);
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

  assert.equal(records.length, 2);
  assert.equal(records[0].id, 'custom-id');
  assert.equal(records[1].id, 'custom-id');
  assert.equal(records[0].timestamp, fixedDate.toISOString());
  assert.equal(records[1].timestamp, fixedDate.toISOString());
  assert.ok(!('duration' in records[0]));
  assert.equal(records[1].duration, 0);
});

test('an entry can only be finalized once', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });

  const entry = logger.start({ userId: 'u', action: 'a' });
  entry.success();
  entry.success();
  entry.failure(new Error('late'));

  assert.equal(records.length, 2);
  assert.equal(records[0].status, 'started');
  assert.equal(records[1].status, 'completed');
  assert.equal(records[1].outcome, 'success');
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

  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).status, 'started');
  assert.equal(JSON.parse(lines[1]).status, 'completed');
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

  assert.equal(records.length, 2);
  assert.ok(records[0].id);
  assert.ok(records[1].id);
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
  assert.deepEqual(records[1].input, { safe: 1 });
});

test('withLogging logs started and completed for sync functions', () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });
  const add = withLogging(logger, (a, b) => a + b, { name: 'add' });

  const result = add(2, 3);

  assert.equal(result, 5);
  assert.equal(records.length, 2);
  assert.equal(records[0].status, 'started');
  assert.equal(records[0].function, 'add');
  assert.deepEqual(records[0].args, [2, 3]);
  assert.equal(records[1].status, 'completed');
  assert.equal(records[1].function, 'add');
  assert.equal(records[1].result, 5);
});

test('withLogging logs failed and rethrows', () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });
  const fail = withLogging(logger, () => {
    throw new Error('boom');
  }, { name: 'fail' });

  assert.throws(() => fail(), /boom/);
  assert.equal(records.length, 2);
  assert.equal(records[0].status, 'started');
  assert.equal(records[1].status, 'failed');
  assert.equal(records[1].error.message, 'boom');
  assert.equal(records[1].error.type, 'Error');
});

test('withLogging handles async functions', async () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });
  const asyncFn = withLogging(logger, async (x) => {
    await delay(5);
    return x * 2;
  }, { name: 'asyncFn' });

  const result = await asyncFn(21);

  assert.equal(result, 42);
  assert.equal(records.length, 2);
  assert.equal(records[0].status, 'started');
  assert.equal(records[1].status, 'completed');
  assert.equal(records[1].result, 42);
});

test('withLogging logs every recursive invocation', () => {
  const { records, sink } = collectSink();
  const logger = createLogger({ sink });
  let wrappedFact;
  wrappedFact = withLogging(logger, function fact(n) {
    if (n <= 1) return 1;
    return n * wrappedFact(n - 1);
  }, { name: 'fact' });

  assert.equal(wrappedFact(3), 6);
  assert.equal(records.length, 6);
  const starts = records.filter((r) => r.status === 'started');
  const completions = records.filter((r) => r.status === 'completed');
  assert.equal(starts.length, 3);
  assert.equal(completions.length, 3);
});
