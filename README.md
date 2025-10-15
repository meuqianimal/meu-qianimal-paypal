# Meu QI Animal — PayPal + Render

## Passos rápidos
1. Suba este repositório no GitHub (público).
2. Na Render: New → Web Service → escolha este repo.
3. Configure:
   - Environment: **Node**
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. **Environment Variables** na Render:
   - `PAYPAL_CLIENT_ID` = (PayPal Live)
   - `PAYPAL_CLIENT_SECRET` = (PayPal Live)
   - `APP_BASE_URL` = `https://meuqianimal.com.br`
   - `JWT_SECRET` = uma senha forte
   - `NODE_ENV` = `production`

Abra a URL (seu domínio) e teste o fluxo.
