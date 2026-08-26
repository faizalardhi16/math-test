'use strict';

const crypto = require('node:crypto');

const DEFAULT_SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'authorization',
  'auth',
  'cookie',
  'set-cookie',
  'creditcard',
  'cardnumber',
  'cvv',
  'ssn',
  'socialsecurity',
  'passport',
  'email',
  'phone',
  'phonenumber',
  'address',
  'name',
  'fullname',
  'full_name',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'dateofbirth',
  'date_of_birth',
  'dob',
  'birthdate',
  'national_id',
  'driver_license'
]);

const MAX_STRING_LENGTH = 200;
const MAX_DEPTH = 3;
const MAX_ARRAY_ITEMS = 10;
const MAX_OBJECT_KEYS = 20;

function defaultIdGenerator() {
  return crypto.randomUUID();
}

function defaultNow() {
  return new Date();
}

function defaultSink(record) {
  console.log(record);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function truncateString(value) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function summarizeValue(value, depth, seen) {
  if (value === null) return null;
  if (value === undefined) return undefined;

  const type = typeof value;
  if (type === 'string') return truncateString(value);
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return value.toString();
  if (type === 'function') return '[Function]';
  if (type === 'symbol') return '[Symbol]';

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[Array(${value.length})]`;
    }
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`... +${value.length - MAX_ARRAY_ITEMS} more`);
    }
    seen.delete(value);
    return items;
  }

  if (isPlainObject(value)) {
    if (depth >= MAX_DEPTH) {
      return '[Object]';
    }
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const keys = Object.keys(value);
    const result = {};
    let count = 0;
    for (const key of keys) {
      if (count >= MAX_OBJECT_KEYS) {
        result['...'] = `+${keys.length - count} more`;
        break;
      }
      const normalizedKey = key.toLowerCase();
      if (DEFAULT_SENSITIVE_KEYS.has(normalizedKey)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = summarizeValue(value[key], depth + 1, seen);
      }
      count += 1;
    }
    seen.delete(value);
    return result;
  }

  return String(value);
}

function summarizeInput(input) {
  if (input === undefined) {
    return undefined;
  }
  return summarizeValue(input, 0, new WeakSet());
}

function toISOString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function toMilliseconds(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  return new Date(value).getTime();
}

function buildErrorRecord(error) {
  try {
    const message = error && error.message ? error.message : String(error);
    const record = {
      type: error && error.name ? error.name : 'Error',
      message: truncateString(String(message)),
    };
    if (error && error.code !== undefined && error.code !== null) {
      record.code = error.code;
    }
    return record;
  } catch (_) {
    return { type: 'Error', message: 'Unknown error' };
  }
}

function createLogger(options = {}) {
  const sink = typeof options.sink === 'function'
    ? options.sink
    : (options.sink && typeof options.sink.log === 'function')
      ? (record) => options.sink.log(record)
      : defaultSink;
  const now = typeof options.now === 'function' ? options.now : defaultNow;
  const idGenerator = typeof options.idGenerator === 'function' ? options.idGenerator : defaultIdGenerator;
  const summarize = typeof options.redact === 'function' ? options.redact : summarizeInput;

  function safeWrite(record) {
    try {
      const line = typeof record === 'string' ? record : JSON.stringify(record);
      sink(line);
    } catch (_) {
      // Logging must never break feature execution.
    }
  }

  function generateId() {
    try {
      return idGenerator();
    } catch (_) {
      return `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function start(entryOptions) {
    const opts = entryOptions || {};

    const id = generateId();
    let timestamp;
    try {
      timestamp = now();
    } catch (_) {
      timestamp = new Date();
    }

    const startTime = toMilliseconds(timestamp);
    const userId = opts.userId || 'anonymous';
    const action = opts.action || 'unknown';

    let input;
    try {
      input = summarize(opts.input);
    } catch (_) {
      input = '[Unavailable]';
    }

    const startRecord = {
      id,
      timestamp: toISOString(timestamp),
      function: action,
      status: 'started',
      userId,
      action,
    };
    if (input !== undefined) {
      startRecord.input = input;
    }
    safeWrite(startRecord);

    let finalized = false;

    function buildBaseRecord(outcome, duration, endTime) {
      const record = {
        id,
        timestamp: toISOString(endTime),
        function: action,
        status: outcome === 'success' ? 'completed' : 'failed',
        userId,
        action,
        outcome,
        duration,
      };
      if (input !== undefined) {
        record.input = input;
      }
      return record;
    }

    const entry = {
      id,
      userId,
      action,
      input,
      success(result) {
        if (finalized) return;
        finalized = true;
        const endTime = now();
        const duration = toMilliseconds(endTime) - startTime;
        const record = buildBaseRecord('success', duration, endTime);
        if (result !== undefined) {
          try {
            record.result = summarize(result);
          } catch (_) {
            record.result = '[Unavailable]';
          }
        }
        safeWrite(record);
      },
      failure(error) {
        if (finalized) return;
        finalized = true;
        const endTime = now();
        const duration = toMilliseconds(endTime) - startTime;
        const record = buildBaseRecord('failure', duration, endTime);
        record.error = buildErrorRecord(error);
        safeWrite(record);
      },
    };

    return entry;
  }

  function wrap(fn, options = {}) {
    if (typeof fn !== 'function') {
      throw new TypeError('wrap expects a function');
    }
    const name = options.name || fn.name || 'anonymous';
    const summarizeArgs = options.summarizeArgs !== false;
    const summarizeResult = options.summarizeResult !== false;
    const extra = options.extra && typeof options.extra === 'object' ? options.extra : {};

    function wrapped(...args) {
      const id = generateId();
      let startTime;
      try {
        startTime = now();
      } catch (_) {
        startTime = new Date();
      }

      const startRecord = {
        id,
        timestamp: toISOString(startTime),
        function: name,
        status: 'started',
      };
      Object.assign(startRecord, extra);
      if (summarizeArgs) {
        try {
          startRecord.args = summarize(args);
        } catch (_) {
          startRecord.args = '[Unavailable]';
        }
      }
      safeWrite(startRecord);

      function buildFinalRecord(status, errorOrResult) {
        let endTime;
        try {
          endTime = now();
        } catch (_) {
          endTime = new Date();
        }
        const record = {
          id,
          timestamp: toISOString(endTime),
          function: name,
          status,
        };
        Object.assign(record, extra);
        record.duration = toMilliseconds(endTime) - toMilliseconds(startTime);
        if (status === 'completed') {
          record.outcome = 'success';
          if (summarizeResult && errorOrResult !== undefined) {
            try {
              record.result = summarize(errorOrResult);
            } catch (_) {
              record.result = '[Unavailable]';
            }
          }
        } else {
          record.outcome = 'failure';
          record.error = buildErrorRecord(errorOrResult);
        }
        return record;
      }

      try {
        const result = fn.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.then(
            (value) => {
              safeWrite(buildFinalRecord('completed', value));
              return value;
            },
            (error) => {
              safeWrite(buildFinalRecord('failed', error));
              throw error;
            }
          );
        }
        safeWrite(buildFinalRecord('completed', result));
        return result;
      } catch (error) {
        safeWrite(buildFinalRecord('failed', error));
        throw error;
      }
    }

    Object.defineProperty(wrapped, 'name', { value: name, configurable: true });
    return wrapped;
  }

  return { start, wrap, summarize };
}

async function runWithLogging(logger, options, fn) {
  let entry;
  try {
    entry = logger.start(options);
  } catch (_) {
    return fn();
  }

  try {
    const result = await fn(entry);
    try {
      entry.success(result);
    } catch (_) {
      // Ignore logging finalization errors.
    }
    return result;
  } catch (error) {
    try {
      entry.failure(error);
    } catch (_) {
      // Ignore logging finalization errors.
    }
    throw error;
  }
}

function withLogging(logger, fn, options) {
  return logger.wrap(fn, options);
}

module.exports = {
  createLogger,
  runWithLogging,
  withLogging,
  summarizeInput,
  DEFAULT_SENSITIVE_KEYS,
};
