import hooks from 'eslint-plugin-react-hooks';
import parser from '@typescript-eslint/parser';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'dist-web/**', 'release/**', '.expo/**'] },
  {
    files: ['App.tsx', 'src/**/*.{ts,tsx}', 'modules/**/*.{ts,tsx}'],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
