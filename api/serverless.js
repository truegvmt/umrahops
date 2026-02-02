// Vercel Serverless Function Entry Point
// This wraps the built Express app for Vercel's serverless environment

const path = require('path');

// Import the built app
const appModule = require(path.join(process.cwd(), 'dist', 'index.cjs'));

// The build exports as 'default' in ESM, which becomes 'default' property in CJS
const app = appModule.default || appModule;

module.exports = app;
