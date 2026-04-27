// Stitch (ZA banking, primary provider — Phase 4.4 / SA2).
//
// Hand-rolled GraphQL client. Stitch's primary surface is GraphQL over
// the same OAuth Bearer flow we use for Google/Microsoft. Fail-soft when
// STITCH_CLIENT_ID/SECRET aren't set: isConfigured() returns false and
// the routes degrade to "bank-link offline" copy.
//
// The full Stitch surface is large; we ship just the operations Phase 4
// needs: list accounts, list transactions with cursor, refresh balance.
// Account-link OAuth flow lives in server/auth/stitchOAuth.mjs (Phase 5
// connection wizard).

import { registerProvider } from './bankProvider.mjs';

const STITCH_API = 'https://api.stitch.money/graphql';

const isConfigured = () =>
  Boolean(process.env.STITCH_CLIENT_ID && process.env.STITCH_CLIENT_SECRET);

const refresh = async (tokens) => {
  if (!tokens?.refresh_token) {
    const err = new Error('stitch refresh_token missing');
    err.status = 401;
    throw err;
  }
  const params = new URLSearchParams({
    client_id: process.env.STITCH_CLIENT_ID ?? '',
    client_secret: process.env.STITCH_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
  });
  const response = await fetch('https://secure.stitch.money/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!response.ok) {
    const err = new Error(`stitch token refresh failed: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const body = await response.json();
  return {
    ...tokens,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + (body.expires_in ?? 3600) * 1000
  };
};

const gql = async (tokens, query, variables, onTokensRefreshed) => {
  const send = async (currentTokens) => {
    const response = await fetch(STITCH_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentTokens.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });
    return { response, currentTokens };
  };
  let { response, currentTokens } = await send(tokens);
  if (response.status === 401) {
    currentTokens = await refresh(tokens);
    onTokensRefreshed?.(currentTokens);
    ({ response } = await send(currentTokens));
  }
  if (!response.ok) {
    const err = new Error(`stitch graphql failed: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const body = await response.json();
  if (body.errors?.length) {
    const err = new Error(`stitch graphql error: ${body.errors[0].message}`);
    err.detail = body.errors;
    throw err;
  }
  return body.data;
};

const listAccounts = async (tokens, onTokensRefreshed) => {
  const data = await gql(
    tokens,
    `query Accounts {
       user {
         bankAccounts {
           id name accountNumber currency
           currentBalance { quantity }
         }
       }
     }`,
    {},
    onTokensRefreshed
  );
  return (data?.user?.bankAccounts ?? []).map((a) => ({
    externalAccountId: a.id,
    accountLabel: a.accountNumber ?? a.name,
    externalName: a.name ?? null,
    currency: a.currency ?? 'ZAR',
    lastBalanceCents: a.currentBalance?.quantity ? Math.round(Number(a.currentBalance.quantity) * 100) : null
  }));
};

const listTransactions = async (tokens, { externalAccountId, since = null, cursor = null }, onTokensRefreshed) => {
  const data = await gql(
    tokens,
    `query Tx($id: ID!, $since: Date, $after: String) {
       node(id: $id) {
         ... on BankAccount {
           transactions(after: $after, since: $since) {
             pageInfo { endCursor hasNextPage }
             nodes {
               id reference description amount { quantity } date
             }
           }
         }
       }
     }`,
    { id: externalAccountId, since, after: cursor },
    onTokensRefreshed
  );
  const tx = data?.node?.transactions ?? { nodes: [], pageInfo: {} };
  return {
    transactions: (tx.nodes ?? []).map((t) => {
      const amountCents = Math.round(Number(t.amount?.quantity ?? 0) * 100);
      return {
        externalId: t.id,
        title: t.description ?? t.reference ?? 'Transaction',
        amountCents: Math.abs(amountCents),
        currency: 'ZAR',
        txDate: (t.date ?? '').slice(0, 10),
        kind: amountCents < 0 ? 'outflow' : 'inflow',
        category: null,
        merchantName: t.reference ?? null
      };
    }),
    nextCursor: tx.pageInfo?.hasNextPage ? tx.pageInfo.endCursor : null
  };
};

const refreshBalance = async (tokens, externalAccountId, onTokensRefreshed) => {
  const data = await gql(
    tokens,
    `query Balance($id: ID!) {
       node(id: $id) {
         ... on BankAccount { currentBalance { quantity } }
       }
     }`,
    { id: externalAccountId },
    onTokensRefreshed
  );
  const qty = Number(data?.node?.currentBalance?.quantity ?? 0);
  return { balanceCents: Math.round(qty * 100) };
};

registerProvider({
  id: 'stitch',
  isConfigured,
  listAccounts: (tokens) => listAccounts(tokens, () => {}),
  listTransactions: (tokens, args) => listTransactions(tokens, args, () => {}),
  refreshBalance: (tokens, externalAccountId) => refreshBalance(tokens, externalAccountId, () => {})
});

export { isConfigured, listAccounts, listTransactions, refreshBalance };
