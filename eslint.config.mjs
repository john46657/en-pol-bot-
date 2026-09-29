export default {
  root: true,
  parserOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
  },
  env: {
    es2024: true,
    node: true,
  },
  ignorePatterns: ['dist', 'build', '.next', 'out', '.turbo', 'coverage', 'src/generated'],
};
