// test/helpers/mockRedis.js

class MockRedis {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.has(key) ? String(this.store.get(key)) : null;
  }

  async set(key, value, ...args) {
    if (args.includes("NX") && this.store.has(key)) {
      return null;
    }
    this.store.set(key, String(value));
    return "OK";
  }

  async mget(keys) {
    return keys.map((k) => (this.store.has(k) ? String(this.store.get(k)) : null));
  }

  async incr(key) {
    const cur = parseInt(this.store.get(key) || 0, 10);
    const next = cur + 1;
    this.store.set(key, String(next));
    return next;
  }

  async incrby(key, amount) {
    const cur = parseInt(this.store.get(key) || 0, 10);
    const next = cur + parseInt(amount, 10);
    this.store.set(key, String(next));
    return next;
  }

  async expire(key, seconds) {
    return 1;
  }

  async del(key) {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  multi() {
    const operations = [];
    const multiObj = {
      incrby: (k, amt) => {
        operations.push(() => this.incrby(k, amt));
        return multiObj;
      },
      incr: (k) => {
        operations.push(() => this.incr(k));
        return multiObj;
      },
      expire: (k, sec) => {
        operations.push(() => this.expire(k, sec));
        return multiObj;
      },
      set: (k, v, ...args) => {
        operations.push(() => this.set(k, v, ...args));
        return multiObj;
      },
      exec: async () => {
        const results = [];
        for (const op of operations) {
          results.push(await op());
        }
        return results;
      },
    };
    return multiObj;
  }

  async eval(script, numkeys, ...args) {
    const keys = args.slice(0, numkeys);
    const argv = args.slice(numkeys);

    // 1. RELEASE_LOCK_LUA logic (Owner token safe release)
    if (script.includes('if redis.call("get", KEYS[1]) == ARGV[1] then')) {
      const lockKey = keys[0];
      const ownerToken = String(argv[0]);
      if (this.store.get(lockKey) === ownerToken) {
        this.store.delete(lockKey);
        return 1;
      }
      return 0;
    }

    // 2. RESERVE_TOKENS_LUA logic
    if (script.includes("GROQ_DAILY_BUDGET_EXCEEDED") || script.includes("RESERVED")) {
      const provider = argv[0];
      const reserve = parseInt(argv[1], 10);
      const maxProvider = parseInt(argv[2], 10);
      const maxTotal = parseInt(argv[3], 10);
      const maxRpm = parseInt(argv[4], 10);
      const maxRpd = parseInt(argv[5], 10);
      const maxTpm = parseInt(argv[6], 10);

      const groqDailyKey = keys[0];
      const geminiDailyKey = keys[1];
      const totalDailyKey = keys[2];
      const groqRpmKey = keys[3];
      const groqRpdKey = keys[4];
      const groqTpmKey = keys[5];

      if (provider === "groq") {
        const rpm = parseInt(this.store.get(groqRpmKey) || 0, 10);
        if (rpm >= maxRpm) return ["ERR", "GROQ_RPM_EXCEEDED"];

        const rpd = parseInt(this.store.get(groqRpdKey) || 0, 10);
        if (rpd >= maxRpd) return ["ERR", "GROQ_RPD_EXCEEDED"];

        const tpm = parseInt(this.store.get(groqTpmKey) || 0, 10);
        if (tpm + reserve > maxTpm) return ["ERR", "GROQ_TPM_EXCEEDED"];

        const groqDaily = parseInt(this.store.get(groqDailyKey) || 0, 10);
        if (groqDaily + reserve > maxProvider) return ["ERR", "GROQ_DAILY_BUDGET_EXCEEDED"];

        const totalDaily = parseInt(this.store.get(totalDailyKey) || 0, 10);
        if (totalDaily + reserve > maxTotal) return ["ERR", "TOTAL_DAILY_BUDGET_EXCEEDED"];

        this.store.set(groqDailyKey, String(groqDaily + reserve));
        this.store.set(totalDailyKey, String(totalDaily + reserve));
        this.store.set(groqRpmKey, String(rpm + 1));
        this.store.set(groqRpdKey, String(rpd + 1));
        this.store.set(groqTpmKey, String(tpm + reserve));

        return ["OK", "RESERVED"];
      } else if (provider === "gemini") {
        const geminiDaily = parseInt(this.store.get(geminiDailyKey) || 0, 10);
        if (geminiDaily + reserve > maxProvider) return ["ERR", "GEMINI_DAILY_BUDGET_EXCEEDED"];

        const totalDaily = parseInt(this.store.get(totalDailyKey) || 0, 10);
        if (totalDaily + reserve > maxTotal) return ["ERR", "TOTAL_DAILY_BUDGET_EXCEEDED"];

        this.store.set(geminiDailyKey, String(geminiDaily + reserve));
        this.store.set(totalDailyKey, String(totalDaily + reserve));

        return ["OK", "RESERVED"];
      }
      return ["ERR", "INVALID_PROVIDER"];
    }

    // 3. RECONCILE_TOKENS_LUA logic
    if (script.includes("RECONCILED")) {
      const provider = argv[0];
      const delta = parseInt(argv[1], 10);
      const providerDailyKey = keys[0];
      const totalDailyKey = keys[1];
      const groqTpmKey = keys[2];

      const curProv = parseInt(this.store.get(providerDailyKey) || 0, 10);
      this.store.set(providerDailyKey, String(Math.max(0, curProv + delta)));

      const curTotal = parseInt(this.store.get(totalDailyKey) || 0, 10);
      this.store.set(totalDailyKey, String(Math.max(0, curTotal + delta)));

      if (provider === "groq" && groqTpmKey) {
        const curTpm = parseInt(this.store.get(groqTpmKey) || 0, 10);
        this.store.set(groqTpmKey, String(Math.max(0, curTpm + delta)));
      }

      return ["OK", "RECONCILED"];
    }

    // 4. CHECK_RATE_LIMIT_LUA logic
    if (script.includes("IP_RATE_LIMIT_EXCEEDED") || script.includes("GLOBAL_RATE_LIMIT_EXCEEDED")) {
      const ipKey = keys[0];
      const globalKey = keys[1];
      const maxIp = parseInt(argv[0], 10);
      const maxGlobal = parseInt(argv[1], 10);

      const globalReq = parseInt(this.store.get(globalKey) || 0, 10);
      if (globalReq >= maxGlobal) return ["ERR", "GLOBAL_RATE_LIMIT_EXCEEDED"];

      const ipReq = parseInt(this.store.get(ipKey) || 0, 10);
      if (ipReq >= maxIp) return ["ERR", "IP_RATE_LIMIT_EXCEEDED"];

      this.store.set(ipKey, String(ipReq + 1));
      this.store.set(globalKey, String(globalReq + 1));

      return ["OK", "ALLOWED"];
    }

    return ["OK", "DONE"];
  }

  clear() {
    this.store.clear();
  }
}

module.exports = {
  MockRedis,
};
