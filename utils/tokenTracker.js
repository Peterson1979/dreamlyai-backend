// utils/tokenTracker.js
// Deprecated: Redis-backed token budgeting is now handled directly by utils/budget.js

const { getBudgetStatus } = require("./budget");

async function getTokenStatus() {
  return await getBudgetStatus();
}

module.exports = {
  getTokenStatus,
};
