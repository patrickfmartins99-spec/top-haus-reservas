# Robô de WhatsApp — Reservas Top Haus

Este programa fica aberto no computador do restaurante e acompanha a coleção `whatsappQueue` do Firestore em tempo real. Ele usa a mesma base do robô do programa de fidelidade (`whatsapp-web.js`), mas trabalha com o projeto Firebase do sistema de reservas.

Na versão 2.1, o robô também atualiza `robotStatus/reservas-whatsapp` a cada minuto. Esse registro permite que a Central de pendências mostre a conexão do WhatsApp e do Firebase, o último envio, a quantidade de mensagens pendentes ou com erro, a revisão diária das 15h e a versão em execução. O sinal não consulta reservas nem dados de clientes.

## Primeira configuração

1. Instale o Node.js 20 ou mais recente.
2. Mantenha o arquivo privado da conta de serviço do Firebase fora do GitHub.
3. Copie `.env.example` para `.env` e informe em `FIREBASE_SERVICE_ACCOUNT_PATH` o caminho completo desse arquivo.
4. Abra o CMD nesta pasta e execute `npm install`.
5. Execute `npm run test:firebase` para conferir a chave sem abrir o WhatsApp.
6. Execute `npm start` ou abra `iniciar-robo.cmd`.
7. Na primeira vez, escaneie o QR Code com o WhatsApp oficial do restaurante.

Depois da autenticação, a sessão fica salva somente nesse computador. Nas próximas inicializações, normalmente não será necessário escanear novamente.

O Puppeteer opera em modo oculto, sem abrir janela de navegador. Para encerrar, prefira Ctrl+C e aguarde a saída do robô antes de fechar o CMD. A proteção de instância impede abrir duas cópias usando a mesma sessão.

Para verificar a inicialização sem enviar mensagens, execute `node index.js --verificar-whatsapp`. O diagnóstico encerra o navegador ao concluir ou após 60 segundos.

No uso diário, abra o CMD, entre na pasta do robô e execute `node index.js`. A sessão persistente fica em `.sessao-whatsapp` e é separada do WhatsApp Web normal e do robô de Fidelidade.

O estado CONNECTED sozinho não libera a fila. O robô verifica sincronização e as funções de envio antes de consultar, assumir e enviar mensagens. Se os auxiliares não carregarem, tenta inicializá-los com o código da versão instalada da biblioteca e verifica novamente. Falhas anteriores não são reenviadas automaticamente.

## Recuperação de mensagens

O robô consulta o Firestore por REST a cada 2 segundos, evitando depender de conexões contínuas que algumas redes bloqueiam. Por padrão, ele recupera mensagens pendentes criadas nas últimas 24 horas. Pendências mais antigas são marcadas como `ignored`, evitando o envio tardio de testes antigos.

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
