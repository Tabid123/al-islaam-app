import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const dashboard = read('src/pages/SimpleAdminDashboard.tsx');
const virtualDevice = read('src/components/admin/SomlinkDashboardDevice.tsx');
const manualForm = read('src/components/admin/simple/SomlinkManualView.tsx');
const manualServer = read('src/lib/somlink.functions.ts');

test('Somlink shows inside the existing dashboard two-column physical devices grid', () => {
  assert.match(dashboard, /Devices & SIM Balances/);
  assert.match(dashboard, /grid grid-cols-2 gap-2/);
  assert.match(dashboard, /<SomlinkDashboardDevice isSo=\{isSo\} \/>/);
  assert.match(virtualDevice, /SIM: Somlink/);
  assert.match(virtualDevice, /<Plus className="w-3 h-3"/);
  assert.match(virtualDevice, /onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(virtualDevice, /SomlinkManualView isSo=\{isSo\} embedded/);
  assert.match(virtualDevice, /bg-purple-600/);
});

test('Somlink card is read-only until server configuration and manual permission', () => {
  assert.match(virtualDevice, /api\/public\/somlink-status/);
  assert.match(virtualDevice, /data\.configured === true/);
  assert.match(virtualDevice, /if \(configured !== true\) return null/);
  assert.match(virtualDevice, /can\('manage_settings'\) && can\('manual_transactions'\)/);
  assert.match(virtualDevice, /disabled=\{loading \|\| !canManual\}/);
  assert.match(virtualDevice, /Last reported/);
  assert.match(virtualDevice, /Not live/);
  assert.doesNotMatch(virtualDevice, /SOMLINK_PASSWORD|service_role/);
});

test('category must be chosen before only its packages are shown', () => {
  assert.match(manualForm, /from\('package_categories'\)/);
  assert.match(manualForm, /from\('data_packages_config'\)/);
  assert.match(manualForm, /from\('providers_config'\)/);
  assert.match(manualForm, /provider_name\.trim\(\)\.toLowerCase\(\) === 'somlink'/);
  assert.match(manualForm, /category_id === categoryId/);
  assert.match(manualForm, /filteredPackages\.map/);
  assert.match(manualForm, /disabled=\{!categoryId \|\| sending/);
  assert.match(manualForm, /setCategoryId\(e\.target\.value\); setPackageId\(''\)/);
  assert.ok(manualForm.indexOf('id="somlink-manual-category"') < manualForm.indexOf('id="somlink-manual-package"'));
});

test('manual sending verifies Somlink 64 prefix, API bundle and amount before paid dispatch', () => {
  assert.match(manualForm, /\^64\\d\{7\}\$/);
  assert.match(manualForm, /window\.confirm\(prompt\)/);
  assert.match(manualForm, /Number\(selected\.cost_price\)/);
  assert.match(manualForm, /sendingLock\.current/);
  assert.match(manualForm, /Check Orders before retrying/);
  assert.match(manualServer, /\^64\\d\{7\}\$/);
  assert.match(manualServer, /provider\?\.provider_name\?\.trim\(\)\.toLowerCase\(\) !== "somlink"/);
  assert.match(manualServer, /\.eq\("is_active", true\)/);
  assert.match(manualServer, /\.gt\("cost_price", 0\)/);
  assert.match(manualServer, /\.gt\("selling_price", 0\.01\)/);
  assert.match(manualServer, /supabase\.rpc\("is_admin"\)/);
});
