/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testTimeout: 15000,
  moduleNameMapper: {
    '^@portfolio/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
};
