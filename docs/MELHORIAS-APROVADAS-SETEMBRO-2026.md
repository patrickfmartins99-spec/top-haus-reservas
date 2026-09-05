# Melhorias aprovadas — setembro de 2026

## 1. Central de pendências

Tela única para mostrar somente situações que exigem atenção da equipe:

- reservas aguardando aprovação;
- reservas do dia ainda sem mesa;
- clientes chamados na fila há mais de três minutos;
- mensagens do WhatsApp com erro ou atrasadas;
- reservas próximas do horário sem chegada confirmada;
- notificações recentes ainda não resolvidas.

Cada item pode ficar como novo, assumido por um colaborador, resolvido ou dispensado. O responsável e a alteração ficam registrados na auditoria.

## 2. Monitoramento do robô

O robô publica no Firebase um sinal de funcionamento para o painel informar:

- conexão do WhatsApp;
- conexão com o Firebase;
- último sinal recebido;
- última mensagem enviada;
- mensagens pendentes e com erro;
- última revisão diária das 15h;
- versão em execução.

## 3. Calendário de exceções

O administrador pode configurar almoço e rodízio separadamente em cada data para:

- abrir uma segunda-feira ou feriado;
- fechar uma data ou apenas um serviço;
- alterar a cota de lugares;
- definir horários especiais;
- suspender temporariamente novas reservas;
- apresentar um aviso ao cliente.

As regras são validadas no servidor e também aparecem na página do cliente e na criação interna de reservas.

## 4. Proteção contra reservas repetidas

O sistema bloqueia uma nova reserva ativa com o mesmo WhatsApp, data e serviço. Reservas canceladas, concluídas ou marcadas como não comparecimento não impedem uma nova solicitação.

## 5. Notificações com fluxo de trabalho

Os avisos operacionais podem ficar como:

- nova;
- assumida por um colaborador;
- resolvida;
- dispensada.

O sino apresenta as pendências em aberto e direciona para a central, mantendo toda a equipe alinhada.

## 6. Hierarquia visual

- Central com prioridade alta destacada, responsável visível e ações agrupadas.
- Situação do robô separada das pendências de atendimento.
- Cards com borda e sombra mais nítidas.
- Indicadores reorganizados no celular sem colunas estreitas.
- Navegação móvel em uma única linha deslizável.
- Código da reserva com contraste e tamanho de leitura maiores.
