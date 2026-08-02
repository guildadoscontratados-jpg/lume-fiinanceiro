# Lume Financeiro

Sistema local para controle de cartões, despesas e responsáveis.

## Executar localmente

```powershell
npm.cmd run dev
```

Abra `http://localhost:3000` no navegador.

## Banco de dados local

O desenvolvimento usa SQLite em `prisma/dev.db`. Esse arquivo contém dados financeiros locais e não é enviado ao Git.

Para recriar o banco durante o desenvolvimento:

```powershell
npx.cmd prisma migrate dev
```

## Verificações

```powershell
npm.cmd run lint
npm.cmd run build
```

No futuro, a aplicação poderá usar PostgreSQL em produção alterando a fonte de dados do Prisma e criando uma migration apropriada.
