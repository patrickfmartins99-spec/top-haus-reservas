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

## Próximos grupos, ainda não entregues neste pacote

1. Sincronização por evento entre os painéis, revisão do custo das notificações e status de mensagens; preservar heartbeat de 15 minutos do robô e evitar polling.
2. Revisão da fila (contagem de 3 minutos, concorrência e feedback), contingência offline e revisão completa do restante da navegação móvel.
3. Consulta pública: reduzir busca por telefone, testar formatação de número e ambiguidades de código entre serviços. O formulário foi validado com resposta simulada; isso não comprova disponibilidade do banco de produção.

Publicar em grupos após validação. Não enviar credenciais, contas de serviço, caches de sessão nem a compilação local com configuração fictícia ao repositório.
