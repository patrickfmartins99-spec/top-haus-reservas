// Isolated account tests: fake Authentication/Firestore; no production users are changed.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript');
let db, auth, staff, admin;
const cache = new Map();
let serial = 0;
class DB {
  data = new Map();
  collection(name) {
    const db = this;
    const query = (filter) => ({
      get: async () => ({
        docs: [...db.data]
          .filter(
            ([k, v]) =>
              k.startsWith(name + '/') &&
              !k.slice(name.length + 1).includes('/') &&
              (!filter || v[filter[0]] === filter[1]),
          )
          .map(([k, v]) => ({
            id: k.split('/').pop(),
            data: () => v,
            ref: db.collection(name).doc(k.split('/').pop()),
          })),
      }),
    });
    return {
      doc(id = 'id' + ++serial) {
        const key = name + '/' + id;
        return {
          id,
          key,
          get: async () => ({
            exists: db.data.has(key),
            data: () => db.data.get(key),
          }),
          set: async (v) => db.data.set(key, v),
        };
      },
      where: (k, op, v) => query([k, v]),
      ...query(),
    };
  }
  batch() {
    const ops = [],
      db = this;
    const b = {
      set: (r, v, o) => {
        ops.push(() =>
          db.data.set(r.key, o?.merge ? { ...db.data.get(r.key), ...v } : v),
        );
        return b;
      },
      update: (r, v) => {
        ops.push(() => db.data.set(r.key, { ...db.data.get(r.key), ...v }));
        return b;
      },
      delete: (r) => {
        ops.push(() => db.data.delete(r.key));
        return b;
      },
      commit: async () => ops.forEach((f) => f()),
    };
    return b;
  }
  async runTransaction(fn) {
    const b = this.batch();
    const out = await fn({ ...b, get: (r) => r.get() });
    await b.commit();
    return out;
  }
}
function load(file) {
  const full = path.resolve(__dirname, '..', file);
  if (cache.has(full)) return cache.get(full);
  const m = { exports: {} };
  cache.set(full, m.exports);
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const req = (n) => {
    if (n === 'server-only') return {};
    if (n === 'firebase-admin/firestore')
      return { FieldValue: { serverTimestamp: () => 1 } };
    if (n === '@/lib/firebase/admin') return { getAdminDatabase: () => db };
    if (n === '@/lib/auth/staff-request')
      return { requireStaff: async () => staff };
    if (n === '@/lib/auth/admin-request')
      return { requireAdmin: async () => admin };
    if (n === 'next/server')
      return { NextResponse: { json: (d, o) => Response.json(d, o) } };
    if (n.startsWith('@/')) return load(n.slice(2) + '.ts');
    if (n.startsWith('.'))
      return load(
        path.relative(
          path.resolve(__dirname, '..'),
          path.resolve(path.dirname(full), n + '.ts'),
        ),
      );
    return require(n);
  };
  new Function('require', 'module', 'exports', source)(req, m, m.exports);
  return m.exports;
}
const management = load('lib/firebase/account-management.ts'),
  validation = load('lib/auth/account-validation.ts'),
  own = load('app/api/conta/route.ts'),
  other = load('app/api/admin/usuarios/[uid]/route.ts'),
  create = load('app/api/admin/usuarios/route.ts'),
  settings = load('app/api/configuracoes/route.ts');
const email = (u) => u + '@staff.reservastophausnavega.firebaseapp.com';
function fixture() {
  db = new DB();
  const users = new Map([
    [
      'admin',
      {
        uid: 'admin',
        email: email('admin'),
        displayName: 'Admin',
        disabled: false,
        customClaims: { staff: true, admin: true },
      },
    ],
    [
      'staff',
      {
        uid: 'staff',
        email: email('colaborador'),
        displayName: 'Colaborador',
        disabled: false,
        customClaims: { staff: true, admin: false },
      },
    ],
  ]);
  const calls = [];
  auth = {
    users,
    calls,
    getUser: async (uid) => {
      if (!users.has(uid))
        throw Object.assign(new Error(), { code: 'auth/user-not-found' });
      return structuredClone(users.get(uid));
    },
    updateUser: async (uid, p) => {
      calls.push('update');
      if ([...users.values()].some((u) => u.uid !== uid && u.email === p.email))
        throw Object.assign(new Error(), { code: 'auth/email-already-exists' });
      users.set(uid, { ...users.get(uid), ...p });
    },
    setCustomUserClaims: async (uid, c) => {
      calls.push('claims');
      users.get(uid).customClaims = c;
    },
    revokeRefreshTokens: async () => calls.push('revoke'),
    deleteUser: async (uid) => {
      calls.push('delete');
      users.delete(uid);
    },
  };
  staff = {
    authentication: auth,
    decodedToken: {
      uid: 'staff',
      staff: true,
      admin: false,
      auth_time: Date.now() / 1000,
    },
  };
  admin = {
    authentication: auth,
    decodedToken: {
      uid: 'admin',
      staff: true,
      admin: true,
      auth_time: Date.now() / 1000,
    },
  };
}
const payload = {
  displayName: 'Novo Nome',
  username: 'colaborador',
  password: '',
  confirmPassword: '',
};
const request = (method, p) =>
  new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });
test('self-service rejeita cargo, UID e permissões injetados', async () => {
  for (const extra of [
    { role: 'admin' },
    { uid: 'admin' },
    { admin: true },
    { disabled: false },
  ]) {
    fixture();
    const r = await own.PATCH(request('PATCH', { ...payload, ...extra }));
    assert.equal(r.status, 403);
    assert.deepEqual(auth.calls, []);
  }
});
test('rota administrativa e regras operacionais recusam colaborador', async () => {
  fixture();
  admin = null;
  assert.equal(
    (
      await other.PATCH(request('PATCH', payload), {
        params: Promise.resolve({ uid: 'admin' }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await other.DELETE(request('DELETE', {}), {
        params: Promise.resolve({ uid: 'admin' }),
      })
    ).status,
    403,
  );
  assert.equal((await settings.PATCH(request('PATCH', {}))).status, 403);
  assert.deepEqual(auth.calls, []);
});
test('edição própria preserva cargo e audita somente dados seguros', async () => {
  fixture();
  const r = await own.PATCH(request('PATCH', payload));
  assert.equal(r.status, 200);
  assert.equal(auth.users.get('staff').displayName, 'Novo Nome');
  assert.equal(auth.users.get('staff').customClaims.admin, false);
  assert.ok([...db.data.keys()].some((k) => k.startsWith('auditLogs/')));
});
test('senhas divergentes são rejeitadas na criação e edição', async () => {
  fixture();
  const p = {
    ...payload,
    password: 'senha-test-123',
    confirmPassword: 'outra',
    role: 'staff',
  };
  assert.equal((await create.POST(request('POST', p))).status, 400);
  assert.throws(() => validation.accountFields(p, false));
  assert.deepEqual(auth.calls, []);
});
test('troca de senha exige autenticação recente e nunca audita segredo', async () => {
  fixture();
  staff.decodedToken.auth_time = 1;
  const p = {
    ...payload,
    password: 'senha-test-123',
    confirmPassword: 'senha-test-123',
  };
  assert.equal((await own.PATCH(request('PATCH', p))).status, 401);
  staff.decodedToken.auth_time = Date.now() / 1000;
  const r = await own.PATCH(request('PATCH', p));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).signInAgain, true);
  assert.ok(auth.calls.includes('revoke'));
  assert.doesNotMatch(JSON.stringify([...db.data]), /senha-test-123/);
});
test('admin edita nome, usuário, cargo e bloqueio de outro usuário', async () => {
  fixture();
  const r = await other.PATCH(
    request('PATCH', {
      ...payload,
      username: 'novousuario',
      role: 'admin',
      disabled: true,
    }),
    { params: Promise.resolve({ uid: 'staff' }) },
  );
  assert.equal(r.status, 200);
  const u = auth.users.get('staff');
  assert.equal(u.email, email('novousuario'));
  assert.equal(u.customClaims.admin, true);
  assert.equal(u.disabled, true);
});
test('admin não pode excluir ou rebaixar a si mesmo', async () => {
  fixture();
  await assert.rejects(() =>
    management.removeAccount(db, auth, admin.decodedToken, 'admin', 'admin'),
  );
  await assert.rejects(() =>
    management.editAccount(
      db,
      auth,
      admin.decodedToken,
      'admin',
      { ...payload, username: 'admin', role: 'staff' },
      false,
    ),
  );
  assert.deepEqual(auth.calls, []);
});
test('exclusão exige confirmação, remove acesso e preserva histórico', async () => {
  fixture();
  db.data.set('reservations/r1', { createdBy: 'staff' });
  await assert.rejects(() =>
    management.removeAccount(db, auth, admin.decodedToken, 'staff', 'errado'),
  );
  assert.ok(auth.users.has('staff'));
  await management.removeAccount(
    db,
    auth,
    admin.decodedToken,
    'staff',
    'colaborador',
  );
  assert.equal(auth.users.has('staff'), false);
  assert.ok(db.data.has('reservations/r1'));
  assert.ok(db.data.get('staff/staff').deletedAt);
  assert.ok([...db.data.values()].some((v) => v.action === 'staff_deleted'));
});
test('admin revogado durante espera não pode alterar outro acesso', async () => {
  fixture();
  auth.users.get('admin').customClaims.admin = false;
  await assert.rejects(() =>
    management.editAccount(
      db,
      auth,
      admin.decodedToken,
      'staff',
      { ...payload, role: 'staff' },
      false,
    ),
  );
  assert.deepEqual(auth.calls, []);
});
test('foto recusa SVG e normaliza imagem raster', async () => {
  fixture();
  await assert.rejects(() =>
    management.normalizePhoto('data:image/svg+xml;base64,AAAA'),
  );
  const sharp = require('sharp');
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#8c4b28' },
  })
    .png()
    .toBuffer();
  const photo = await management.normalizePhoto(
    'data:image/png;base64,' + png.toString('base64'),
  );
  assert.match(photo, /^data:image\/jpeg;base64,/);
  const meta = await sharp(
    Buffer.from(photo.split(',')[1], 'base64'),
  ).metadata();
  assert.equal(meta.width, 256);
  assert.equal(meta.height, 256);
});
