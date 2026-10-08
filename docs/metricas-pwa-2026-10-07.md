# Métricas do PWA — Mundo das Ferramentas

## Onde consultar

No projeto Supabase, acesse **SQL Editor** e execute:

```sql
select * from public.radar_client_metrics_daily order by day desc limit 30;
```

Para ofertas mais clicadas:

```sql
select offer_item_id, clicks, unique_visitors
from public.radar_client_metrics_products
order by clicks desc limit 30;
```

Para totais acumulados:

```sql
select
 count(*) filter (where event_type='offer_click') as clicks,
 count(*) filter (where event_type='app_share') as shares,
 count(distinct visitor_id) filter (where event_type='install') as detected_installs
from public.radar_client_events;
```

## Definições e limites

- Instalação: confirmação `appinstalled` no navegador; iOS pode não emitir esse evento. Não representa downloads de loja.
- Clique: abertura de link afiliado na Área do Cliente; não é venda nem garante carregamento do destino.
- Compartilhamento: ação bem-sucedida no menu nativo ou cópia do convite; não comprova envio ao destinatário.
- Um visitante é um identificador aleatório persistido localmente no navegador; não registra nome, telefone ou IP na tabela.
- A coleta começa na publicação da versão 17. Não há histórico retroativo.
- A tabela tem RLS ativo e não concede SELECT a usuários anônimos.
- A instrumentação é analítica, não antifraude; eventos originados de clientes podem sofrer automação.
- A integração visual no painel administrativo é uma etapa posterior; consultar pelo SQL Editor enquanto não estiver pronta.
