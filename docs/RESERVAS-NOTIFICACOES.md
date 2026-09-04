# Reservas e notificações — setembro de 2026

## Operação

- Rodízio: criação de reservas até 18h do dia da visita, no horário de Brasília. O horário escolhido de chegada permanece entre 18h30 e 19h.
- Almoço: mantém a antecedência mínima configurada (24 horas por padrão).
- Alterações, cancelamentos e exclusões pelo cliente continuam limitados a 24 horas antes da chegada. Depois, atendimento manual pela equipe.
- Exclusão lógica: a reserva some das listas e libera capacidade uma única vez. Dados e auditoria permanecem no banco; não há restauração pela interface nem apagamento definitivo de dados pessoais neste fluxo.
- Mesa é um campo interno livre (até 40 caracteres), disponível na visão geral e na listagem. Não reserva uma mesa física automaticamente, não detecta conflitos entre mesas e não é exposto ao cliente.
- A atribuição da mesa salva somente esse campo, sem sobrescrever os demais dados nem gerar aviso ao cliente. A auditoria mostra quem alterou e os valores anterior e novo.

## Mensagens manuais

A aba Mensagens exibe até 100 pendências e os modelos de texto. Novos eventos recebem `manual_pending`, que não é consumido pelo robô antigo. Eventos antigos não são reenviados nem migrados automaticamente. O computador com o robô deve permanecer parado; esta mudança não encerra processos locais nem altera pendências antigas.

Abrir WhatsApp não envia a mensagem. Após enviar na conversa, o colaborador usa Já enviei e confirma; o sistema registra `manual_sent` e a autoria, sem afirmar entrega ou leitura. Textos desatualizados têm alertas e podem ser descartados. A chamada da fila vence três minutos depois da ação Chamar no painel, não depois de abrir o WhatsApp.

## Notificações do cliente

Somente o sino dentro do site, sem pedido de permissão e sem envio para o celular. O acesso usa um token exclusivo da reserva salvo no aparelho. A consulta por código e WhatsApp recupera esse acompanhamento em outro aparelho. O sino atualiza a cada 30 segundos com o site visível e ao voltar à página. A leitura é marcada localmente.

## Notificações no celular da equipe

- Acessar o site do colaborador, entrar com usuário individual e abrir o sino → Ativar no celular → Enviar teste.
- No iPhone, adicionar o painel à Tela de Início e abrir pelo ícone (iOS 16.4+); no Android, usar navegador compatível, como Chrome.
- Somente colaboradores autenticados podem registrar um aparelho. As inscrições são vinculadas ao usuário, duram 30 dias e são renovadas quando os controles são abertos. Ao sair da conta, a inscrição do navegador é desativada.
- Criação, aprovação, edição, cancelamento, exclusão e mudanças de situação das reservas geram avisos. Entradas, alterações, chamadas e saídas da fila também.
- Atribuição interna de mesa não gera aviso ao cliente.
- Os avisos na tela bloqueada não incluem nome, telefone nem detalhes pessoais. O toque abre o painel, que exige login.
- A equipe também recebe as atualizações no sino do painel.
- O envio depende da permissão, do aparelho, da conexão e do serviço de push. A confirmação do provedor não comprova exibição no celular.
- Não há lembretes agendados de 48 horas, cancelamento automático por atraso nem retentativas periódicas nesta entrega.

## Implementação e permissões

Coleções privadas: `staffPushSubscriptions`, `staffNotifications`, `systemSecrets`, `customerNotificationAccess` e subcoleções de notificações de reservas. Clientes não têm rota de cadastro de push. As chaves Web Push são geradas pelo servidor na primeira ativação autorizada e guardadas em `systemSecrets/webPush`; a chave privada nunca sai do servidor.

As regras publicadas foram consultadas e o bloqueio padrão cobre essas coleções. As sondagens REST sem autenticação retornaram 403. Nenhuma regra foi relaxada. O script `scripts/check-published-rules.mjs` faz somente leituras.

As inscrições aceitam somente destinos HTTPS dos serviços Google, Mozilla e Apple. Cada envio confere que o colaborador ainda está ativo. Inscrições vencidas são ignoradas e destinos removidos (404/410) são descartados. A disputa pelo evento usa transação para evitar duplicidade entre as duas publicações.

Os eventos são gravados na mesma transação ou lote da ação. O envio é tentado pelo `after` do Next.js. Eventos com mais de 30 minutos não são enviados como avisos novos. Falhas ficam registradas; o sino funciona independentemente do push. Não há cache offline de dados pessoais.

## Validação e publicação

- Testes isolados das regras, rotas, autoria das inscrições, exclusão lógica, capacidade, prazos e mensagens.
- Compilação de produção e verificação TypeScript.
- Teste de navegador com autenticação e APIs simuladas, sem criar reservas reais ou mandar WhatsApp.
- Publicar os sites da equipe e do cliente a partir do mesmo commit.
- Depois da publicação, o colaborador precisa autorizar no celular e usar Enviar teste. A entrega visual só será considerada validada quando confirmada no aparelho.
