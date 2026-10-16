import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { signAdmin } from '../auth/auth.guard';
import { hashPassword, verifyPassword } from '../auth/password';
import { testDatabase } from './test-database';

test('password hashes use independent salts and preserve the exact password', async () => {
  const password = '  a long Tamil தமிழ் passphrase  ';
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
});

test('password API requires current credentials, revokes sessions, and survives restart without exposing hashes', async (t) => {
  const fixture = await testDatabase();
  const names = ['ADMIN_PASSWORD', 'ADMIN_USERNAME', 'AUTH_SECRET'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const original = randomUUID(), replacement = `new-${randomUUID()}`;
  Object.assign(process.env, { ADMIN_PASSWORD: original, ADMIN_USERNAME: 'test-admin', AUTH_SECRET: randomUUID() });
  const start = async () => {
    const server = await NestFactory.create(AppModule, { logger: false });
    server.setGlobalPrefix('api'); await server.listen(0, '127.0.0.1'); return server;
  };
  let app = await start(), base = `${await app.getUrl()}/api`;
  t.after(async () => {
    await app.close(); await fixture.close();
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  });
  const request = (path: string, method = 'GET', body?: unknown, token = '') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = (password: unknown) => request('/auth/login', 'POST', { username: 'TEST-ADMIN', password });
  const oldToken = (await (await login(original)).json() as { accessToken: string }).accessToken;
  const secondToken = signAdmin('test-admin');
  const change = { currentPassword: original, newPassword: replacement, confirmPassword: replacement };
  const before = await (await request('/catalog')).json();
  assert.equal((await request('/auth/password', 'POST', change)).status, 401);
  for (const body of [null, {}, { ...change, currentPassword: 123 }, { ...change, currentPassword: 'wrong' },
    { ...change, newPassword: 'short', confirmPassword: 'short' }, { ...change, newPassword: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) },
    { ...change, confirmPassword: 'different-password' }, { ...change, newPassword: original, confirmPassword: original },
    { ...change, newPassword: ' '.repeat(12), confirmPassword: ' '.repeat(12) }]) {
    assert.equal((await request('/auth/password', 'POST', body, oldToken)).status, 400);
  }
  assert.equal(await fixture.database.adminCredential(), null);
  assert.equal((await request('/admin/configuration', 'GET', undefined, oldToken)).status, 200);
  const changed = await request('/auth/password', 'POST', change, oldToken);
  assert.equal(changed.status, 200);
  assert.equal(changed.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await changed.json(), { message: 'Password changed. Sign in with your new password.' });
  const credential = await fixture.database.adminCredential();
  assert.ok(credential);
  assert.ok(!credential.passwordHash.includes(replacement));
  assert.equal(await verifyPassword(replacement, credential.passwordHash), true);
  for (const token of [oldToken, secondToken, signAdmin('test-admin'), signAdmin('another-admin', credential.version)]) {
    assert.equal((await request('/admin/configuration', 'GET', undefined, token)).status, 401);
    assert.equal((await request('/auth/password', 'POST', change, token)).status, 401);
  }
  assert.equal((await login(original)).status, 401);
  assert.equal((await login({ password: replacement })).status, 401);
  const signedIn = await login(replacement);
  assert.equal(signedIn.status, 201);
  const newToken = (await signedIn.json() as { accessToken: string }).accessToken;
  const config = await request('/admin/configuration', 'GET', undefined, newToken);
  assert.equal(config.status, 200);
  const serialized = JSON.stringify(await config.json());
  assert.ok(!serialized.includes(credential.passwordHash));
  assert.ok(!serialized.includes('passwordHash'));
  assert.deepEqual(await (await request('/catalog')).json(), before);

  await app.close();
  // Neither redeploying with an old bootstrap password nor removing it resets the saved password.
  delete process.env.ADMIN_PASSWORD;
  app = await start(); base = `${await app.getUrl()}/api`;
  assert.equal((await login(replacement)).status, 201);
  assert.equal((await login(original)).status, 401);
  assert.equal((await request('/admin/configuration', 'GET', undefined, oldToken)).status, 401);
  assert.equal((await request('/admin/configuration', 'GET', undefined, newToken)).status, 200);
  assert.deepEqual(await fixture.database.adminCredential(), credential);
});

test('concurrent password changes cannot overwrite a completed change, before or after initialization', async (t) => {
  const fixture = await testDatabase();
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = randomUUID();
  t.after(async () => { await fixture.close(); if (previous === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previous; });
  const first = new AuthService(fixture.database), second = new AuthService(fixture.database);
  let current = process.env.ADMIN_PASSWORD;
  for (let round = 0; round < 2; round++) {
    const candidates = [randomUUID(), randomUUID()];
    const results = await Promise.allSettled([first, second].map((auth, index) => auth.changePassword({ currentPassword: current, newPassword: candidates[index], confirmPassword: candidates[index] })));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const winner = results.findIndex((result) => result.status === 'fulfilled');
    current = candidates[winner];
    const credential = await fixture.database.adminCredential();
    assert.ok(credential);
    assert.equal(await verifyPassword(current, credential.passwordHash), true);
    assert.equal(await verifyPassword(candidates[1 - winner], credential.passwordHash), false);
    assert.equal((await second.login(second.username, current)).version, credential.version);
  }
});
