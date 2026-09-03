# Top Haus Reservas

Primeira base do sistema de reservas do restaurante Top Haus, preparada para Next.js, Netlify e Firebase.

## O que já está disponível

- Reserva pública para almoço e rodízio.
- Horários de chegada e tolerância configurados conforme as regras do restaurante.
- Grupos de até 20 pessoas com confirmação automática e grupos maiores sujeitos a aprovação.
- Limite transacional de 70 lugares por serviço.
- Fila de espera com tempo decorrido calculado automaticamente a partir do horário de entrada.
- Login individual da equipe com Firebase Authentication.
- Login por nome de usuário, com e-mail técnico invisível gerado automaticamente.
- Gestão administrativa para criar, bloquear, desbloquear e redefinir acessos.
- Protótipo responsivo do painel, da fila de espera e da auditoria.
- Regras de segurança e índices iniciais do Firestore.

## Executar localmente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local` e preencha as configurações.
3. Inicie com `npm run dev`.
4. Abra `http://localhost:3000`.

Sem as credenciais, o formulário funciona em modo de demonstração e não grava dados.

## Conectar o Firebase

1. Registre um aplicativo Web no projeto Firebase existente.
2. Ative o Cloud Firestore e o provedor E-mail/senha em Authentication.
3. Preencha as variáveis públicas e privadas descritas em `.env.example`.
4. Publique `firestore.rules` e `firestore.indexes.json` no projeto correto.
5. Cadastre cada colaborador com usuário individual e atribua a custom claim `staff: true` por uma operação administrativa segura.

Nunca envie ou salve a chave privada da conta de serviço no GitHub. No Netlify, cadastre as variáveis privadas em **Site configuration → Environment variables**.

## Implantação no Netlify

O arquivo `netlify.toml` já define o comando de build e a saída do Next.js. Conecte o mesmo repositório a dois projetos no Netlify:

- Site do cliente: configure `APP_SURFACE=cliente`.
- Site do colaborador: configure `APP_SURFACE=colaborador`.

No endereço principal `reservastophaus.netlify.app`, a aplicação também reconhece automaticamente a experiência do colaborador quando a variável ainda não foi cadastrada. O site público do cliente deve usar um endereço iniciado por `cliente.` ou `cliente-` e manter `APP_SURFACE=cliente`.

Depois, cadastre as demais variáveis de ambiente e execute uma implantação de teste antes de publicar em produção.

O endereço `/api/status` verifica no servidor se Firebase Authentication e Firestore estão realmente acessíveis. A página de entrada da equipe exibe esse resultado sem revelar nenhuma credencial.

## Robô de WhatsApp

Cada ação que pode gerar uma mensagem cria um documento na coleção `whatsappQueue`. O robô executado no computador do restaurante pode acompanhar essa coleção em tempo real, escolher o texto pelo campo `eventType`, enviar a mensagem e atualizar o documento de `pending` para `sent` ou `failed`.

Os eventos contêm somente os dados operacionais necessários: telefone de destino, tipo da ação, código da reserva ou da fila e os dados usados na mensagem. Tokens e credenciais do WhatsApp nunca devem ser gravados no Firestore nem enviados ao navegador.

## Documentação do produto

As regras consolidadas estão em `docs/requisitos-mvp.md`.
