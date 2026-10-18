import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase } from '../server/db';
import { DiskStorage } from '../server/storage';
import { createApp } from '../server/app';

export function setup(start = '2026-10-14T10:00:00Z') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-test-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  const clock = { now: new Date(start) };
  const app = createApp({
    db,
    storage: new DiskStorage(path.join(dir, 'objects')),
    auth: { ownerEmail: 'matteo@example.com', password: 'segreta', secureCookie: false },
    clock: () => clock.now,
    placeholderLogo: path.resolve('public/logo-placeholder.svg'),
  });
  const agent = request.agent(app);
  const login = () => agent.post('/api/auth/login').send({ email: 'matteo@example.com', password: 'segreta' }).expect(200);
  const load = async () => (await agent.get('/api/data').expect(200)).body.data;
  const act = async (action: string, payload: object, status = 200) => {
    const res = await agent.post('/api/data').set('X-Requested-With', 'workcenter').send({ action, payload }).expect(status);
    return res.body;
  };
  const setTime = (iso: string) => (clock.now = new Date(iso));
  return { app, agent, login, load, act, setTime, db, dir };
}
