# Robô de WhatsApp — Reservas Top Haus

Este programa fica aberto no computador do restaurante e acompanha a coleção `whatsappQueue` do Firestore em tempo real. Ele usa a mesma base do robô do programa de fidelidade (`whatsapp-web.js`), mas trabalha com o projeto Firebase do sistema de reservas.

## Primeira configuração

1. Instale o Node.js 20 ou mais recente.
2. Mantenha o arquivo privado da conta de serviço do Firebase fora do GitHub.
3. Copie `.env.example` para `.env` e informe em `FIREBASE_SERVICE_ACCOUNT_PATH` o caminho completo desse arquivo.
4. Abra o CMD nesta pasta e execute `npm install`.
5. Execute `npm run test:firebase` para conferir a chave sem abrir o WhatsApp.
6. Execute `npm start` ou abra `iniciar-robo.cmd`.
7. Na primeira vez, escaneie o QR Code com o WhatsApp oficial do restaurante.

Depois da autenticação, a sessão fica salva somente nesse computador. Nas próximas inicializações, normalmente não será necessário escanear novamente.

## Segurança no primeiro uso

Por padrão, `PROCESS_EXISTING_PENDING=false`. Assim, o robô não envia mensagens antigas que já estavam pendentes antes de ele ser iniciado. Somente ações novas passam a ser processadas.

Não altere essa opção para `true` sem revisar antes a coleção `whatsappQueue`, pois isso autoriza o envio do histórico pendente.

## Situações processadas

- Reserva confirmada ou aguardando aprovação.
- Aprovação de uma reserva.
- Alteração feita pelo cliente ou colaborador.
- Cancelamento feito pelo cliente ou colaborador.
- Entrada na fila de espera.
- Atualização dos dados da fila.
- Chamada da mesa, com prazo de 3 minutos.

Cada evento é assumido por um único robô antes do envio. Depois, recebe a situação `sent`, `failed` ou `ignored`, evitando que duas instâncias enviem a mesma mensagem ao mesmo tempo.

## Observação importante

O `whatsapp-web.js` automatiza o WhatsApp Web e não é uma integração oficial da Meta. Por isso, o robô deve rodar somente no computador controlado pelo restaurante, com dependências mantidas atualizadas. O arquivo da conta de serviço e a pasta da sessão do WhatsApp são privados e nunca devem ser enviados ao GitHub.
