import { isValidUsername, normalizeUsername } from './staff-identity';
export class AccountError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function accountFields(p: Record<string, unknown>, self: boolean) {
  const allowed = new Set([
    'displayName',
    'username',
    'password',
    'confirmPassword',
    'photo',
    ...(!self ? ['role', 'disabled'] : []),
  ]);
  if (Object.keys(p).some((k) => !allowed.has(k)))
    throw new AccountError('Campo não permitido nesta edição.', 403);
  if (
    typeof p.displayName !== 'string' ||
    p.displayName.trim().length < 2 ||
    p.displayName.trim().length > 80
  )
    throw new AccountError('Informe um nome entre 2 e 80 caracteres.');
  if (typeof p.username !== 'string' || !isValidUsername(p.username))
    throw new AccountError(
      'Usuário inválido. Use entre 3 e 32 letras minúsculas, números, ponto, hífen ou sublinhado.',
    );
  const password = p.password ?? '';
  if (
    typeof password !== 'string' ||
    (password &&
      (password.length < 8 ||
        password.length > 128 ||
        password !== p.confirmPassword)) ||
    (!password && p.confirmPassword)
  )
    throw new AccountError(
      'Informe e confirme a mesma senha, entre 8 e 128 caracteres.',
    );
  if (!self && !['admin', 'staff'].includes(String(p.role)))
    throw new AccountError('Cargo inválido.');
  if (p.disabled !== undefined && typeof p.disabled !== 'boolean')
    throw new AccountError('Situação inválida.');
  return {
    displayName: p.displayName.trim(),
    username: normalizeUsername(p.username),
    password,
  };
}
