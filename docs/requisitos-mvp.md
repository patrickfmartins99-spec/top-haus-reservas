# Sistema de Reservas — Top Haus

## Escopo do MVP

Aplicação web responsiva para reservas de almoço e rodízio, painel dos colaboradores, fila de espera, auditoria e comunicação por WhatsApp. Clientes reservam sem criar conta; cada colaborador possui acesso individual.

## Acesso da equipe

- O colaborador entra somente com nome de usuário e senha.
- O sistema cria um e-mail técnico invisível no formato `usuario@staff.reservastophausnavega.firebaseapp.com` para autenticação no Firebase.
- Administradores podem criar, bloquear, desbloquear e redefinir senhas dos colaboradores.
- Colaboradores gerenciam reservas e fila de espera, mas não administram usuários.
- Senhas existem somente no Firebase Authentication e nunca são armazenadas no Firestore ou na auditoria.

## Regras operacionais

- Funcionamento regular de terça-feira a domingo. Segundas-feiras fechadas, com abertura excepcional configurável.
- Almoço: terça a sexta, das 11h às 14h; sábados e domingos, das 11h às 14h30.
- Horários reserváveis no almoço: 11h, 11h15 e 11h30.
- Rodízio: das 19h às 23h, com abertura da casa às 18h30.
- Horários reserváveis no rodízio: 18h30, 18h45 e 19h.
- Antecedência mínima de 24 horas e máxima de 12 meses.
- Tolerância de 10 minutos a partir do horário escolhido.
- Cancelamento pelo link até 24 horas antes; depois disso, atendimento manual por WhatsApp.
- Crianças e bebês contam na quantidade de lugares.
- Até 20 pessoas: confirmação automática se houver capacidade.
- Acima de 20 pessoas: solicitação pendente de aprovação manual.
- A cota é de 70 pessoas reservadas por serviço. Solicitações pendentes também ocupam temporariamente essa cota.
- Não há sinal ou pagamento antecipado.

## Mesas

- 44 mesas informadas: 37 mesas de quatro lugares e 7 mesas de dois lugares.
- Essa distribuição soma 162 lugares físicos; o total mencionado de 164 precisa ser conferido antes do cadastro definitivo.
- Mesas podem ser combinadas; um agrupamento automático atende até 20 pessoas.
- Sofás têm quatro lugares e não podem ser combinados.
- O cliente não escolhe nem registra preferência de lugar. A atribuição final pertence à equipe.

## Mensagens

- Confirmação imediata para reservas automáticas.
- Aviso de solicitação em análise para grupos acima de 20.
- Aviso após aprovação ou recusa manual.
- Aviso de cancelamento.
- Lembrete 48 horas antes, exceto quando a reserva for criada dentro dessa janela.
- Aviso de atraso e cancelamento após os 10 minutos de tolerância.

## Auditoria

Toda criação, alteração, aprovação, cancelamento e mudança de situação registra data, horário, valores anteriores e novos, além do autor: cliente, colaborador ou automação.

## Fila de espera

Registra nome, WhatsApp, quantidade de pessoas, horário de entrada, posição e situação. O tempo decorrido é calculado automaticamente e atualizado a cada segundo; ao chamar o cliente, o tempo de espera é congelado. A mensagem de chamada informa que a mesa ficará disponível por 3 minutos. A ordem base é de chegada, permitindo acomodar um grupo menor quando surgir capacidade compatível sem remover os demais.

## Automação de WhatsApp

Criações e mudanças relevantes geram eventos na coleção `whatsappQueue`. O robô local acompanha os eventos com situação `pending`, assume cada mensagem antes de enviar para evitar duplicidade, escolhe o texto pelo `eventType` e registra o resultado como `sent`, `failed` ou `ignored`, incluindo data de processamento e eventual erro. Na primeira execução, mensagens antigas ficam bloqueadas por padrão para evitar contatos indevidos.
