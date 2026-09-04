// Apply only the audited server-only access policy to the named reservation project.
import { readFileSync } from 'node:fs';
import { JWT } from 'google-auth-library';
const project = process.env.FIREBASE_PROJECT_ID;
if (project !== 'reservastophausnavega' || !process.argv.includes('--apply'))
  throw new Error('Use --apply no projeto de reservas.');
const content = readFileSync(
  new URL('../firestore.rules', import.meta.url),
  'utf8',
);
if (
  !content.includes('allow read, write: if false;') ||
  content.includes('if true')
)
  throw new Error('Regras inesperadas.');
const client = new JWT({
  email: process.env.FIREBASE_CLIENT_EMAIL,
  key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
try {
  const name = 'projects/' + project + '/releases/cloud.firestore';
  const { data: previous } = await client.request({
    url: 'https://firebaserules.googleapis.com/v1/' + name,
  });
  const { data: old } = await client.request({
    url: 'https://firebaserules.googleapis.com/v1/' + previous.rulesetName,
  });
  if (
    old.source.files.some(
      (f) => f.content.replace(/\r/g, '') === content.replace(/\r/g, ''),
    )
  ) {
    console.log('Regras já publicadas.');
    process.exit(0);
  }
  if (
    previous.rulesetName !==
    'projects/reservastophausnavega/rulesets/d3895026-fbf3-470c-b693-71b2a314271c'
  )
    throw new Error(
      'As regras mudaram desde a revisão. Publicação interrompida.',
    );
  const { data: created } = await client.request({
    url:
      'https://firebaserules.googleapis.com/v1/projects/' +
      project +
      '/rulesets',
    method: 'POST',
    data: { source: { files: [{ name: 'firestore.rules', content }] } },
  });
  await client.request({
    url: 'https://firebaserules.googleapis.com/v1/' + name,
    method: 'PATCH',
    data: {
      release: { name, rulesetName: created.name },
      updateMask: 'rulesetName',
    },
  });
  const { data: current } = await client.request({
    url: 'https://firebaserules.googleapis.com/v1/' + name,
  });
  if (current.rulesetName !== created.name)
    throw new Error('Publicação ainda não confirmada.');
  console.log(
    JSON.stringify({
      published: current.rulesetName,
      previous: previous.rulesetName,
    }),
  );
} catch (error) {
  console.error(
    'Falha na publicação das regras:',
    error.response?.status ?? error.message,
  );
  process.exit(1);
}
