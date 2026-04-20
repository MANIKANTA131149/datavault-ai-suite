const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "datavault-secret-key-2024";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized — missing token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.userEmail = payload.email;
    req.userName = payload.name;
    req.userRole = payload.role || "viewer";
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized — invalid token" });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
