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

## Pacote 2C: repetição segura de inclusões

- Cliente e equipe enviam uma identificação aleatória da tentativa ao criar reserva; a equipe faz o mesmo ao adicionar à fila. Ela permanece igual quando os mesmos dados são reenviados após uma resposta perdida e muda após sucesso ou alteração do formulário.
- A identificação e a impressão digital dos dados ficam na sessão do navegador. Nome e telefone não são guardados nessa cópia da tentativa.
- O servidor confere a tentativa dentro da transação. Se já foi concluída, devolve o registro original sem ocupar vagas novamente, duplicar auditoria ou gerar outra mensagem. A mesma identificação com dados diferentes é recusada.
- A fila passou a usar uma transação na criação; a proteção funciona entre aparelhos simultâneos. Clientes usando uma versão antiga do site sem identificação continuam aceitos durante a transição.
- Erros transitórios de gravação ou leitura retornam uma orientação para reenviar os mesmos dados; a equipe vê quando uma inclusão anterior foi recuperada.
- Custo: uma leitura pontual adicional do registro da tentativa por nova inclusão protegida; não há listener, consulta periódica ou serviço novo. A busca antiga de possíveis reservas duplicadas por telefone ainda precisa da revisão do próximo grupo.

Os testes de rotas usam Firebase simulado, sem criar reservas, clientes ou mensagens reais. A confirmação no ambiente publicado deve ser feita sem repetir dados operacionais apenas para teste.

## Pacote 2D: abertura de contingência no aplicativo da equipe

- O aplicativo prepara as páginas de entrada, visão geral, reservas e fila após validar a sessão do colaborador. Guarda apenas a estrutura estática das páginas, os arquivos do Next.js e o logo; respostas de API, dados de cliente, consultas do Firebase e respostas RSC não entram nesse cache.
- Ao abrir ou navegar sem rede, ou se a hospedagem devolver erro temporário 5xx, o navegador pode usar essas páginas previamente preparadas. A sessão salva do Firebase ainda precisa existir no mesmo aparelho. As listas usam as cópias locais já existentes, exigem dados do dia e mostram o horário da cópia e o aviso de somente consulta.
- A navegação entre as três telas operacionais usa abertura completa quando o aparelho está sem internet, evitando depender das requisições de navegação RSC do Next.js. Novas reservas, edição, cancelamentos e atendimento da fila continuam bloqueados sem conexão.
- A preparação acontece uma vez por versão do cache nesse navegador e acessa apenas arquivos do site. Não cria listener, polling, leitura ou gravação no Firestore. O logo oficial é servido como arquivo estático para poder aparecer offline.
- Para preparar esta versão, cada aparelho precisa abrir o aplicativo conectado ao menos uma vez após a publicação. Sem sessão anterior, cópia local válida ou espaço de armazenamento no navegador, não é possível consultar offline. Revogação de acesso feita enquanto o aparelho está offline só pode ser conhecida na reconexão; não se deve tratar essa cópia como registro definitivo.
- Três testes simulam preparo, reabertura sem rede, erro da hospedagem e exclusão de APIs/dados de cliente do cache. O Chrome local confirmou a reabertura da entrada sem rede e as três páginas preparadas. A navegação completa e a abertura real em Android/iOS continuam pendentes de teste no próprio aparelho da equipe.

## Pacote 2E: consulta pública, celular, avisos e contingência

- Consulta pública passa a usar telefone e data extraída do código. Limita a consulta a 21 documentos para detectar excesso, em vez de examinar até 50 reservas do telefone. Aceita telefone com ou sem código do Brasil e reservas antigas sem campo de código gravado.
- Quando almoço e rodízio geram o mesmo código para o mesmo telefone e dia, o cliente escolhe a reserva correta antes de confirmar, alterar ou cancelar. A operação seguinte confere código, telefone e documento escolhido. O ID interno não substitui a verificação do cliente.
- A lista de reservas no celular ganhou resumo curto antes dos cards; filtros avançados ficam recolhidos e podem ser abertos com um toque. A fila mantém o botão principal de atendimento acima das ações secundárias, com alvos de toque maiores. Navegação inferior ganhou legibilidade e contraste.
- Um aparelho da equipe que já autorizou notificações renova a inscrição ao abrir, voltar ao primeiro plano ou recuperar a rede, no máximo uma vez por dia se estiver saudável. Após falha, aguarda ao menos 15 minutos até uma nova oportunidade; não existe temporizador periódico. O sino aberto não repete cadastro desnecessariamente.
- A contingência exibe claramente que a fila é uma cópia deste aparelho, potencialmente diferente de outros. Teste em Chrome móvel simulado cobriu consulta ambígua, navegação de 360 px, cópia local da fila e reservas, reabertura em nova aba sem internet, bloqueio de alterações e reconexão. O service worker também foi testado com duas janelas abertas e nenhuma janela aberta para os avisos push.
- Não foi adicionado listener Firestore, polling, nova consulta periódica nem armazenamento de resposta de API no service worker. A renovação da inscrição envolve uma chamada ao servidor quando necessária; a consulta pública faz leituras proporcionais aos registros daquele telefone e data.

### Limites de validação

Testes locais e navegador simulado não substituem um teste em dois aparelhos reais com o aplicativo instalado, em primeiro e segundo plano, especialmente no iOS. O recebimento depende da permissão do sistema operacional, da inscrição do aparelho e do serviço de push. Não foram criadas reservas nem enviadas mensagens reais para validar este pacote. A contingência é somente de leitura, depende de sessão e cópia recentes no mesmo aparelho, e deve ser reconferida com o Firebase assim que a conexão voltar. O robô do WhatsApp não foi alterado.

Não enviar credenciais, contas de serviço, caches de sessão nem a compilação local com configuração fictícia ao repositório.
