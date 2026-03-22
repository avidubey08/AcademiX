const jwt = require("jsonwebtoken");
//This function's sole purpose is to answer the question: "Are you a logged-in user?"
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret_key");
    req.user = decoded; // Contains id, role, email, etc.
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token." });
  }
};
// This function runs after authenticate. Its purpose is to answer: "Are you allowed to do this specific action?"
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden. Insufficient permissions." });
    }
    next();
  };
};

module.exports = { authenticate, authorizeRoles };
// When a request comes in, it passes through these functions one by one. Each middleware function can:

// Execute any code (like logging the request or parsing data).

// Make changes to the request (req) or response (res) objects.

// End the request-response cycle (by sending a response back to the client immediately).

// Call next() to pass the baton to the next middleware function in the queue.