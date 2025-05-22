/**
 * Jest configuration for Quantum-Safe Chat frontend tests
 */

module.exports = {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    "/node_modules/"
  ],

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    "json",
    "text",
    "lcov",
    "clover",
    "html"
  ],

  // The test environment that will be used for testing
  testEnvironment: "jsdom",

  // The glob patterns Jest uses to detect test files
  testMatch: [
    "**/tests/frontend/**/*.js"
  ],

  // An array of regexp pattern strings that are matched against all test paths
  // Jest skips tests that match these patterns
  testPathIgnorePatterns: [
    "/node_modules/"
  ],

  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.jsx?$": "babel-jest"
  },

  // Verbose output
  verbose: true,

  // Setup files to run before tests
  setupFiles: [],

  // Mock files
  moduleNameMapper: {
    // Add any module name mappings if needed
  },

  // Indicates whether each individual test should be reported during the run
  reporters: [
    "default",
    ["./node_modules/jest-html-reporter", {
      "pageTitle": "Quantum-Safe Chat Test Report",
      "outputPath": "./test_results/frontend_test_report.html",
      "includeFailureMsg": true
    }]
  ]
};