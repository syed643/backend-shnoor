import admin from "../services/firebaseAdmin.js";
const firebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Authorization token missing or invalid" });
    }
    const token = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.firebase = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email,
    };

    next();
  } catch (error) {
    console.error("❌ Firebase auth error:", error.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default firebaseAuth;
