module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/db/dashboard.db',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  // Run test files sequentially to avoid port/DB conflicts
  maxWorkers: 1,
};
