import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const passwordFile = process.env.PILOT_ADMIN_PASSWORD_FILE;
if (!passwordFile) throw new Error('Set PILOT_ADMIN_PASSWORD_FILE to the isolated platform secret file.');
const adminPassword = readFileSync(passwordFile, 'utf8').trim();
const fixturePassword = 'Pilot-fixture-changed-2026!';
const screenshotDir = '../docs/screenshots/platform-pilot';
const suffix = () => randomUUID().slice(0, 8);

type Account = { id: string; username: string; role: string; credentialVersion: number };
type Created = { restaurant: { id: string }; credentials: { account: Account; temporaryPassword: string }[] };
async function write(api: APIRequestContext, path: string, data: unknown, scope = 'store', method = 'POST') {
  const csrfPath = scope === 'platform' ? '/api/platform/auth/csrf' : scope === 'guest' ? '/api/public/csrf' : '/api/auth/csrf';
  const token = await (await api.get(csrfPath)).json();
  return api.fetch(path, { method, data, headers: { 'X-CSRF-TOKEN': token.token } });
}
async function okWrite(api: APIRequestContext, path: string, data: unknown, scope = 'store', method = 'POST') {
  const response = await write(api, path, data, scope, method);
  expect(response.ok(), `${method} ${path}: ${response.status()}`).toBeTruthy();
  return response.status() === 204 ? null : response.json();
}
async function loginPlatform(page: Page) {
  await page.goto('/platform/login');
  await page.locator('[name=username]').fill(process.env.PILOT_ADMIN_USERNAME ?? 'platform.admin');
  await page.locator('[name=password]').fill(adminPassword);
  await page.getByRole('button', { name: '登录平台', exact: true }).click();
  await expect(page).toHaveURL(/\/platform\/restaurants/);
}
async function createUI(page: Page, tag: string) {
  await page.locator('#create-name').fill(`试运营 ${tag}`);
  await page.locator('#create-owner').fill(`owner.${tag}`);
  await page.locator('#create-staff').fill(`staff.${tag}`);
  const response = page.waitForResponse(r => r.url().endsWith('/api/platform/restaurants') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '创建餐厅与两个账号', exact: true }).click();
  const created: Created = await (await response).json();
  await expect(page.getByTestId('temporary-OWNER')).toBeVisible();
  // Values are read only in process memory, never attached to reports or written to storage.
  const ownerPassword = (await page.getByTestId('temporary-OWNER').textContent())!;
  const staffPassword = (await page.getByTestId('temporary-STAFF').textContent())!;
  const persisted = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(persisted.includes(ownerPassword) || persisted.includes(staffPassword)).toBe(false);
  await page.getByRole('button', { name: '已保存，关闭密码展示' }).click();
  await expect(page.getByTestId('temporary-OWNER')).toHaveCount(0);
  return created;
}
async function loginAndChange(page: Page, username: string, password: string) {
  await page.goto('/staff/login');
  await page.locator('[name=username]').fill(username);
  await page.locator('[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/change-password/);
  await page.locator('[name=currentPassword]').fill(password);
  await page.locator('[name=newPassword]').fill(fixturePassword);
  await page.locator('[name=confirmPassword]').fill(fixturePassword);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/staff(?:\?|$)/);
}
async function screenshot(page: Page, name: string) {
  await expect(page.locator('[data-testid^=temporary-]')).toHaveCount(0);
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
}

test('desktop: platform creation, three identities, two tenants, ordering, suspended checkout and history', async ({ page, browser }) => {
  let storeMeCalls = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/auth/me') storeMeCalls++; });
  await loginPlatform(page);
  const tag = suffix();
  const a = await createUI(page, tag);
  expect(storeMeCalls).toBe(0);
  await page.getByRole('link', { name: `管理 试运营 ${tag}`, exact: true }).click();
  await page.getByRole('button', { name: '启用餐厅服务', exact: true }).click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByRole('button', { name: '停用餐厅服务', exact: true })).toBeEnabled();
  await screenshot(page, 'desktop-restaurant');
  const bTag = suffix();
  const b: Created = await okWrite(page.request, '/api/platform/restaurants', {
    id: randomUUID(), name: `隔离餐厅 ${bTag}`, defaultLanguage: 'zh', ownerUsername: `owner.${bTag}`, staffUsername: `staff.${bTag}`,
  }, 'platform');
  const owner = a.credentials.find(c => c.account.role === 'OWNER')!;
  const staff = a.credentials.find(c => c.account.role === 'STAFF')!;
  await loginAndChange(page, owner.account.username, owner.temporaryPassword);
  const category = await okWrite(page.request, '/api/owner/menu/categories', { nameZh: '演练菜品' });
  await okWrite(page.request, '/api/owner/menu/items', { categoryId: category.id, nameZh: '番茄意面', priceCents: 1250, allergenCodes: ['GLUTEN'], allergenReviewed: true });
  const table = await okWrite(page.request, '/api/owner/tables', { tableLabel: 'P1' });
  await okWrite(page.request, '/api/staff/accepting-orders', { enabled: true }, 'store', 'PATCH');
  const opened = await okWrite(page.request, `/api/staff/tables/${table.id}/open`, {});
  const other = await browser.newContext({ baseURL: process.env.PILOT_BASE_URL ?? 'https://localhost:8443', ignoreHTTPSErrors: true });
  const otherOwner = b.credentials.find(c => c.account.role === 'OWNER')!;
  await okWrite(other.request, '/api/auth/login', { username: otherOwner.account.username, password: otherOwner.temporaryPassword });
  await okWrite(other.request, '/api/auth/change-password', { currentPassword: otherOwner.temporaryPassword, newPassword: fixturePassword });
  expect((await other.request.get(`/api/staff/sessions/${opened.session.id}/bill`)).status()).toBe(404);
  expect((await other.request.get('/api/platform/restaurants')).status()).toBe(401);
  await other.close();
  await page.goto(table.qrPath);
  await page.locator('#guest-join-code').fill(opened.joinCode);
  await page.getByRole('button', { name: '验证入桌码', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已加入本轮用餐' })).toBeVisible();
  await page.getByRole('button', { name: /加入购物车/ }).click();
  await page.getByRole('button', { name: '核对订单', exact: true }).click();
  await page.getByRole('button', { name: '确认并下单', exact: true }).click();
  await expect(page.getByText('订单已收到', { exact: true })).toBeVisible();
  await screenshot(page, 'desktop-guest-order');
  // All three cookies coexist. Logging out the platform leaves Store and Guest valid.
  const cookies = await page.context().cookies();
  expect(['TavoloFlow.Platform', 'TavoloFlow.Store', 'TavoloFlow.Guest'].every(n => cookies.some(c => c.name === n))).toBe(true);
  const guestToken = await (await page.request.get('/api/public/csrf')).json();
  const crossed = await page.request.patch(`/api/platform/restaurants/${a.restaurant.id}/service-status`, {
    data: { status: 'SUSPENDED' }, headers: { 'X-CSRF-TOKEN': guestToken.token },
  });
  expect(crossed.status()).toBe(400);
  expect((await crossed.json()).code).toBe('CSRF_VALIDATION_FAILED');
  await page.goto(`/platform/restaurants/${a.restaurant.id}`);
  await page.getByRole('button', { name: '停用餐厅服务', exact: true }).click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByRole('button', { name: '启用餐厅服务', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '退出平台', exact: true }).click();
  await expect(page).toHaveURL(/platform\/login/);
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  expect((await page.request.get(`/api/public/sessions/${opened.session.id}/orders`)).status()).toBe(200);
  // Staff can finish existing work while the service is suspended.
  const staffContext = await browser.newContext({ baseURL: process.env.PILOT_BASE_URL ?? 'https://localhost:8443', ignoreHTTPSErrors: true });
  const staffPage = await staffContext.newPage();
  await loginAndChange(staffPage, staff.account.username, staff.temporaryPassword);
  await staffPage.goto('/staff/kitchen');
  await staffPage.getByRole('button', { name: '整单完成', exact: true }).click();
  await expect(staffPage.getByRole('button', { name: '整单完成', exact: true })).toHaveCount(0);
  await staffContext.close();
  await page.goto(`/staff/orders?sessionId=${opened.session.id}`);
  await page.getByRole('button', { name: '核对收款并清桌', exact: true }).click();
  await page.getByRole('checkbox', { name: '已核对桌号和金额，并完成线下收款' }).check();
  await page.getByRole('button', { name: '已线下收款并清桌', exact: true }).click();
  await expect(page.getByRole('heading', { name: /P1 桌 · 本轮已结束/ })).toBeVisible();
  await page.getByRole('link', { name: '查看历史账单', exact: true }).click();
  await expect(page.getByRole('heading', { name: '历史账单', exact: true })).toBeVisible();
  await expect(page.getByText('番茄意面', { exact: false })).toBeVisible();
  await screenshot(page, 'desktop-history');
  await page.goto('/staff/settings');
  await page.getByRole('button', { name: '重置 STAFF 密码', exact: true }).click();
  await page.getByRole('button', { name: '确认重置', exact: true }).click();
  await expect(page.getByTestId('temporary-STAFF')).toBeVisible();
  await page.getByRole('button', { name: '已保存，关闭密码展示' }).click();
  await screenshot(page, 'desktop-staff-settings');
  // Leave a separate active fixture for a later key-ring restart / restore drill.
  await loginPlatform(page);
  await okWrite(page.request, `/api/platform/restaurants/${a.restaurant.id}/service-status`, { status: 'ACTIVE' }, 'platform', 'PATCH');
  const spare = await okWrite(page.request, `/api/staff/tables/${table.id}/open`, {});
  writeFileSync('/tmp/tavoloflow-pilot-fixture.json', JSON.stringify({ restaurantId: a.restaurant.id, tableId: table.id,
    sessionId: spare.session.id, closedSessionId: opened.session.id, ownerUsername: owner.account.username }), { mode: 0o600 });
});

test('mobile: lost create/reset responses recover only by GET; passwords clear on close, navigation and visibility', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginPlatform(page);
  const tag = suffix();
  let createWrites = 0, resetWrites = 0;
  let restaurantId = '';
  await page.route('**/api/platform/restaurants', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    createWrites++;
    restaurantId = route.request().postDataJSON().id;
    const response = await route.fetch(); expect(response.status()).toBe(201);
    await route.abort('failed');
  });
  await page.locator('#create-name').fill(`恢复演练 ${tag}`);
  await page.locator('#create-owner').fill(`owner.${tag}`);
  await page.locator('#create-staff').fill(`staff.${tag}`);
  await page.getByRole('button', { name: '创建餐厅与两个账号', exact: true }).click();
  await page.getByRole('button', { name: '查询原操作结果', exact: true }).click();
  await expect(page.getByText(/已查到餐厅/)).toBeVisible();
  expect(createWrites).toBe(1);
  await page.goto(`/platform/restaurants/${restaurantId}`);
  await page.route('**/reset-password', async route => {
    resetWrites++;
    const response = await route.fetch(); expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: '重置 STAFF 密码', exact: true }).click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await page.getByRole('button', { name: '查询原操作结果', exact: true }).click();
  await expect(page.getByText(/临时密码无法再次读取/)).toBeVisible();
  expect(resetWrites).toBe(1);
  await expect(page.getByTestId('temporary-STAFF')).toHaveCount(0);
  await page.unroute('**/reset-password');
  await page.getByRole('button', { name: '重置 STAFF 密码', exact: true }).click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByTestId('temporary-STAFF')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('temporary-STAFF')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: '重置 STAFF 密码', exact: true }).click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByTestId('temporary-STAFF')).toBeVisible();
  await page.getByRole('link', { name: '餐厅管理', exact: true }).click();
  await page.goto(`/platform/restaurants/${restaurantId}`);
  await expect(page.getByTestId('temporary-STAFF')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, 'mobile-restaurant');
  await page.getByRole('button', { name: '重置 OWNER 密码', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '管理操作确认' })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
});
