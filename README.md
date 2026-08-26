# math-test

Demo repo for DexanKit Loop AI coding workflow.

## Business Logging

`src/logger.js` provides a small, dependency-free structured logging utility for
tracing application-owned function executions.

### Usage

Wrap any function with `withLogging` or `logger.wrap`:

```js
const { createLogger } = require('./src/logger');

const logger = createLogger();

const add = logger.wrap((a, b) => a + b, { name: 'add' });
```

For feature entry points, `runWithLogging` remains available:

```js
const { createLogger, runWithLogging } = require('./src/logger');

const logger = createLogger();

async function submitForm(userId, formData) {
  return runWithLogging(
    logger,
    { userId, action: 'submit_form', input: formData },
    async () => {
      // feature logic
    }
  );
}
```

### Log format

Each invocation writes two JSON lines: one with `status: "started"` before the
function body runs, and one with `status: "completed"` or `status: "failed"`
after it settles.

```json
{"id":"...","timestamp":"...","function":"submit_form","status":"started","userId":"...","action":"submit_form","input":{...}}
{"id":"...","timestamp":"...","function":"submit_form","status":"completed","userId":"...","action":"submit_form","outcome":"success","duration":12,"input":{...},"result":...}
```

Failed executions include an `error` object with `type` and `message`:

```json
{"id":"...","timestamp":"...","function":"submit_form","status":"failed","userId":"...","action":"submit_form","outcome":"failure","duration":3,"error":{"type":"Error","message":"..."}}
```

### Behavior

- A `started` entry is written before the function executes; a `completed` or
  `failed` entry is written when it returns or throws.
- Exceptions are logged and re-thrown so the caller still observes the failure.
- Sensitive keys (`password`, `token`, `email`, `name`, etc.) are redacted from
  summaries.
- Logging failures are swallowed so they never break feature execution.
- Concurrent executions receive unique IDs via `crypto.randomUUID()`; start and
  completion entries for one invocation share the same ID.
- Missing optional fields (e.g. `input`) do not block logging.
