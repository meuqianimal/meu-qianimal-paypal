// server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const axios = require("axios");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cookieParser());

const {
  PORT = 10000,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  APP_BASE_URL = "https://meuqianimal.com.br",
  JWT_SECRET = "change-me-please",
  NODE_ENV = "production"
} = process.env;

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.error("❌ Defina PAYPAL_CLIENT_ID e PAYPAL_CLIENT_SECRET no ambiente da Render.");
  process.exit(1);
}

const PRICES = {
  predador: { value: "4.99", currency: "BRL", label: "Predador" },
  cachorro: { value: "9.99", currency: "BRL", label: "Cachorro" }
};

app.use("/public", express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/config.js", (req, res) => {
  res.type("application/javascript").send(`window.PAYPAL_CLIENT_ID="${PAYPAL_CLIENT_ID}";`);
});

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const url = "https://api-m.paypal.com/v1/oauth2/token";
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");

  const { data } = await axios.post(url, params, {
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  return data.access_token;
}

app.post("/api/paypal/create", async (req, res) => {
  try {
    const { tipo } = req.body;
    const price = PRICES[tipo];
    if (!price) return res.status(400).json({ error: "Tipo inválido." });

    const accessToken = await getPayPalAccessToken();

    const { data } = await axios.post(
      "https://api-m.paypal.com/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: price.currency, value: price.value },
            description: `Meu QI Animal - ${price.label}`
          }
        ],
        application_context: {
          brand_name: "Meu QI Animal",
          user_action: "PAY_NOW",
          return_url: `${APP_BASE_URL}/return`,
          cancel_url: `${APP_BASE_URL}/cancel`
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ orderID: data.id });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json({ error: "Erro ao criar ordem PayPal." });
  }
});

app.post("/api/paypal/capture", async (req, res) => {
  try {
    const { orderID, tipo } = req.body;
    const price = PRICES[tipo];
    if (!orderID || !price) return res.status(400).json({ error: "Dados inválidos." });

    const accessToken = await getPayPalAccessToken();

    const { data } = await axios.post(
      `https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`,
      {},
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const completed = data.status === "COMPLETED";
    const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = capture?.amount?.value;
    const currency = capture?.amount?.currency_code;
    const payerEmail = data?.payer?.email_address || "desconhecido@usuario";

    if (!completed || amount !== price.value || currency !== price.currency) {
      return res.status(400).json({ error: "Pagamento inválido ou incompleto." });
    }

    const token = jwt.sign(
      { typ: "mqa", premium: tipo, email: payerEmail, ts: Date.now() },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("mqa_token", token, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/"
    });

    return res.json({ ok: true, premium: tipo });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json({ error: "Erro ao capturar pagamento." });
  }
});

function requirePremium(tipo) {
  return (req, res, next) => {
    try {
      const token = req.cookies?.mqa_token;
      if (!token) return res.redirect("/public/bloqueado.html");
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload?.premium !== tipo) return res.redirect("/public/bloqueado.html");
      req.user = payload;
      next();
    } catch {
      return res.redirect("/public/bloqueado.html");
    }
  };
}

app.get("/premium/predador", requirePremium("predador"), (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "predador.html"));
});
app.get("/premium/cachorro", requirePremium("cachorro"), (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "cachorro.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/healthz", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Servidor no ar em :${PORT}`);
});
