# SafeLink — J&Q Logística

Este repositório público hospeda, via GitHub Pages, a **interface web estática** do SafeLink em `app/`. O código-fonte canônico e as migrações continuam no repositório privado [safelink-jq-logistica](https://github.com/jqlogisticaadmin-netizen/safelink-jq-logistica).

- **Aplicação web:** a publicação serve apenas o frontend; autenticação e autorização dependem do Supabase Auth e das políticas RLS no PostgreSQL.
- **Segredos:** nunca adicionar senhas, tokens privados, chaves `service_role` ou dados pessoais/operacionais. A chave publishable do Supabase é configuração pública de navegador; ela não substitui RLS.
- **Estado:** MVP em validação, não certificado para operação comercial completa. A pré-visualização de planilhas ocorre no navegador; importação persistente, dashboard com métricas reais e vários módulos operacionais ainda estão pendentes.
- **Infraestrutura:** objetivo de custo R$ 0,00; não contratar planos pagos.

A publicação automática é executada por GitHub Actions após a integração validada à branch `main`. Login, recuperação de senha, redirects do Supabase, autorização negativa e isolamento entre bases ainda precisam de testes ponta a ponta antes de considerar o sistema pronto para produção.
