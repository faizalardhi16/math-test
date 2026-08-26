# math-test

Demo repo for DexanKit Loop AI coding workflow.

## Business Logging

`src/logger.js` provides a small, dependency-free business logging utility for
user-facing feature executions.

### Usage

Wrap any feature entry point with `runWithLogging`:

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

Each execution writes one JSON line:

```json
{"id":"...","timestamp":"...","userId":"...","action":"...","outcome":"success","duration":12,"input":{...}}
```

Failed executions include an `error` object:

```json
{"id":"...","timestamp":"...","userId":"...","action":"...","outcome":"failure","duration":3,"error":{"message":"...","code":"..."}}
```

### Behavior

- A log entry is created when the feature starts and finalized when it completes.
- Successful executions log `outcome=success`; failed executions log `outcome=failure` with error details.
- Exceptions are logged and re-thrown so the caller still observes the failure.
- Sensitive keys (`password`, `token`, `email`, `name`, etc.) are redacted from input summaries.
- Logging failures are swallowed so they never break feature execution.
- Concurrent executions receive unique IDs via `crypto.randomUUID()`.
- Missing optional fields (e.g. `input`) do not block logging.
