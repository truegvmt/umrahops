// Vercel Serverless Function Entry Point
// Loads the transpiled Express app (not bundled)

const path = require('path');

// Import the transpiled app from dist/server/
const appModule = require(path.join(process.cwd(), 'dist', 'server', 'index.js'));

// The build exports as 'default' in ESM, which becomes 'default' property in CJS
const app = appModule.default || appModule;

module.exports = app;
