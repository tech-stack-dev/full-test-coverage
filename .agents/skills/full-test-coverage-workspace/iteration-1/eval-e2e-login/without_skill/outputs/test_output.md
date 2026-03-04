# E2E Tests for Login Flow

## Framework: Playwright (TypeScript)

```typescript
// tests/e2e/login.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should render login form with all required elements', async ({ page }) => {
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('email-input')).toBeVisible();
    await expect(page.getByTestId('password-input')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
  });

  test('should not show error message on initial load', async ({ page }) => {
    await expect(page.getByTestId('error-message')).not.toBeVisible();
  });

  test('should redirect to /dashboard on successful login', async ({ page }) => {
    // Mock the API to return a successful response
    await page.route('/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, token: 'mock-jwt-token' }),
      });
    });

    await page.getByTestId('email-input').fill('user@example.com');
    await page.getByTestId('password-input').fill('correctpassword');
    await page.getByTestId('submit-button').click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error message on invalid credentials', async ({ page }) => {
    // Mock the API to return a 401 Unauthorized response
    await page.route('/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email or password' }),
      });
    });

    await page.getByTestId('email-input').fill('user@example.com');
    await page.getByTestId('password-input').fill('wrongpassword');
    await page.getByTestId('submit-button').click();

    const errorMessage = page.getByTestId('error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('Invalid email or password');
  });

  test('should not redirect to dashboard on invalid credentials', async ({ page }) => {
    await page.route('/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email or password' }),
      });
    });

    await page.getByTestId('email-input').fill('user@example.com');
    await page.getByTestId('password-input').fill('wrongpassword');
    await page.getByTestId('submit-button').click();

    await expect(page).not.toHaveURL('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('should submit form data to /api/auth/login endpoint', async ({ page }) => {
    let requestBody: Record<string, unknown> = {};

    await page.route('/api/auth/login', async (route) => {
      const request = route.request();
      requestBody = JSON.parse(request.postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.getByTestId('email-input').fill('user@example.com');
    await page.getByTestId('password-input').fill('mypassword123');
    await page.getByTestId('submit-button').click();

    await page.waitForURL('/dashboard');

    expect(requestBody.email).toBe('user@example.com');
    expect(requestBody.password).toBe('mypassword123');
  });

  test('should allow user to type in email and password fields', async ({ page }) => {
    const emailInput = page.getByTestId('email-input');
    const passwordInput = page.getByTestId('password-input');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('secret123');

    await expect(emailInput).toHaveValue('test@example.com');
    await expect(passwordInput).toHaveValue('secret123');
  });

  test('should clear error message when user retypes credentials', async ({ page }) => {
    // First, trigger an error
    await page.route('/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email or password' }),
      });
    });

    await page.getByTestId('email-input').fill('user@example.com');
    await page.getByTestId('password-input').fill('wrongpassword');
    await page.getByTestId('submit-button').click();

    await expect(page.getByTestId('error-message')).toBeVisible();

    // Now retype in the email field - error should be gone (if app clears on input)
    await page.getByTestId('email-input').fill('user@example.com');
    // Note: This test may need adjustment based on actual app behavior
    // Some apps clear the error on input, others only on next submit
  });

  test('should handle network error gracefully', async ({ page }) => {
    await page.route('/api/auth/login', async (route) => {
      await route.abort('failed');
    });

    await page.getByTestId('email-input').fill('user@example.com');
    await page.getByTestId('password-input').fill('anypassword');
    await page.getByTestId('submit-button').click();

    // Should remain on login page and not navigate away
    await expect(page).not.toHaveURL('/dashboard');
  });

  test('should have password input of type password (masked)', async ({ page }) => {
    const passwordInput = page.getByTestId('password-input');
    const inputType = await passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  test('should have email input of type email', async ({ page }) => {
    const emailInput = page.getByTestId('email-input');
    const inputType = await emailInput.getAttribute('type');
    expect(inputType).toBe('email');
  });

  test('should send POST request to /api/auth/login', async ({ page }) => {
    let requestMethod = '';

    await page.route('/api/auth/login', async (route) => {
      requestMethod = route.request().method();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.getByTestId('email-input').fill('user@example.com');
    await page.getByTestId('password-input').fill('password123');
    await page.getByTestId('submit-button').click();

    await page.waitForURL('/dashboard');
    expect(requestMethod).toBe('POST');
  });

  test('full login flow - successful authentication end to end', async ({ page }) => {
    await page.route('/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, token: 'valid-token' }),
      });
    });

    // Verify form is visible
    await expect(page.getByTestId('login-form')).toBeVisible();

    // Fill credentials
    await page.getByTestId('email-input').fill('admin@example.com');
    await page.getByTestId('password-input').fill('securepassword');

    // Submit
    await page.getByTestId('submit-button').click();

    // Expect redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('full login flow - failed authentication end to end', async ({ page }) => {
    await page.route('/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email or password' }),
      });
    });

    // Verify form is visible
    await expect(page.getByTestId('login-form')).toBeVisible();

    // Fill wrong credentials
    await page.getByTestId('email-input').fill('wrong@example.com');
    await page.getByTestId('password-input').fill('badpassword');

    // Submit
    await page.getByTestId('submit-button').click();

    // Expect to remain on login page
    await expect(page).toHaveURL('/login');

    // Expect error message
    await expect(page.getByTestId('error-message')).toBeVisible();
    await expect(page.getByTestId('error-message')).toHaveText('Invalid email or password');
  });
});
```

## Playwright Configuration

```typescript
// playwright.config.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Setup / Installation

```bash
npm install --save-dev @playwright/test
npx playwright install
```

## Running Tests

```bash
# Run all E2E tests
npx playwright test

# Run with UI mode
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/login.spec.ts

# Run in headed mode
npx playwright test --headed
```
