const crypto = require("node:crypto");
const argon2 = require("argon2");
const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);
const { rateLimit } = require("express-rate-limit");
const { pool } = require("./config/db");
const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username });
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const normalize = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
function configureAuth(app) {
  const production = process.env.NODE_ENV === "production";
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  if (process.env.TRUST_PROXY_HOPS) {
    const hops = Number(process.env.TRUST_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 1 || hops > 3)
      throw new Error(
        "TRUST_PROXY_HOPS must be 1, 2 or 3 for a known proxy topology.",
      );
    app.set("trust proxy", hops);
  }
  app.use(
    session({
      name: "osquiz.sid",
      store: new PgStore({
        pool,
        tableName: "sessions",
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.get("/api/auth/csrf", (req, res) => {
    res.set("Cache-Control", "no-store");
    req.session.csrf ||= crypto.randomBytes(32).toString("hex");
    res.json({ csrfToken: req.session.csrf });
  });
  app.use(
    wrap(async (req, res, next) => {
      if (req.session.userId) {
        const r = await pool.query(
          "select id,name,username from users where id=$1 and auth_enabled=true",
          [req.session.userId],
        );
        req.user = r.rows[0];
      }
      next();
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.path.startsWith("/auth/") && !req.user)
      return res.status(401).json({ error: "Authentication required." });
    const token = req.get("X-CSRF-Token");
    if (
      !token ||
      !/^[0-9a-f]{64}$/.test(token) ||
      !req.session.csrf ||
      token.length !== req.session.csrf.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))
    )
      return res
        .status(403)
        .json({ error: "Invalid CSRF token. Refresh and try again." });
    next();
  });
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === "test" ? 100 : 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Try again later." },
  });
  const establish = async (req, user) => {
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = user.id;
    req.session.csrf = crypto.randomBytes(32).toString("hex");
    await new Promise((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
  };
  app.post(
    "/api/auth/register",
    limiter,
    wrap(async (req, res) => {
      const { password, confirmPassword } = req.body;
      const username = normalize(req.body.username),
        email = normalize(req.body.email);
      const name =
        typeof req.body.name === "string" ? req.body.name.trim() : "";
      if ("role" in req.body)
        return res
          .status(400)
          .json({ error: "Roles cannot be assigned during registration." });
      if (!name || name.length > 100)
        return res
          .status(400)
          .json({ error: "Name must contain 1–100 characters." });
      if (
        !/^[a-z0-9][a-z0-9_]{2,29}$/.test(username) ||
        username.startsWith("legacy_")
      )
        return res.status(400).json({
          error:
            "Username must contain 3–30 letters, numbers or underscores; legacy_ is reserved.",
        });
      if (
        email.length > 254 ||
        !/^[\x21-\x7e]+$/.test(email) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
        return res.status(400).json({ error: "Enter a valid email address." });
      if (
        typeof password !== "string" ||
        password.length < 12 ||
        password.length > 128
      )
        return res
          .status(400)
          .json({ error: "Password must contain 12–128 characters." });
      if (password !== confirmPassword)
        return res.status(400).json({ error: "Passwords do not match." });
      const hash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      let user;
      try {
        user = (
          await pool.query(
            `insert into users(name,username,email,password_hash,role,auth_enabled,leaderboard_enabled) values($1,$2,$3,$4,'student',true,true) returning id,name,username`,
            [name, username, email, hash],
          )
        ).rows[0];
      } catch (e) {
        if (e.code === "23505")
          return res
            .status(409)
            .json({ error: "Username or email is already registered." });
        throw e;
      }
      await establish(req, user);
      res
        .status(201)
        .json({ user: publicUser(user), csrfToken: req.session.csrf });
    }),
  );
  // A valid dummy hash ensures unknown usernames still perform a password verification.
  const dummy = argon2.hash(crypto.randomBytes(32), {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  app.post(
    "/api/auth/login",
    limiter,
    wrap(async (req, res) => {
      const { password } = req.body;
      const username = normalize(req.body.username);
      const u = (
        await pool.query(
          "select * from users where normalize_identity(username)=$1",
          [username],
        )
      ).rows[0];
      const valid = typeof password === "string" && password.length <= 128;
      const hash =
        u?.auth_enabled && u.password_hash.startsWith("$argon2id$")
          ? u.password_hash
          : await dummy;
      const matches = await argon2
        .verify(hash, valid ? password : "invalid")
        .catch(() => false);
      if (!valid || !matches || !u?.auth_enabled)
        return res.status(401).json({ error: "Invalid username or password" });
      await establish(req, u);
      res.json({ user: publicUser(u), csrfToken: req.session.csrf });
    }),
  );
  app.get("/api/auth/me", (req, res) =>
    req.user
      ? res.json({ user: publicUser(req.user) })
      : res.status(401).json({ error: "Authentication required." }),
  );
  app.post(
    "/api/auth/logout",
    wrap(async (req, res) => {
      await new Promise((resolve, reject) =>
        req.session.destroy((e) => (e ? reject(e) : resolve())),
      );
      res.clearCookie("osquiz.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
      });
      res.json({ ok: true });
    }),
  );
}
const requireAuth = (req, res, next) =>
  req.user
    ? next()
    : res.status(401).json({ error: "Authentication required." });
module.exports = { configureAuth, requireAuth, wrap, normalize };
