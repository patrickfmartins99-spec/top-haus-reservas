# Contas, permissões e layout — setembro de 2026

- Administrador: cria, edita nome/usuário/foto/senha/cargo, bloqueia e exclui acessos. A exclusão exige digitar o usuário e não apaga reservas ou auditoria.
- A própria conta administrativa não pode ser bloqueada, excluída ou rebaixada pelo titular. Outro administrador pode realizar essas ações. As alterações são serializadas e o cargo do autor é consultado novamente, evitando rebaixamentos cruzados que deixem a casa sem administrador.
- Colaborador: menu com Painel geral, Reservas e Fila de espera. O botão do perfil abre Configurações → Minha conta. Mensagens operacionais continuam acessíveis a partir das reservas.
- Minha conta permite editar nome de exibição, usuário, senha e foto. Nunca aceita cargo, UID, bloqueio ou permissões no corpo da requisição.
- Toda nova senha precisa de confirmação no formulário e no servidor. Mudanças dos próprios dados de acesso exigem autenticação recente e encerram a sessão. Senhas não são gravadas na auditoria.
- Fotos: JPG, PNG ou WebP até 5 MB na seleção. O navegador recorta/reduz; o servidor valida e reprocessa para JPEG 256×256 sem metadados. Miniaturas ficam na coleção privada staffProfilePhotos; não é necessário configurar um bucket público.
- Reservas do dia aparecem antes dos indicadores no painel. A listagem começa filtrada em hoje e oferece Hoje/Todas as datas. Cards exibem nome, horário, pessoas, situação, contato, mesa e observações sem rolagem horizontal.

## Segurança e validação

Todas as operações do aplicativo já usam rotas do servidor. As regras Firestore agora negam acesso direto dos SDKs cliente, inclusive a usuários autenticados, para impedir contorno dos controles e acesso à auditoria por colaboradores. O Admin SDK usado pelo servidor não é bloqueado.

Política publicada: rulesets/9487e2ca-b984-42ec-91c0-65aa5e305ea7.
Política anterior preservada no Firebase: rulesets/01cf3fd1-53cb-4037-8c45-dbe77c00aaf0.

Testes isolados: scripts/accounts.test.cjs e scripts/reservation-flows.test.cjs.
Teste de interface: scripts/reservation-ui.test.mjs com APIs e autenticação simuladas, sem alterar usuários ou reservas reais.

Authentication e Firestore não compartilham transação. Em falha parcial de rede, a interface orienta atualizar a lista antes de repetir; exclusões registram intenção antes de remover o acesso. As fotos não são publicadas no perfil público do Firebase Authentication.
