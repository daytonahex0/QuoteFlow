process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://quoteflow:quoteflow@localhost:5432/quoteflow_test";
process.env.APP_URL = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.STRIPE_PRICE_STARTER = "price_starter";
process.env.STRIPE_PRICE_GROWTH = "price_growth";
process.env.STRIPE_PRICE_PRO = "price_pro";
delete process.env.RESEND_API_KEY;
delete process.env.INBOUND_DOMAIN;
