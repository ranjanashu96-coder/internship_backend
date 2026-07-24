import { Router } from "express"; 
import { body } from "express-validator"; 
import { login, register, forgotPassword, loginRules ,refreshAccessToken,logout} from "../controllers/authController.js"; 
import { validate } from "../middleware/validate.js"; 

const r=Router();

r.post("/login",loginRules,validate,login);
r.post("/register",[body("username").trim().notEmpty(),body("email").isEmail().normalizeEmail(),body("password").isLength({min:8})],validate,register);
r.post("/forgot-password",body("email").isEmail().normalizeEmail(),validate,forgotPassword);
r.post(
  "/refresh",
  refreshAccessToken,
);

r.post(
  "/logout",
  logout,
);
export default r;
