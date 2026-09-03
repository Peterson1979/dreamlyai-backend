console.log("R2_ACCOUNT_ID:", process.env.R2_ACCOUNT_ID ? "SET" : "MISSING");

const { loadR2Config } = require("./social/storageConfig");

try {
  const config = loadR2Config(process.env);
  console.log("R2 CONFIG: VALID");
  console.log("endpoint:", config.endpoint);
} catch (e) {
  console.log("R2 CONFIG: FAILED");
  console.log(e.message);
}
