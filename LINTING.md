# Linting and Formatting Guide

This project uses ESLint for code linting and Prettier for code formatting. The configuration has been set up to ensure these tools work together without conflicts.

## Available Commands

- `npm run lint`: Check for ESLint errors and warnings
- `npm run lint:fix`: Automatically fix ESLint errors where possible
- `npm run format`: Format all TypeScript files using Prettier
- `npm run format:check`: Check if all files are properly formatted without making changes

## Configuration Files

- `.eslintrc.cjs`: ESLint configuration
- `.prettierrc.json`: Prettier configuration
- `.eslintignore`: Files ignored by ESLint
- `.prettierignore`: Files ignored by Prettier
- `.vscode/settings.json`: VS Code integration settings

## VS Code Integration

For the best development experience in VS Code, install the following extensions:

1. ESLint (`dbaeumer.vscode-eslint`)
2. Prettier - Code formatter (`esbenp.prettier-vscode`)

With these extensions and the provided settings, your code will be automatically formatted on save, and ESLint errors will be highlighted in the editor.

## Key Features

### ESLint Rules

- Enforces TypeScript best practices
- Ensures consistent code style
- Sets appropriate naming conventions
- Has special relaxed rules for test files

### Prettier Configuration

- Uses a line width of 100 characters
- Uses 2 spaces for indentation
- Uses single quotes for strings
- Adds trailing commas in objects and arrays
- Ensures LF line endings for cross-platform compatibility

## How They Work Together

ESLint is configured with `eslint-config-prettier` to disable any rules that might conflict with Prettier. This way:

1. ESLint handles code quality issues
2. Prettier handles code formatting

When you run `npm run lint:fix` followed by `npm run format`, your code will be both correct and consistently formatted. 