// Read-only validation. Never print credentials, access tokens or document data.
import { JWT } from 'google-auth-library';
const project = process.env.FIREBASE_PROJECT_ID;
if (project !== 'reservastophausnavega') throw new Error('Projeto inesperado; verificação interrompida.');
const client = new JWT({ email: process.env.FIREBASE_CLIENT_EMAIL, key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
try {
  const { data: release } = await client.request({ url: `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore` });
  const { data: rules } = await client.request({ url: `https://firebaserules.googleapis.com/v1/${release.rulesetName}` });
  console.log(JSON.stringify({ release: release.name, ruleset: release.rulesetName, files: rules.source.files.map((file) => ({ name: file.name, content: file.content })) }));
} catch (error) { console.log(JSON.stringify({ rulesApiStatus: error.response?.status ?? 'unavailable' })); }
for (const name of ['systemSecrets/webPush', 'staffPushSubscriptions/probe-read-only', 'staffNotifications/probe-read-only', 'customerNotificationAccess/probe-read-only', 'reservations/probe-read-only/notifications/probe']) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${name}?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`);
  console.log(JSON.stringify({ path: name, unauthenticatedReadStatus: response.status }));
}
