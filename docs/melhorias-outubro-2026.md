# Melhorias operacionais — outubro de 2026

## Pacote 1: operação diária e instalação

- Equipe autenticada pode criar reservas fora do prazo online e ultrapassar a cota; clientes continuam com as regras atuais. Dias fechados, horários de chegada, limite de 12 meses e prevenção de duplicidade continuam valendo.
- Exceções preservam o total real de lugares e registram responsável, cota e prazo na auditoria. A edição pela equipe também permite ampliar lugares acima da cota.
- Aprovar e recusar diretamente nos cards. Recusa exige motivo; ambas geram os eventos já utilizados pelo WhatsApp e pelo sino da equipe.
- A decisão usa transação e repetição idempotente: duas ações concorrentes não aprovam e recusam a mesma solicitação. Aprovar não soma novamente os lugares já retidos pela solicitação.
- Edição aberta carrega apenas a reserva selecionada e compara sua última atualização antes de salvar, para evitar sobrescrever uma alteração intermediária.
- Reservas do dia são a entrada padrão. Links de avisos consultam um documento; reserva recém-criada abre sua data. Histórico é explícito, paginado em 50 registros; filtros locais não consultam Firebase ao digitar.
- Filtros por situação, serviço e reservas sem mesa; atualização de status/mesa no estado local e cópia de contingência sem recarregar toda a lista.
- Clientes que chegaram desaparecem da lista de atendimento, mas continuam na contagem de lugares reservados do serviço.
- Comunicação pública positiva e cartões de decisão com bom contraste e alvos de toque maiores.
- Manifesto em rota explícita `/entrar/manifest.webmanifest`, instalação oferecida apenas em `/entrar`, abertura em `/entrar`, logo oficial + RESERVAS, fundo preto. A sessão salva é encaminhada ao painel quando aberto como aplicativo instalado.
- Ícones pré-gerados no build: nenhuma consulta ao Firebase para ícone, manifesto ou tela de abertura.

## Verificações

Testes de regras e rotas usam Firebase simulado. Testes de interface usam navegador oculto, autenticação fictícia e respostas interceptadas, sem mensagens ou reservas reais.

- `node --test scripts/reservation-flows.test.cjs scripts/accounts.test.cjs tests/*.test.mjs`
- Compilação Next.js de produção e análise estática dos arquivos alterados.
- Interface: cliente, consulta, login, aprovação/recusa, mesa, cancelamento, fila, contas, relatórios, contingência de leitura e ausência de rolagem lateral em 360/390 px.
- Manifesto/ícones verificados por HTTP. Instalação e splash nativos em Android/iOS ainda precisam de teste em aparelho físico. O sistema operacional decide a apresentação do splash nativo; a verificação de sessão interna usa a mesma identidade visual.

## Consumo

Nenhum temporizador de consulta ao Firebase foi adicionado. O histórico consulta até 51 documentos por página (50 exibidos + um para detectar continuação), com uma leitura adicional do cursor nas páginas seguintes. A consulta por dia preserva o teto anterior de 200 registros e informa continuação pela API. Abrir uma reserva específica consulta um documento. Os filtros e contadores visuais são locais.

As notificações e o robô existentes não foram reconfigurados neste pacote. Não há garantia de disponibilidade irrestrita nem de saldo final: tráfego, funções e publicações também consomem recursos. Testes locais não geram deploys no Netlify.

## Pacote 2A: sincronização por evento e custo do push

- Painel geral, reservas e fila reaproveitam o único listener do sino (20 avisos). Não foi criado outro listener, rotina agendada ou consulta periódica.
- Ao receber um evento novo, somente o registro afetado é consultado. Fila ganhou consulta autenticada por ID, com uma leitura de documento. Reservas de outra data são ignoradas quando não estão na lista atual.
- Alterações de entrega (`processing`/`sent`) do mesmo aviso não provocam nova consulta da reserva. Eventos próximos do mesmo registro são agrupados por 300 ms; isso é um atraso local acionado por evento, não polling.
- Em segundo plano, mudanças aguardam localmente até a página ficar visível. Limite de 100 registros pendentes; falhas e excesso exibem orientação de atualização manual. Feed com 20 eventos novos sem sobreposição sinaliza possível lacuna após desconexão.
- Leituras em andamento não aplicam resultados após trocar de página/filtro nem sobrescrevem uma atualização mais nova já recebida. Edições em formulário mantêm os valores digitados e a proteção de versão do pacote 1.
- Definir mesa gera somente aviso interno, com auditoria existente; não gera WhatsApp para o cliente. Repetir a mesma mesa não gera outro evento.
- Push lê a chave uma vez por lote, em vez de uma vez por aparelho por aviso. Sem evento pendente, não consulta inscrições; inscrições vencidas são excluídas da consulta. Validação dos colaboradores ativos e trava de envio permanecem.
- Corrigida a grade do menu de colaborador: quatro opções ocupam quatro colunas, incluindo Conta.

### Consumo e limites do pacote 2A

Há uma leitura do registro alterado por tela ativa interessada (mais autenticação e chamada HTTP), em vez de recarregar toda a lista. Os custos existentes do listener, consultas/retentativas do SDK e gravações de entrega continuam existindo. Não é consumo zero nem garantia contra esgotamento de cota. Atualização automática exige conexão; longas desconexões podem exigir atualização manual. Push móvel continua dependendo das permissões do aparelho e do provedor.

Testes isolados cobrem ausência de leitura sem evento, agrupamento, segundo plano, mudanças concorrentes, desmontagem da tela, falha sem loop, consulta pontual protegida, ausência de duplicidade e uma leitura de chave por lote. Não enviam mensagens reais. Robô, regras do Firebase e dados operacionais não foram alterados.

## Pacote 2B: fila e contingência de consulta

- Chamar, confirmar chegada e registrar saída agora usam uma transação: duas decisões concorrentes não encerram o mesmo atendimento de formas diferentes. Repetir a mesma chamada não reinicia o prazo nem gera outra mensagem.
- Edições com versão antiga são recusadas com orientação para conferir os dados atuais. Atendimentos encerrados não podem ser reabertos ou editados pela rota da fila.
- Contagem regressiva de três minutos nos cards da fila e da visão geral, com alerta visual ao terminar. O prazo começa na chamada no painel, não na entrega do WhatsApp. A equipe continua decidindo e registrando o motivo da saída; não há remoção automática.
- Depois de uma ação, a fila confere somente o cliente afetado, em vez de recarregar a lista inteira. Proteção local contra toque duplo; criação ainda não tem chave de idempotência para repetição após resposta perdida.
- Visão geral preserva cada carregamento bem-sucedido independentemente: falha nas reservas não descarta a fila recebida. Contingência informa quando não existe cópia de uma das áreas e apresenta o horário mais antigo entre as cópias.
- Cópias locais são limpas ao sair, trocar de usuário ou receber recusa explícita de acesso. Falha temporária de rede continua permitindo a sessão anteriormente validada, quando disponível. Cópias operacionais vencem em 18 horas e precisam pertencer ao dia atual nas telas operacionais.
- Navegador sem conexão identificada falha rapidamente, sem aguardar todo o prazo da requisição e sem enfileirar alterações offline.

### Validação e limites do pacote 2B

69 testes automatizados, incluindo chamadas simultâneas, encerramentos conflitantes, edição desatualizada, autenticação, limite de três minutos e limpeza/validade das cópias locais. Firebase simulado: nenhum teste cria cliente ou dispara mensagem em produção.

Não foi adicionado listener nem consulta periódica. A contagem é local; cada alteração faz leitura transacional do atendimento, podendo haver releituras em caso de conflito, e conferência pontual após salvar. Autenticação, eventos e entrega existentes continuam consumindo recursos. O robô não foi alterado.

Contingência não é funcionamento offline completo: exige sessão previamente validada, cópia no mesmo navegador/aparelho e tela disponível. Não permite login novo sem internet, escrita offline nem garante abertura a frio do aplicativo. Relógio incorreto do aparelho pode afetar o contador visual. Instalação, push e falha real de rede no celular ainda exigem validação em aparelho físico.

## Próximos grupos, ainda não entregues

1. Revisão do status das mensagens e confirmação de entrega no aparelho físico; preservar heartbeat de 15 minutos do robô e evitar polling.
2. Aprofundar contingência (abertura/navegação sem rede), recuperação de criação com resposta perdida e revisão completa do restante da navegação móvel.
3. Consulta pública: reduzir busca por telefone, testar formatação de número e ambiguidades de código entre serviços. O formulário foi validado com resposta simulada; isso não comprova disponibilidade do banco de produção.

Publicar em grupos após validação. Não enviar credenciais, contas de serviço, caches de sessão nem a compilação local com configuração fictícia ao repositório.
