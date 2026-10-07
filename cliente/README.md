# Área do Cliente — Radar
Fonte da interface: cliente/. O domínio é ofertas.marcianomarcoss.com.br.

## Recursos
- Ofertas da função radar-client-offers, filtros e tratamento de falhas com tempo limite.
- Favoritos locais: salvos apenas neste navegador. Nenhum preço é reutilizado offline.
- PWA com ícones PNG, Apple Touch Icon, service worker e botão de instalação.
- Web Push por aparelho: ativação voluntária, filtro por texto/preço, teste e desativação.
- Cron radar-client-push-5min no Supabase a cada 5 minutos; no máximo um aviso por hora por aparelho, somente observações posteriores à assinatura e com menos de 24 horas.
- O aparelho precisa permitir notificações. No iOS, instalar na Tela de Início antes de ativar.
- Não há login nem sincronização de favoritos entre aparelhos nesta versão.

## Publicação
Há publicação de branch e workflow cliente no Pages existente. Os arquivos de interface na raiz são espelhos de cliente/ para ambos publicarem o mesmo conteúdo. Alterações devem manter esses espelhos sincronizados até unificar a configuração do Pages.
O coletor, WhatsApp, Telegram e VPS não fazem parte desta publicação.

## Backend
backend/radar-client-offers.ts contém a correção de parâmetros ausentes.
backend/radar-client-push.ts é a Edge Function com autenticação por token aleatório do aparelho e token privado para o dispatcher.
backend/push-schema.sql registra as tabelas. RLS e revogação de privilégios bloqueiam acesso direto por anon/authenticated. Somente service_role opera as tabelas.
Chaves VAPID e token de despacho existem apenas na tabela radar_push_config restrita ao servidor; nunca colocar chaves privadas no GitHub.
backend/push-cron.sql registra o agendamento. A função usa a API pública de ofertas e não altera o coletor.
As entregas são reservadas antes do envio para evitar duplicação em falhas incertas; uma falha pode perder aquele aviso.
Assinaturas expiradas (404/410) são desativadas.

## Verificação
node --check cliente/app.js
node --check cliente/push.js
node --check cliente/sw.js
O teste tests/client.cjs usa Playwright e Edge no ambiente local. Usa dados fictícios apenas no teste; não publica ofertas de teste.
A confirmação física da notificação exige usar “Enviar notificação de teste” em um aparelho com permissão concedida.

