const { signup, login, getSponsorDetails, recoverPassword, resetPassword, impersonate } = require("../controllers/Auth/AuthController");
const Authenticated = require("../middlewares/auth");
const authorizeRoles = require("../middlewares/authorizeRole");

const router = require("express").Router();

router.post("/signup", signup);
router.get("/get-sponsor/:ref", getSponsorDetails);
router.post("/recover-password",recoverPassword)
router.post("/reset-password",resetPassword)
router.post("/login", login);

// Admin only impersonation
router.post("/impersonate", Authenticated, authorizeRoles("ADMIN"), impersonate);

module.exports = router;

